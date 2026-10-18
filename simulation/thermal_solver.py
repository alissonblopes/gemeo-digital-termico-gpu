"""2-D finite-volume base conduction + analytical fins + lumped copper/package.

Temperatures are scenario predictions, not measured/validated RTX3060 temperatures.
The underside is adiabatic except for copper input. Uniform prescribed h applies
on uncovered top, base perimeter and fin sides/tips; fin end faces are omitted.
Fins have quasi-steady efficiency but their full mass is lumped at local base
nodes for transient storage. Copper is isothermal. Holes are omitted in the
thermal grid (their exact volume is reported separately). No CFD or heat pipes.
"""
from __future__ import annotations

import copy
import csv
import json
from dataclasses import dataclass
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.sparse import coo_matrix, diags
from scipy.sparse.linalg import spsolve, factorized
from CoolProp.CoolProp import PropsSI


@dataclass
class Model:
    K: object
    capacity: np.ndarray
    convection: np.ndarray
    aluminium_mean_weights: np.ndarray
    x: np.ndarray
    y: np.ndarray
    nx: int
    ny: int
    copper: int
    source: int
    metadata: dict


def overlap(edges, low, high):
    return np.maximum(0.0, np.minimum(edges[1:], high) - np.maximum(edges[:-1], low))


def assemble(p, grid_mm=1.5, h=None):
    g, t = p["geometry_mm"], p["thermal"]
    al, cu = p["materials"]["aluminium"], p["materials"]["copper"]
    h = t["h_W_m2K"] if h is None else h
    L, W, b, H, f, pitch = [g[key] * 1e-3 for key in ["base_length", "base_width", "base_thickness", "fin_height", "fin_thickness", "fin_pitch"]]
    nx, ny = int(round(L / (grid_mm * 1e-3))), int(round(W / (grid_mm * 1e-3)))
    xe, ye = np.linspace(0, L, nx + 1), np.linspace(0, W, ny + 1)
    dx, dy = L / nx, W / ny
    n = nx * ny
    ids = np.arange(n).reshape(ny, nx)
    rows, cols, vals = [], [], []
    diagonal = np.zeros(n + 2)

    def connect(a, b_ids, conductance):
        a, b_ids = np.atleast_1d(a).astype(int), np.atleast_1d(b_ids).astype(int)
        c = np.broadcast_to(conductance, a.shape)
        rows.extend(np.concatenate([a, b_ids]).tolist())
        cols.extend(np.concatenate([b_ids, a]).tolist())
        vals.extend(np.concatenate([-c, -c]).tolist())
        np.add.at(diagonal, a, c)
        np.add.at(diagonal, b_ids, c)

    connect(ids[:, :-1].ravel(), ids[:, 1:].ravel(), al["k_W_mK"] * b * dy / dx)
    connect(ids[:-1, :].ravel(), ids[1:, :].ravel(), al["k_W_mK"] * b * dx / dy)
    root_width_by_row = np.zeros(ny)
    margin = (W - ((g["fin_count"] - 1) * pitch + f)) / 2
    for i in range(g["fin_count"]):
        root_width_by_row += overlap(ye, margin + i * pitch, margin + i * pitch + f)
    root_area = np.repeat((root_width_by_row * dx)[:, None], nx, axis=1).ravel()
    m = np.sqrt(2 * h / (al["k_W_mK"] * f))
    lc = H + f / 2
    efficiency = float(np.tanh(m * lc) / (m * lc))
    fin_area_by_cell = root_area / f * (2 * H + f)
    bare_area = dx * dy - root_area
    conv = np.zeros(n + 2)
    conv[:n] = h * (bare_area + efficiency * fin_area_by_cell)
    conv[ids[:, 0]] += h * b * dy
    conv[ids[:, -1]] += h * b * dy
    conv[ids[0, :]] += h * b * dx
    conv[ids[-1, :]] += h * b * dx
    diagonal += conv
    copper_L, copper_W, copper_b = [g[key] * 1e-3 for key in ["copper_length", "copper_width", "copper_thickness"]]
    ox = overlap(xe, (L - copper_L) / 2, (L + copper_L) / 2)
    oy = overlap(ye, (W - copper_W) / 2, (W + copper_W) / 2)
    copper_overlap = np.outer(oy, ox).ravel()
    area_resistance = copper_b / (2 * cu["k_W_mK"]) + b / (2 * al["k_W_mK"]) + t["copper_aluminium_contact_r_m2K_W"]
    contact_ids = np.flatnonzero(copper_overlap > 0)
    connect(contact_ids, np.full(contact_ids.size, n), copper_overlap[contact_ids] / area_resistance)
    source_area = g["source_length"] * g["source_width"] * 1e-6
    tim_R = g["tim_thickness"] * 1e-3 / (p["materials"]["tim"]["k_W_mK"] * source_area)
    source_R = t["source_package_R_K_W"] + t["source_contact_R_K_W"] + tim_R + copper_b / (2 * cu["k_W_mK"] * source_area)
    connect(np.array([n]), np.array([n + 1]), 1 / source_R)
    rows.extend(range(n + 2)); cols.extend(range(n + 2)); vals.extend(diagonal.tolist())
    K = coo_matrix((vals, (rows, cols)), shape=(n + 2, n + 2)).tocsc()
    capacity = np.zeros(n + 2)
    capacity[:n] = al["rho_kg_m3"] * al["cp_J_kgK"] * (dx * dy * b + root_area * H)
    capacity[n] = copper_L * copper_W * copper_b * cu["rho_kg_m3"] * cu["cp_J_kgK"]
    capacity[n + 1] = t["source_package_C_J_K"]
    aluminium_mean_weights = (dx * dy * b + efficiency * root_area * H) / (L * W * b + root_area.sum() * H)
    holes_m3 = len(g["mounting_hole_centres"]) * np.pi * (g["mounting_hole_diameter"] * 0.0005) ** 2 * b
    meta = {"grid_mm": grid_mm, "grid_shape": [ny, nx], "unknowns": n + 2,
            "h_W_m2K": h, "fin_efficiency": efficiency,
            "fin_area_m2": float(fin_area_by_cell.sum()), "bare_area_m2": float(bare_area.sum() + 2 * (L + W) * b),
            "effective_area_m2": float(conv.sum() / h), "global_convection_W_K": float(conv.sum()),
            "source_to_copper_R_K_W": source_R, "tim_R_K_W": tim_R,
            "copper_to_base_area_resistance_m2K_W": area_resistance,
            "aluminium_mass_without_holes_kg": float(capacity[:n].sum() / al["cp_J_kgK"]),
            "copper_mass_kg": float(capacity[n] / cu["cp_J_kgK"]),
            "omitted_hole_volume_m3": float(holes_m3),
            "fin_transverse_Biot": h * f / (2 * al["k_W_mK"]),
            "copper_contact_area_m2": float(copper_overlap.sum())}
    return Model(K, capacity, conv, aluminium_mean_weights, (xe[:-1] + xe[1:]) / 2, (ye[:-1] + ye[1:]) / 2, nx, ny, n, n + 1, meta)


