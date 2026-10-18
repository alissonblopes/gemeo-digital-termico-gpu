import type { SolverEndpoint } from "../domain_models/gpu-study";
import type { ThermalCalculation } from "../services/thermal-calculation";

export function serveThermalCalculations(endpoint: SolverEndpoint, calculation: ThermalCalculation): void {
  endpoint.onmessage = ({ data: request }) => {
    try {
      const dataset = calculation.calculate(request.settings);
      endpoint.postMessage({ id: request.id, type: "completed", dataset }, [
        dataset.baseField.temperaturesC.buffer as ArrayBuffer,
        dataset.heatsinkField.temperaturesC.buffer as ArrayBuffer,
        dataset.pipeTemperaturesC.buffer as ArrayBuffer,
      ]);
    } catch (error) {
      endpoint.postMessage({ id: request.id, type: "failed", message: error instanceof Error ? error.message : "Não foi possível calcular o ensaio térmico." }, []);
    }
  };
}
