import {
  ThermalSimulationError,
  type SolverRequest,
  type SolverResponse,
  type ThermalDataset,
  type ThermalSettings,
  type ThermalSimulator,
} from "../domain_models/gpu-study";

/** Keeps one worker; superseding a running case cancels its CPU work, not just its UI. */
export class BrowserThermalSimulator implements ThermalSimulator {
  private worker: Worker | null = null;
  private nextId = 0;
  private pending: { id: number; resolve: (dataset: ThermalDataset) => void; reject: (error: Error) => void } | null = null;

  constructor(private readonly createWorker: () => Worker) {}

  calculate(settings: ThermalSettings): Promise<ThermalDataset> {
    if (this.pending) this.stop("Ensaio substituído por uma nova configuração.");
    const { promise, resolve, reject } = Promise.withResolvers<ThermalDataset>();
    try {
      if (!this.worker) {
        this.worker = this.createWorker();
        this.worker.onmessage = ({ data }: MessageEvent<SolverResponse>) => {
          const pending = this.pending;
          if (!pending || data.id !== pending.id) return;
          this.pending = null;
          if (data.type === "completed") pending.resolve(data.dataset);
          else pending.reject(new ThermalSimulationError(data.message));
        };
        this.worker.onerror = (event) => {
          event.preventDefault();
          this.stop(event.message || "O worker do cálculo térmico falhou.");
        };
        this.worker.onmessageerror = () => this.stop("Não foi possível receber o campo térmico calculado.");
      }
      const id = ++this.nextId;
      this.pending = { id, resolve, reject };
      const request: SolverRequest = { id, settings };
      this.worker.postMessage(request);
    } catch (error) {
      this.stop(error instanceof Error ? error.message : "Não foi possível iniciar o cálculo térmico.");
      reject(error instanceof Error ? error : new ThermalSimulationError("Falha ao iniciar o cálculo térmico."));
    }
    return promise;
  }

  private stop(message: string): void {
    this.worker?.terminate();
    this.worker = null;
    const pending = this.pending;
    this.pending = null;
    pending?.reject(new ThermalSimulationError(message));
  }

  dispose(): void { this.stop("Simulação encerrada."); }
}