def equilibrium(model, power_W, ambient_C):
    load = np.zeros(model.source + 1)
    load[model.source] = power_W
    theta = spsolve(model.K, load)
    heat_out = float(model.convection @ theta)
    temperature = theta + ambient_C
    return temperature, {"source_C": float(temperature[model.source]), "copper_C": float(temperature[model.copper]),
                         "base_max_C": float(temperature[:model.copper].max()),
                         "base_min_C": float(temperature[:model.copper].min()),
                         "base_mean_C": float(temperature[:model.copper].mean()),
                         "aluminium_volume_mean_C": float(ambient_C + model.aluminium_mean_weights @ theta[:model.copper]),
                         "heat_out_W": heat_out, "energy_residual_W": float(power_W - heat_out),
                         "effective_source_to_ambient_R_K_W": float(theta[model.source] / power_W) if power_W else None}


def transient(model, p, dt=None):
    t = p["thermal"]
    dt = t["step_s"] if dt is None else dt
    steps = int(round(t["duration_s"] / dt))
    export_every = int(round(t["export_interval_s"] / dt))
    theta = np.full(model.source + 1, t["initial_C"] - t["ambient_C"])
    load = np.zeros_like(theta); load[model.source] = t["power_W"]
    solve = factorized(model.K + diags(model.capacity / dt, format="csc"))
    samples = []
    residual_max = 0.0
    def sample(time):
        return [time, theta[model.source] + t["ambient_C"], theta[model.copper] + t["ambient_C"],
                theta[:model.copper].mean() + t["ambient_C"], theta[:model.copper].max() + t["ambient_C"],
                model.aluminium_mean_weights @ theta[:model.copper] + t["ambient_C"]]
    samples.append(sample(0.0))
    cumulative_out_J = 0.0
    initial_energy_J = float(model.capacity @ theta)
    for step in range(1, steps + 1):
        before = theta
        theta = solve(load + model.capacity / dt * before)
        out = float(model.convection @ theta)
        cumulative_out_J += dt * out
        residual = float(model.capacity @ ((theta - before) / dt) - (t["power_W"] - out))
        residual_max = max(residual_max, abs(residual))
        if step % export_every == 0 or step == steps:
            samples.append(sample(step * dt))
    stored_J = float(model.capacity @ theta) - initial_energy_J
    return np.array(samples), {"dt_s": dt, "grid_mm": model.metadata["grid_mm"], "duration_s": steps * dt,
                               "max_step_energy_residual_W": residual_max,
                               "cumulative_energy_residual_J": t["power_W"] * steps * dt - cumulative_out_J - stored_J,
                               "stored_energy_J": stored_J, "rejected_energy_J": cumulative_out_J,
                               "final_source_C": float(theta[model.source] + t["ambient_C"])}


