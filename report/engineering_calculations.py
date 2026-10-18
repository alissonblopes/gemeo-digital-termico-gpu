"""Reproducible screening calculations; not a certified mechanical design or full LCA."""
from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def calculate(parameters: dict) -> dict:
    g = parameters["geometry_mm"]
    al, cu = (parameters["materials"][name] for name in ("aluminium", "copper"))
    e = parameters["environmental"]
    hole_volume_mm3 = len(g["mounting_hole_centres"]) * math.pi * (g["mounting_hole_diameter"] / 2) ** 2 * g["base_thickness"]
    aluminium_volume_mm3 = (g["base_length"] * g["base_width"] * g["base_thickness"]
                            + g["fin_count"] * g["base_length"] * g["fin_thickness"] * g["fin_height"]
                            - hole_volume_mm3)
    copper_volume_mm3 = g["copper_length"] * g["copper_width"] * g["copper_thickness"]
    aluminium_mass_kg = aluminium_volume_mm3 * 1e-9 * al["rho_kg_m3"]
    copper_mass_kg = copper_volume_mm3 * 1e-9 * cu["rho_kg_m3"]
    total_volume_m3 = (aluminium_volume_mm3 + copper_volume_mm3) * 1e-9
    all_aluminium_mass_kg = total_volume_m3 * al["rho_kg_m3"]
    all_copper_mass_kg = total_volume_m3 * cu["rho_kg_m3"]
    delta_T_K = parameters["thermal"]["design_limit_C"] - parameters["thermal"]["ambient_C"]
    fixing_span_mm = max(x for x, _ in g["mounting_hole_centres"]) - min(x for x, _ in g["mounting_hole_centres"])
    al_stress_Pa = al["E_Pa"] * al["alpha_per_K"] * delta_T_K
    cu_stress_Pa = cu["E_Pa"] * cu["alpha_per_K"] * delta_T_K
    annual_kWh = parameters["thermal"]["power_W"] * e["hours_per_year"] / 1000
    alternative_kWh = e["alternative_power_W"] * e["hours_per_year"] / 1000
    tim_area_m2 = g["source_length"] * g["source_width"] * 1e-6
    tim_resistance_K_W = g["tim_thickness"] * 1e-3 / (parameters["materials"]["tim"]["k_W_mK"] * tim_area_m2)
    return {
        "provenance": "Calculated from parameters.json; dimensions in mm converted explicitly to SI. No measured data.",
        "geometry": {
            "aluminium_volume_mm3": aluminium_volume_mm3,
            "copper_volume_mm3": copper_volume_mm3,
            "hole_volume_mm3": hole_volume_mm3,
            "metal_envelope_mm": [g["base_length"], g["base_width"], g["copper_thickness"] + g["base_thickness"] + g["fin_height"]],
            "fin_array_width_mm": (g["fin_count"] - 1) * g["fin_pitch"] + g["fin_thickness"],
            "fin_side_margin_mm": (g["base_width"] - ((g["fin_count"] - 1) * g["fin_pitch"] + g["fin_thickness"])) / 2,
            "aluminium_mass_kg": aluminium_mass_kg,
            "copper_mass_kg": copper_mass_kg,
            "total_metal_mass_kg": aluminium_mass_kg + copper_mass_kg,
            "all_aluminium_same_geometry_mass_kg": all_aluminium_mass_kg,
            "all_copper_same_geometry_mass_kg": all_copper_mass_kg,
        },
        "cost_scenario": {
            "hybrid_raw_material_R": aluminium_mass_kg * e["aluminium_price_R_per_kg"] + copper_mass_kg * e["copper_price_R_per_kg"],
            "all_aluminium_raw_material_R": all_aluminium_mass_kg * e["aluminium_price_R_per_kg"],
            "all_copper_raw_material_R": all_copper_mass_kg * e["copper_price_R_per_kg"],
            "caveat": "Illustrative prices in parameters, not supplier quotes. Same geometry, no manufacturing or hardware costs; no full-copper thermal simulation implied.",
        },
        "interface": {
            "tim_area_m2": tim_area_m2,
            "tim_resistance_K_W": tim_resistance_K_W,
            "tim_drop_at_nominal_power_K": tim_resistance_K_W * parameters["thermal"]["power_W"],
        },
        "mechanical_screening": {
            "uniform_delta_T_K": delta_T_K,
            "fixing_span_mm": fixing_span_mm,
            "aluminium_free_expansion_over_fixing_span_mm": al["alpha_per_K"] * fixing_span_mm * delta_T_K,
            "copper_free_expansion_over_40mm_mm": cu["alpha_per_K"] * g["copper_length"] * delta_T_K,
            "aluminium_copper_mismatch_over_40mm_mm": (al["alpha_per_K"] - cu["alpha_per_K"]) * g["copper_length"] * delta_T_K,
            "aluminium_fully_restrained_uniaxial_stress_MPa": al_stress_Pa / 1e6,
            "copper_fully_restrained_uniaxial_stress_MPa": cu_stress_Pa / 1e6,
            "aluminium_yield_screening_factor": al["yield_Pa"] / al_stress_Pa,
            "adopted_screening_target_factor": 2.0,
            "delta_T_limit_for_factor_two_K": al["yield_Pa"] / (2 * al["E_Pa"] * al["alpha_per_K"]),
            "caveat": "Uniform60K heating and fully restrained uniaxial linear elasticity are hypothetical screens, not computed fastener/solder stresses or certified safety factors. Free expansion gives zero stress. Geometry alone does not define joint restraint. No cycle-to-failure prediction.",
        },
        "operating_environment_scenario": {
            "nominal_annual_kWh": annual_kWh,
            "alternative_annual_kWh": alternative_kWh,
            "annual_saving_kWh": annual_kWh - alternative_kWh,
            "annual_saving_percent": 100 * (1 - alternative_kWh / annual_kWh),
            "nominal_annual_kgCO2e": annual_kWh * e["grid_factor_kgCO2e_kWh"],
            "alternative_annual_kgCO2e": alternative_kWh * e["grid_factor_kgCO2e_kWh"],
            "annual_saving_kgCO2e": (annual_kWh - alternative_kWh) * e["grid_factor_kgCO2e_kWh"],
            "five_year_nominal_kWh": annual_kWh * e["years"],
            "five_year_saving_kgCO2e": (annual_kWh - alternative_kWh) * e["grid_factor_kgCO2e_kWh"] * e["years"],
            "carbon_factor_sensitivity": [{"factor_kgCO2e_kWh": f, "annual_nominal_kgCO2e": annual_kWh * f} for f in e["grid_factor_sensitivity_kgCO2e_kWh"]],
            "caveat": "Continuous nominal board-power operation, not measured inference. Illustrative grid factor, board only; no PUE estimate, no double-counting of fans, no full LCA. Throughput impact of power cap not established.",
        },
    }


if __name__ == "__main__":
    parameters = json.loads((ROOT / "parameters.json").read_text(encoding="utf-8"))
    result = calculate(parameters)
    destination = ROOT / "report" / "engineering_results.json"
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
