import type { SolverEndpoint } from "./domain_models/gpu-study";
import { serveThermalCalculations } from "./delivery/thermal-solver-worker";
import { ThermalCalculation } from "./services/thermal-calculation";

serveThermalCalculations(self as unknown as SolverEndpoint, new ThermalCalculation());
