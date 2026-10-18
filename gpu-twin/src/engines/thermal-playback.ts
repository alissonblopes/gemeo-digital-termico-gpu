import {
  THERMAL_PART_IDS,
  type ThermalDataset,
  type ThermalSample,
  type TemperatureSnapshot,
  type PartId,
} from "../domain_models/gpu-study";

export function sampleThermalFrame(
  dataset: ThermalDataset,
  time: number,
): { sample: ThermalSample; temperatures: TemperatureSnapshot; heatLossW: number } {
  const times = dataset.timesSeconds;
  const last = times.length - 1;
  const clampedTime = Math.min(times[last], Math.max(times[0], time));
  let left = 0, right = 0, fraction = 0;
  if (clampedTime >= times[last]) left = right = last;
  else if (clampedTime > times[0]) {
    let low = 0, high = last;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (times[middle] < clampedTime) low = middle + 1;
      else high = middle;
    }
    right = low;
    left = times[low] === clampedTime ? low : low - 1;
    fraction = left === right ? 0 : (clampedTime - times[left]) / (times[right] - times[left]);
  }
  const temperatures: Partial<Record<PartId, number>> = {};
  for (const id of THERMAL_PART_IDS) {
    const series = dataset.temperaturesC[id];
    if (series) temperatures[id] = series[left] + (series[right] - series[left]) * fraction;
  }
  return {
    sample: { left, right, fraction },
    temperatures,
    heatLossW: dataset.heatLossW[left] + (dataset.heatLossW[right] - dataset.heatLossW[left]) * fraction,
  };
}

export function advancePlayback(
  dataset: ThermalDataset,
  time: number,
  elapsed: number,
  speed: number,
): number {
  return Math.min(
    dataset.timesSeconds.at(-1)!,
    time + Math.max(0, elapsed) * speed,
  );
}
