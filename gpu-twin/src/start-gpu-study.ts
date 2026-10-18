import { mountGpuStudyShell, GpuStudyPage } from "./delivery/gpu-study-page";
import { GpuViewport } from "./integrations/graphics/gpu-viewport";
import { BrowserThermalSimulator } from "./integrations/thermal-simulator";
import { GpuStudy } from "./services/gpu-study";
import "./delivery/gpu-study.css";

const app = document.querySelector<HTMLElement>("#app")!;
const viewportContainer = mountGpuStudyShell(app);
let study: GpuStudy | null = null;
let page: GpuStudyPage | null = null;
let animationFrame = 0;
try {
  const viewport = new GpuViewport(viewportContainer);
  study = new GpuStudy(viewport, new BrowserThermalSimulator(
    () => new Worker(new URL("./start-thermal-solver.ts", import.meta.url), { type: "module" }),
  ));
  page = new GpuStudyPage(app, study);
  void study.calculateStudy();
  let previousTime = performance.now();
  const animate = (now: number): void => {
    const elapsed = Math.min((now - previousTime) / 1000, 0.1);
    previousTime = now;
    study!.tick(elapsed);
    animationFrame = requestAnimationFrame(animate);
  };
  animationFrame = requestAnimationFrame(animate);
} catch (error) {
  const message = document.createElement("p");
  message.className = "render-error";
  message.textContent =
    error instanceof Error
      ? error.message
      : "Não foi possível abrir o visualizador 3D.";
  viewportContainer.replaceChildren(message);
}

window.addEventListener("pagehide", () => {
  cancelAnimationFrame(animationFrame);
  page?.dispose();
  study?.dispose();
});
