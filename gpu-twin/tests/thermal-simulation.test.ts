import { beforeAll, describe, expect, test } from "bun:test";
import { COOLING_GEOMETRY, DEFAULT_THERMAL_SETTINGS, type ThermalDataset } from "../src/domain_models/gpu-study";
import { simulateThermalStudy } from "../src/engines/thermal-simulation";
import { advancePlayback, sampleThermalFrame } from "../src/engines/thermal-playback";

let baseline: ThermalDataset;
beforeAll(() => { baseline = simulateThermalStudy(DEFAULT_THERMAL_SETTINGS); });

describe("reduced thermal model", () => {
  test("zero input leaves every modeled temperature at the chosen ambient", () => {
    const result = simulateThermalStudy({ ...DEFAULT_THERMAL_SETTINGS, powerW: 0, ambientC: 37 });
    for (const series of Object.values(result.temperaturesC)) expect(series.every((value) => value === 37)).toBe(true);
    for (const field of [result.baseField.temperaturesC, result.heatsinkField.temperaturesC, result.pipeTemperaturesC]) {
      expect(field.every((value) => value === 37)).toBe(true);
    }
    expect(result.equilibrium.heatLossW).toBe(0);
    expect(result.equilibrium.resistanceKW).toBeNull();
  });

  test("conserves energy and warms monotonically without exceeding its steady source", () => {
    expect(baseline.equilibrium.heatLossW).toBeCloseTo(DEFAULT_THERMAL_SETTINGS.powerW, 5);
    expect(baseline.diagnostics.maxStepEnergyResidualW).toBeLessThan(0.001);
    for (const series of Object.values(baseline.temperaturesC)) {
      for (let i = 0; i < series.length; i++) {
        expect(series[i]).toBeGreaterThanOrEqual((series[i - 1] ?? DEFAULT_THERMAL_SETTINGS.ambientC) - 1e-6);
        expect(series[i]).toBeLessThanOrEqual(baseline.equilibrium.sourceC + 1e-6);
      }
    }
  });

  test("power scales temperature rise while ambient shifts it without changing resistance", () => {
    const half = simulateThermalStudy({ ...DEFAULT_THERMAL_SETTINGS, powerW: 85, ambientC: 35 });
    expect(half.equilibrium.sourceC - 35).toBeCloseTo((baseline.equilibrium.sourceC - 25) / 2, 6);
    expect(half.equilibrium.resistanceKW).toBeCloseTo(baseline.equilibrium.resistanceKW!, 7);
    for (let i = 0; i < half.timesSeconds.length; i++) {
      expect(half.temperaturesC.gpu![i] - 35).toBeCloseTo((baseline.temperaturesC.gpu![i] - 25) / 2, 5);
    }
  });

  test("resolves the local hotspot instead of assigning one color to the entire spreader", () => {
    const { grid, temperaturesC } = baseline.heatsinkField;
    const offset = (baseline.timesSeconds.length - 1) * grid.nx * grid.nz;
    const sourceX = Math.floor((COOLING_GEOMETRY.base.centerX - grid.originXmm) / grid.lengthMm * grid.nx);
    const middleZ = Math.floor(grid.nz / 2);
    expect(temperaturesC[offset + middleZ * grid.nx + sourceX]).toBeGreaterThan(temperaturesC[offset + middleZ * grid.nx + grid.nx - 1] + 5);
    for (let z = 0; z < grid.nz; z++) for (let x = 0; x < grid.nx; x++) {
      expect(temperaturesC[offset + z * grid.nx + x]).toBeCloseTo(temperaturesC[offset + (grid.nz - 1 - z) * grid.nx + x], 4);
    }
  });

  test("copper improves spreading at a mass penalty and stronger convection cools the source", () => {
    const copper = simulateThermalStudy({ ...DEFAULT_THERMAL_SETTINGS, preset: "copper" });
    const aluminium = simulateThermalStudy({ ...DEFAULT_THERMAL_SETTINGS, preset: "aluminium" });
    const weakerAirflow = simulateThermalStudy({ ...DEFAULT_THERMAL_SETTINGS, convectionWm2K: 40 });
    expect(copper.equilibrium.sourceC).toBeLessThan(baseline.equilibrium.sourceC);
    expect(baseline.equilibrium.sourceC).toBeLessThan(aluminium.equilibrium.sourceC);
    expect(copper.diagnostics.metalMassKg).toBeGreaterThan(baseline.diagnostics.metalMassKg);
    expect(baseline.diagnostics.metalMassKg).toBeGreaterThan(aluminium.diagnostics.metalMassKg);
    expect(copper.diagnostics.finEfficiency).toBeGreaterThan(baseline.diagnostics.finEfficiency);
    expect(weakerAirflow.equilibrium.sourceC).toBeGreaterThan(baseline.equilibrium.sourceC);
  });

  test("more equivalent pipes reduce spreading resistance; overload is flagged, not silently capped", () => {
    const two = simulateThermalStudy({ ...DEFAULT_THERMAL_SETTINGS, heatPipeCount: 2 });
    const six = simulateThermalStudy({ ...DEFAULT_THERMAL_SETTINGS, heatPipeCount: 6 });
    expect(two.equilibrium.sourceC).toBeGreaterThan(baseline.equilibrium.sourceC);
    expect(six.equilibrium.sourceC).toBeLessThan(baseline.equilibrium.sourceC);
    const overloaded = simulateThermalStudy({ ...DEFAULT_THERMAL_SETTINGS, powerW: 300, convectionWm2K: 5 });
    expect(overloaded.equilibrium.pipeFlowsW.some((value) => value > COOLING_GEOMETRY.pipe.assumedCapacityW)).toBe(true);
    expect(overloaded.equilibrium.pipeCapacityExceeded).toBe(true);
    expect(overloaded.equilibrium.heatLossW).toBeCloseTo(300, 5);
    expect(overloaded.temperaturesC.gpu!.at(-1)!).toBeLessThan(overloaded.equilibrium.sourceC - 10);
  });

  test("mesh refinement changes steady hotspot by less than 1 °C and time refinement by less than 0.1 °C at 20 s", () => {
    const finerMesh = simulateThermalStudy(DEFAULT_THERMAL_SETTINGS, { plateNx: 81, plateNz: 49, baseNx: 29, baseNz: 29, durationSeconds: 20 });
    const finerTime = simulateThermalStudy(DEFAULT_THERMAL_SETTINGS, { stepSeconds: 0.25, durationSeconds: 20 });
    expect(Math.abs(finerMesh.equilibrium.sourceC - baseline.equilibrium.sourceC)).toBeLessThan(1);
    expect(Math.abs(finerMesh.equilibrium.baseMaxC - baseline.equilibrium.baseMaxC)).toBeLessThan(1);
    expect(Math.abs(finerTime.temperaturesC.gpu!.at(-1)! - sampleThermalFrame(baseline, 20).temperatures.gpu!)).toBeLessThan(0.1);
  });

  test("rejects nonphysical inputs and incompatible sampling rather than producing a result", () => {
    for (const powerW of [-1, 301, NaN, Infinity]) {
      expect(() => simulateThermalStudy({ ...DEFAULT_THERMAL_SETTINGS, powerW })).toThrow();
    }
    expect(() => simulateThermalStudy({ ...DEFAULT_THERMAL_SETTINGS, convectionWm2K: 0 })).toThrow();
    expect(() => simulateThermalStudy(DEFAULT_THERMAL_SETTINGS, { stepSeconds: 0.7 })).toThrow();
  });
});

test("timeline clamps at endpoints, preserves exact samples, interpolates and stops at the end", () => {
  expect(sampleThermalFrame(baseline, -10).temperatures.gpu).toBe(25);
  expect(sampleThermalFrame(baseline, 400).temperatures.gpu).toBe(baseline.temperaturesC.gpu!.at(-1));
  expect(sampleThermalFrame(baseline, 2).temperatures.gpu).toBe(baseline.temperaturesC.gpu![1]);
  expect(sampleThermalFrame(baseline, 1).temperatures.gpu).toBeCloseTo((25 + baseline.temperaturesC.gpu![1]) / 2, 10);
  expect(advancePlayback(baseline, 299, 1, 10)).toBe(300);
  expect(advancePlayback(baseline, 20, -1, 10)).toBe(20);
});
