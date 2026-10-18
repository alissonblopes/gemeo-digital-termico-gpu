import type { ThermalDataset, ThermalSettings } from "../domain_models/gpu-study";
import { simulateThermalStudy } from "../engines/thermal-simulation";

/** Worker-side use case; the engine owns equations, delivery owns messaging. */
export class ThermalCalculation {
  calculate(settings: ThermalSettings): ThermalDataset {
    return simulateThermalStudy(settings);
  }
}