def write_csv(path, rows, fields=None):
    with path.open("w", newline="", encoding="utf-8") as stream:
        if fields is None:
            writer = csv.DictWriter(stream, fieldnames=list(rows[0])); writer.writeheader(); writer.writerows(rows)
        else:
            writer = csv.writer(stream); writer.writerow(fields); writer.writerows(rows)


def run_study(p, output_root):
    root = Path(output_root)
    results, figures = root / "results", root / "figures"
    results.mkdir(parents=True, exist_ok=True); figures.mkdir(parents=True, exist_ok=True)
    t = p["thermal"]
    mesh = []
    for grid in t["grid_mm"]:
        model = assemble(p, grid)
        _, eq = equilibrium(model, t["power_W"], t["ambient_C"])
        mesh.append({"grid_mm": grid, "unknowns": model.metadata["unknowns"], **eq})
    model = assemble(p, 1.5)
    temperature, eq = equilibrium(model, t["power_W"], t["ambient_C"])
    samples, transient_info = transient(model, p)
    timestep = []
    for dt in [1.0, 0.5, 0.25]:
        data, info = (samples, transient_info) if dt == t["step_s"] else transient(model, p, dt)
        timestep.append({"dt_s": dt, "source_at_10s_C": float(data[np.argmin(abs(data[:, 0] - 10)), 1]), "source_at_60s_C": float(data[np.argmin(abs(data[:, 0] - 60)), 1]), "final_source_C": info["final_source_C"]})
    scenarios = []
    for h in t["sensitivity_h_W_m2K"]:
        h_model = model if h == t["h_W_m2K"] else assemble(p, 1.5, h)
        unit_temperature, _ = equilibrium(h_model, 1.0, 0.0)
        for power in t["sensitivity_power_W"]:
            for ambient in t["sensitivity_ambient_C"]:
                source = float(ambient + power * unit_temperature[h_model.source])
                scenarios.append({"h_W_m2K": h, "power_W": power, "ambient_C": ambient, "source_C": source,
                                  "base_max_C": float(ambient + power * unit_temperature[:h_model.copper].max()),
                                  "meets_adopted_85C_goal": source <= t["design_limit_C"]})
    air = {key: float(PropsSI(code, "T", t["ambient_C"] + 273.15, "P", 101325, "Air"))
           for key, code in [("density_kg_m3", "D"), ("viscosity_Pa_s", "V"), ("k_W_mK", "L"), ("cp_J_kgK", "C")]}
    air["assumed_context_velocity_m_s"] = 2.0
    air["Re_over_180mm_at_assumed_2m_s"] = air["density_kg_m3"] * 2.0 * p["geometry_mm"]["base_length"] * 1e-3 / air["viscosity_Pa_s"]
    summary = {"method": __doc__, "parameters": p, "model": model.metadata, "equilibrium": eq,
               "transient": transient_info, "mesh_convergence": mesh, "timestep_convergence": timestep, "air_CoolProp": air,
               "mesh_selected_vs_finest_source_difference_K": abs(eq["source_C"] - mesh[-1]["source_C"]),
               "end_vs_steady_source_difference_K": abs(eq["source_C"] - transient_info["final_source_C"]),
               "meets_adopted_85C_goal": eq["source_C"] <= t["design_limit_C"],
               "provenance": "Python execution; no commercial GPU validation. Colab-compatible notebook executed locally, not authenticated Google runtime."}
    (results / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write_csv(results / "scenarios.csv", scenarios)
    write_csv(results / "grid_convergence.csv", mesh)
    write_csv(results / "timestep_convergence.csv", timestep)
    write_csv(results / "transient.csv", samples, ["time_s", "source_C", "copper_C", "base_mean_C", "base_max_C", "aluminium_volume_mean_C"])
    playback = {"version": 1, "source": "Original didactic180x90x29mm heatsink, Al6063-T6/CuC11000; 2D FVM+analytical fins, equivalent170W source, h80W/m2K assumed,25C ambient. Not MSI RTX3060 validation. gpu=equivalent package, base=mean copper, heatsink=volume-mean aluminium including analytical fin profiles. Visual GPU geometry is different from this study.",
                "timesSeconds": samples[:, 0].tolist(), "temperaturesC": {"gpu": samples[:, 1].tolist(), "base": samples[:, 2].tolist(), "heatsink": samples[:, 5].tolist()}}
    (results / "gpu-twin-results.json").write_text(json.dumps(playback, ensure_ascii=False) + "\n", encoding="utf-8")
    plt.rcParams.update({"font.size": 10, "figure.dpi": 150, "axes.grid": False})
    fig, ax = plt.subplots(figsize=(9, 4.8))
    im = ax.imshow(temperature[:model.copper].reshape(model.ny, model.nx), origin="lower", extent=[0, 180, 0, 90], cmap="inferno", aspect="equal")
    from matplotlib.patches import Rectangle
    ax.add_patch(Rectangle((70, 25), 40, 40, fill=False, edgecolor="cyan", linewidth=1.2, label="Contato do cobre40x40mm"))
    ax.set(xlabel="Comprimento da base (mm)", ylabel="Largura da base (mm)", title="Temperatura da base de alumínio — equilíbrio do cenário")
    fig.colorbar(im, ax=ax, label="Temperatura (°C)"); ax.legend(loc="upper right", fontsize=8)
    fig.tight_layout(); fig.savefig(figures / "temperature_map.png"); plt.close(fig)
    fig, ax = plt.subplots(figsize=(8, 4.6))
    for column, label in [(1, "Fonte equivalente"), (2, "Base de cobre"), (3, "Média da base de alumínio")]:
        ax.plot(samples[:, 0], samples[:, column], label=label)
    ax.axhline(t["design_limit_C"], color="red", linestyle="--", label="Meta adotada85°C")
    ax.set(xlabel="Tempo (s)", ylabel="Temperatura (°C)", title="Aquecimento sob carga constante170W")
    ax.legend(fontsize=8); ax.grid(alpha=0.25); fig.tight_layout(); fig.savefig(figures / "transient.png"); plt.close(fig)
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.5), sharey=True)
    for ax, ambient in zip(axes, [25.0, 35.0]):
        for power in t["sensitivity_power_W"]:
            selected = [s for s in scenarios if s["power_W"] == power and s["ambient_C"] == ambient]
            ax.plot([s["h_W_m2K"] for s in selected], [s["source_C"] for s in selected], "o-", label=f"{power:g}W")
        ax.axhline(t["design_limit_C"], color="red", linestyle="--")
        ax.set(xlabel="h prescrito (W/m²K)", title=f"Ambiente{ambient:g}°C"); ax.grid(alpha=0.25)
    axes[0].set_ylabel("Temperatura da fonte equivalente (°C)"); axes[1].legend(fontsize=8)
    fig.suptitle("Sensibilidade — h não é uma vazão calculada"); fig.tight_layout(); fig.savefig(figures / "sensitivity.png"); plt.close(fig)
    fig, ax = plt.subplots(figsize=(7, 4.3))
    ax.plot([r["grid_mm"] for r in mesh], [r["source_C"] for r in mesh], "o-")
    ax.invert_xaxis(); ax.set(xlabel="Tamanho da célula (mm)", ylabel="Temperatura da fonte (°C)", title="Convergência espacial do modelo reduzido"); ax.grid(alpha=0.25)
    fig.tight_layout(); fig.savefig(figures / "grid_convergence.png"); plt.close(fig)
    if abs(eq["energy_residual_W"]) > 1e-6 or transient_info["max_step_energy_residual_W"] > 1e-5:
        raise RuntimeError("Energy balance did not close within numerical tolerance")
    return summary


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    parameters = json.loads((root / "parameters.json").read_text(encoding="utf-8"))
    result = run_study(parameters, root)
    print(json.dumps({key: result[key] for key in ["equilibrium", "transient", "mesh_selected_vs_finest_source_difference_K", "meets_adopted_85C_goal"]}, indent=2))
