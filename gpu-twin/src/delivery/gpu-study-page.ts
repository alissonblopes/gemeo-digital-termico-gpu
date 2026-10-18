import {
  PARTS,
  COOLING_GEOMETRY,
  COOLING_PRESETS,
  DESIGN_TEMPERATURE_C,
  MATERIALS,
  REFERENCE,
  type CameraView,
  type PartId,
  type StudyFrame,
  type CoolingPresetId,
  type HeatPipeCount,
} from "../domain_models/gpu-study";
import type { GpuStudy } from "../services/gpu-study";

const ICONS: Record<string, string> = {
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8l10-5Zm-9 10 9 5 9-5M3 18l9 5 9-5"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  rotate: '<path d="M20 8a9 9 0 1 0 1 7M20 3v6h-6"/>',
  fan: '<circle cx="12" cy="12" r="2"/><path d="M10 10C2 5 7 1 11 3c2 1 2 4 1 7m2 1c5-8 9-3 7 1-1 2-4 2-7 1m-1 1c8 5 3 9-1 7-2-1-2-4-1-7m-1-1c-5 8-9 3-7-1 1-2 4-2 7-1"/>',
  play: '<path d="m8 4 12 8-12 8V4Z"/>',
  pause: '<path d="M8 4v16m8-16v16"/>',
  chart: '<path d="M3 3v18h18M6 15l4-5 4 3 6-8"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  cube: '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 9v10M3 8l9 4 9-4"/>',
};
function icon(name: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

export function mountGpuStudyShell(app: HTMLElement): HTMLElement {
  app.innerHTML = `
    <header class="app-header">
      <div class="brand"><div class="brand-symbol">${icon("chip")}</div><div><div class="brand-name">GPU<span> / </span>LAB</div><div class="brand-caption">INTERACTIVE THERMAL STUDY</div></div></div>
      <div class="header-course">FUNDAMENTOS DE ENGENHARIA <span class="separator"></span> ESTUDO 01 / GESTÃO TÉRMICA</div>
      <div class="header-actions"><button class="button button-outline" id="references-button" title="Referências e hipóteses">${icon("info")} Referências</button><button class="button button-outline" id="capture-button" title="Salvar imagem do modelo">${icon("download")} Salvar imagem</button></div>
    </header>
    <main class="workspace">
      <aside class="anatomy-panel" aria-label="Anatomia da placa">
        <div class="eyebrow">SISTEMA EM ESTUDO</div><h2 class="device-heading">GeForce RTX 3060</h2><p class="device-subtitle">MSI Ventus 2X · 12G OC</p><div class="device-badge">ARQUITETURA AMPERE</div>
        <div class="specs"><div><div class="spec-value">170<span>W</span></div><div class="spec-label">Potência nominal da placa</div></div><div><div class="spec-value">12<span>GB</span></div><div class="spec-label">Memória GDDR6</div></div></div>
        <div class="section-heading"><h2>Explore a montagem</h2><span class="small-count">11 GRUPOS</span></div>
        <div class="explosion-control"><label class="control-label" for="explosion">Vista explodida <output class="control-value" id="explosion-value">0%</output></label><input type="range" id="explosion" min="0" max="100" value="0" aria-label="Separação da vista explodida"/><div class="range-labels"><span>Montada</span><span>Separada</span></div></div>
        <div class="component-list">${PARTS.map((part) => `<div class="component-row" data-row="${part.id}"><button class="component-select" data-part="${part.id}" aria-pressed="false"><span class="component-dot" style="background:${part.color}"></span>${part.name}</button><label class="visibility-control" title="Mostrar ${part.name}"><input type="checkbox" checked data-visible="${part.id}" aria-label="Mostrar ${part.name}"/>${icon("eye")}</label></div>`).join("")}</div>
        <div class="anatomy-footer"><span class="small-count" id="visible-count">11 / 11 VISÍVEIS</span><button class="button-quiet" id="restore-components">Restaurar peças ↗</button></div>
        <p class="anatomy-note">Geometria didática. Explodir, ocultar e animar peças altera apenas a visualização, não o circuito térmico.</p>
      </aside>
      <section class="viewer-column" aria-label="Visualizador tridimensional">
        <div class="viewer-stage"><div id="viewport" class="viewport"></div>
          <div class="viewer-heading"><div class="eyebrow">LABORATÓRIO TÉRMICO INTERATIVO</div><h1>Veja o calor se espalhar.</h1><p>Troque o material. Altere a potência. Compare.</p></div>
          <div class="geometry-status"><span class="status-dot"></span>MODELO REDUZIDO · NÃO É CFD</div>
          <div class="view-toggles"><button id="fan-animation" aria-pressed="false">${icon("fan")} Animar ventoinhas</button><button id="auto-rotation" aria-pressed="false">${icon("rotate")} Giro automático</button></div>
          <nav class="camera-toolbar" aria-label="Vistas do modelo"><button class="is-active" data-camera="perspective" aria-pressed="true">${icon("cube")} Perspectiva</button><button data-camera="front" aria-pressed="false">Frente</button><button data-camera="back" aria-pressed="false">Verso</button><button data-camera="side" aria-pressed="false">Lateral</button><span class="toolbar-divider"></span><button id="reset-camera" title="Recentrar câmera" aria-label="Recentrar câmera">${icon("rotate")}</button></nav>
          <div class="viewer-instructions"><span>ARRASTE PARA GIRAR</span><span>SCROLL PARA ZOOM</span><span>CLIQUE PARA SELECIONAR</span></div><div class="envelope">235 × 124 × 42 mm</div>
        </div>
        <section class="timeline" aria-label="Evolução da simulação térmica"><div class="timeline-header"><span class="timeline-title">${icon("chart")} Aquecimento a partir do ambiente</span><span class="timeline-time" id="timeline-time">PREPARANDO ENSAIO</span></div>
          <div class="timeline-controls"><button class="play-button" id="playback" disabled aria-label="Reproduzir resultados">${icon("play")}</button><button class="reset-time" id="reset-time" disabled aria-label="Voltar ao início" title="Voltar ao início">${icon("reset")}</button><div class="timeline-scrub"><input type="range" id="thermal-time" min="0" max="300" step="any" value="0" disabled aria-label="Instante da simulação térmica"/><div class="range-labels"><span id="time-start">0 s</span><span id="time-end">300 s</span></div></div><select id="playback-speed" class="speed-select" disabled aria-label="Velocidade de reprodução"><option value="1">1×</option><option value="10" selected>10×</option><option value="60">60×</option></select></div>
          <p class="timeline-footnote" id="timeline-note">O cálculo ocorre em uma thread dedicada. Cada configuração inicia um novo ensaio.</p>
        </section>
      </section>
      <aside class="study-panel" aria-label="Resultados e componente selecionado">
        <section aria-label="Configuração do ensaio"><div class="eyebrow">ESCOLHA · CALCULE · COMPARE</div><h2 class="panel-title">Seu sistema de resfriamento.</h2>
          <div class="simulation-controls">
            <label class="field-label" for="cooling-preset">Material do conjunto</label><select class="simulation-select" id="cooling-preset">${Object.entries(COOLING_PRESETS).map(([id, preset]) => `<option value="${id}">${preset.name}</option>`).join("")}</select>
            <div class="parameter"><label class="control-label" for="power">Potência térmica <output class="control-value" id="power-value">170 W</output></label><input id="power" type="range" min="0" max="300" step="5" value="170"/><div class="range-labels"><span>0 W</span><span>300 W</span></div></div>
            <div class="parameter"><label class="control-label" for="ambient">Temperatura ambiente <output class="control-value" id="ambient-value">25 °C</output></label><input id="ambient" type="range" min="10" max="45" step="1" value="25"/><div class="range-labels"><span>10 °C</span><span>45 °C</span></div></div>
            <div class="parameter"><label class="control-label" for="convection">Convecção h <output class="control-value" id="convection-value">80 W/m²K</output></label><input id="convection" type="range" min="5" max="150" step="5" value="80"/><div class="range-labels"><span>Ar pouco movimentado</span><span>Convecção intensa</span></div></div>
            <label class="field-label" for="pipe-count">Heat pipes de cobre · Ø 6 mm</label><select class="simulation-select" id="pipe-count"><option value="2">2 tubos</option><option value="4" selected>4 tubos</option><option value="6">6 tubos</option></select>
          </div>
          <p class="legend-note">Potência total concentrada em uma fonte equivalente. h é uma hipótese, não RPM; a animação não muda a ventilação.</p>
          <p id="simulation-status" class="simulation-status" role="status" aria-live="polite">Preparando ensaio…</p>
          <div class="thermal-summary"><div><span>Fonte · agora</span><strong id="source-temperature">—</strong></div><div><span>Fonte · equilíbrio</span><strong id="steady-temperature">—</strong></div></div>
          <dl class="simulation-metrics"><div><dt>Base · máximo no equilíbrio</dt><dd id="base-maximum">—</dd></div><div><dt>Massa metálica modelada</dt><dd id="metal-mass">—</dd></div><div><dt>Calor para o ar · agora</dt><dd id="heat-loss">—</dd></div></dl>
          <p class="legend-note">Meta de projeto: 85 °C, não um limite oficial da GPU. Equilíbrio calculado separadamente, não presumido aos 300 s.</p>
          <div class="switch-row"><span>Heatmap espacial</span><label class="switch"><input type="checkbox" id="heatmap" checked disabled aria-label="Heatmap espacial"/><span class="switch-track"></span></label></div>
          <div id="thermal-legend"><div class="legend"></div><div class="legend-scale"><span>≤ 20 °C</span><span>≥ 120 °C</span></div><p class="legend-note">Escala fixa entre ensaios. Campos nas bases + perfil analítico nas aletas. Fonte e tubos equivalentes têm temperatura uniforme. Peças translúcidas não são simuladas.</p></div>
        </section>
        <section class="selection-section"><div class="eyebrow">INSPEÇÃO DO COMPONENTE</div><h2 class="selection-title" id="selected-name">Cada peça tem uma função.</h2><p class="selection-material" id="selected-material">Selecione no modelo ou na lista</p><p class="selection-detail" id="selected-detail">Desmonte a placa com a vista explodida e explore o conjunto de refrigeração, o chip e as conexões.</p>
          <div class="selection-metric"><span>Temperatura média</span><strong><span id="selected-temperature">—</span> <small>°C</small></strong></div><div class="selection-actions"><button id="isolate-part" class="button button-outline" disabled>${icon("layers")} Isolar peça</button><button id="clear-selection" class="button button-outline" disabled>Limpar seleção</button></div>
          <div class="chart-container"><div class="chart-title"><span id="chart-component">HISTÓRICO TÉRMICO</span><span>°C / s</span></div><canvas class="thermal-chart" id="thermal-chart" aria-label="Gráfico da temperatura ao longo do tempo" hidden></canvas><p class="chart-empty" id="chart-empty">Temperatura não modelada para esta peça.</p></div>
        </section>
      </aside>
    </main>
    <footer class="app-footer"><span><span class="status-dot"></span>VOLUMES FINITOS + ALETAS ANALÍTICAS</span><span class="footer-stack">TYPESCRIPT / BUN / THREE.JS · MASA</span><span>ESTUDO EDUCACIONAL · NÃO CALIBRADO</span></footer>
    <div class="toast" id="notification" role="status" aria-live="polite" hidden></div>
    <dialog id="references-dialog"><div class="dialog-header"><h2>Referências & hipóteses</h2><button data-close-dialog aria-label="Fechar referências">${icon("close")}</button></div>
      <p>Referência visual: <strong>${REFERENCE.model}</strong>, 235 × 124 × 42 mm. Os 170 W são da placa inteira, não uma medição de potência no chip. Neste ensaio toda a potência escolhida entra em uma fonte térmica equivalente de 20 × 20 mm.</p>
      <div class="dialog-links">${REFERENCE.sources.map((source) => `<a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.label} ↗</a>`).join("")}<a href="https://www.hydro.com/globalassets/01-products--services/extruded-profiles/americas/ena-resources/alloy-data-sheets/hydro_2026_data_sheet_6063-rev-062026.pdf" target="_blank" rel="noopener noreferrer">Hydro · alumínio 6063 ↗</a><a href="https://alloys.copper.org/alloy/C11000" target="_blank" rel="noopener noreferrer">Copper Development Association · C11000 ↗</a><a href="https://web.mit.edu/16.unified/www/FALL/thermodynamics/notes/node128.html" target="_blank" rel="noopener noreferrer">MIT · transferência de calor em aletas ↗</a></div>
      <h3>Modelo físico reduzido</h3><p>Condução por volumes finitos em duas bases acopladas; convecção para ar à temperatura ambiente; aletas retas com perfil analítico unidimensional e comprimento corrigido. Toda a capacidade térmica das aletas é concentrada na raiz para aproximar o transiente. Não há CFD, radiação ou temperaturas calculadas para PCB, memórias e carcaça.</p>
      <p>Base 45 × 45 × 4 mm; espalhador 211 × 100 × 2 mm; 49 aletas de 211 × 21 × 0,7 mm. Cobre: k = 391 W/(m·K), ρ = 8910 kg/m³, c = 385 J/(kg·K). Alumínio: k = 201 W/(m·K), ρ = 2700 kg/m³, c = 900 J/(kg·K). São valores típicos, não certificados de fabricação.</p>
      <p>Hipóteses: pasta de 0,1 mm com k = 3 W/(m·K); fonte com C = 3,5 J/K e resistência interna de 0,10 K/W; contato da pasta de 0,02 K/W; contato entre bases de 2 × 10⁻⁵ m²K/W. Partes inferiores são adiabáticas. A geometria interna é autoral, não um CAD de fabricação.</p>
      <h3>Heat pipes e limites de uso</h3><p>Cada tubo tem um nó quase isotérmico equivalente, R = 0,18 K/W dividida entre evaporação e condensação, mais 0,02 K/W em cada ligação. Capacidade ilustrativa de ${COOLING_GEOMETRY.pipe.assumedCapacityW} W por tubo: quando excedida, o resultado é sinalizado como fora dessa hipótese. O solver não simula secagem, orientação, fluido ou limites reais do fabricante; não substitui validação experimental.</p>
      <p>Alterar um parâmetro recalcula 300 s a partir do ambiente; não troca materiais instantaneamente durante o mesmo aquecimento. A meta de 85 °C é didática. Este aplicativo complementa, mas não substitui Energy2D, FreeCAD, Colab e as demais entregas da disciplina. Uso de IA deve ser declarado.</p>
    </dialog>
  `;
  return app.querySelector<HTMLElement>("#viewport")!;
}

export class GpuStudyPage {
  private toastTimer = 0;
  private autoRotation = false;
  private readonly chartObserver: ResizeObserver;
  private latestFrame: StudyFrame | null = null;
  private chartSeries: readonly number[] | null = null;
  private chartMin = 0;
  private chartMax = 1;
  private readonly componentElements: {
    id: PartId;
    row: HTMLElement;
    button: HTMLButtonElement;
    checkbox: HTMLInputElement;
  }[];

  constructor(
    private readonly app: HTMLElement,
    private readonly study: GpuStudy,
  ) {
    this.componentElements = PARTS.map((part) => ({
      id: part.id,
      row: this.element(`[data-row="${part.id}"]`),
      button: this.element(`[data-part="${part.id}"]`),
      checkbox: this.element(`[data-visible="${part.id}"]`),
    }));
    this.bindInteractions();
    study.observe((frame) => this.renderFrame(frame));
    this.chartObserver = new ResizeObserver(() => {
      if (this.latestFrame) this.renderChart(this.latestFrame);
    });
    this.chartObserver.observe(this.element(".chart-container"));
  }

  private element<T extends HTMLElement>(selector: string): T {
    const element = this.app.querySelector<T>(selector);
    if (!element) throw new Error(`Elemento da interface ausente: ${selector}`);
    return element;
  }

  private bindInteractions(): void {
    for (const { id, button, checkbox } of this.componentElements) {
      button.addEventListener("click", () => this.study.selectComponent(id));
      checkbox.addEventListener("change", () =>
        this.study.setComponentVisible(id, checkbox.checked),
      );
    }
    const explosion = this.element<HTMLInputElement>("#explosion");
    explosion.addEventListener("input", () =>
      this.study.setExplosion(Number(explosion.value) / 100),
    );
    this.element("#restore-components").addEventListener("click", () =>
      this.study.restoreComponents(),
    );
    this.element("#isolate-part").addEventListener("click", () =>
      this.study.isolateComponent(),
    );
    this.element("#clear-selection").addEventListener("click", () =>
      this.study.selectComponent(null),
    );
    this.element("#fan-animation").addEventListener("click", () =>
      this.study.setFanAnimation(!this.latestFrame?.animateFans),
    );
    this.element("#auto-rotation").addEventListener("click", () => {
      this.autoRotation = !this.autoRotation;
      this.study.setAutoRotation(this.autoRotation);
      this.element("#auto-rotation").setAttribute(
        "aria-pressed",
        String(this.autoRotation),
      );
    });
    for (const button of this.app.querySelectorAll<HTMLButtonElement>(
      "[data-camera]",
    )) {
      button.addEventListener("click", () =>
        this.selectCamera(button.dataset.camera as CameraView),
      );
    }
    this.element("#reset-camera").addEventListener("click", () =>
      this.selectCamera("perspective"),
    );
    this.element("#references-button").addEventListener("click", () =>
      this.element<HTMLDialogElement>("#references-dialog").showModal(),
    );
    for (const button of this.app.querySelectorAll<HTMLButtonElement>(
      "[data-close-dialog]",
    ))
      button.addEventListener("click", () => button.closest("dialog")!.close());
    this.element("#viewport").addEventListener("gpu-display-error", (event) =>
      this.notify((event as CustomEvent<string>).detail, true),
    );
    const preset = this.element<HTMLSelectElement>("#cooling-preset");
    preset.addEventListener("change", () => void this.study.calculateStudy({ preset: preset.value as CoolingPresetId }));
    const pipes = this.element<HTMLSelectElement>("#pipe-count");
    pipes.addEventListener("change", () => void this.study.calculateStudy({ heatPipeCount: Number(pipes.value) as HeatPipeCount }));
    for (const [id, key, unit] of [
      ["power", "powerW", "W"], ["ambient", "ambientC", "°C"], ["convection", "convectionWm2K", "W/m²K"],
    ] as const) {
      const input = this.element<HTMLInputElement>(`#${id}`);
      input.addEventListener("input", () => { this.element(`#${id}-value`).textContent = `${input.value} ${unit}`; });
      input.addEventListener("change", () => void this.study.calculateStudy({ [key]: Number(input.value) }));
    }
    this.element("#reset-time").addEventListener("click", () => this.study.resetThermalTime());
    const heatmap = this.element<HTMLInputElement>("#heatmap");
    heatmap.addEventListener("change", () =>
      this.study.setHeatmap(heatmap.checked),
    );
    const time = this.element<HTMLInputElement>("#thermal-time");
    time.addEventListener("input", () =>
      this.study.seekThermalTime(Number(time.value)),
    );
    this.element("#playback").addEventListener("click", () =>
      this.study.togglePlayback(),
    );
    const speed = this.element<HTMLSelectElement>("#playback-speed");
    speed.addEventListener("change", () =>
      this.study.setPlaybackSpeed(Number(speed.value)),
    );
    this.element("#capture-button").addEventListener("click", async () => {
      try {
        const blob = await this.study.captureImage();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "rtx-3060-gpu-lab.png";
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.notify(
          "Imagem 3D salva. A captura não inclui os painéis da interface.",
        );
      } catch (error) {
        this.notify(
          error instanceof Error ? error.message : "Falha ao salvar imagem.",
          true,
        );
      }
    });
  }

  private selectCamera(view: CameraView): void {
    this.study.setCamera(view);
    for (const button of this.app.querySelectorAll<HTMLButtonElement>(
      "[data-camera]",
    )) {
      const selected = button.dataset.camera === view;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
  }

  private renderFrame(frame: StudyFrame): void {
    const settingsChanged = this.latestFrame?.requestedSettings !== frame.requestedSettings;
    this.latestFrame = frame;
    if (settingsChanged) {
      const settings = frame.requestedSettings;
      this.element<HTMLSelectElement>("#cooling-preset").value = settings.preset;
      this.element<HTMLSelectElement>("#pipe-count").value = String(settings.heatPipeCount);
      for (const [id, value, unit] of [["power", settings.powerW, "W"], ["ambient", settings.ambientC, "°C"], ["convection", settings.convectionWm2K, "W/m²K"]] as const) {
        this.element<HTMLInputElement>(`#${id}`).value = String(value);
        this.element(`#${id}-value`).textContent = `${value} ${unit}`;
      }
    }
    for (const { id, row, button, checkbox } of this.componentElements) {
      row.classList.toggle("is-selected", frame.selected === id);
      row.classList.toggle("is-hidden", frame.hidden.has(id));
      button.setAttribute("aria-pressed", String(frame.selected === id));
      checkbox.checked = !frame.hidden.has(id);
    }
    this.element("#visible-count").textContent =
      `${PARTS.length - frame.hidden.size} / ${PARTS.length} VISÍVEIS`;
    this.element<HTMLInputElement>("#explosion").value = String(
      Math.round(frame.explosion * 100),
    );
    this.element("#explosion-value").textContent =
      `${Math.round(frame.explosion * 100)}%`;
    this.element("#fan-animation").setAttribute(
      "aria-pressed",
      String(frame.animateFans),
    );
    const selected = PARTS.find((part) => part.id === frame.selected);
    this.element("#selected-name").textContent =
      selected?.name ?? "Cada peça tem uma função.";
    const preset = COOLING_PRESETS[(frame.dataset?.settings ?? frame.requestedSettings).preset];
    this.element("#selected-material").textContent = frame.selected === "base"
      ? MATERIALS[preset.base].name : frame.selected === "heatsink" ? MATERIALS[preset.heatsink].name
        : frame.selected === "heatpipes" ? `Cobre · ${frame.dataset?.settings.heatPipeCount ?? frame.requestedSettings.heatPipeCount} tubos equivalentes`
          : selected?.material ?? "Selecione no modelo ou na lista";
    this.element("#selected-detail").textContent =
      selected?.detail ??
      "Desmonte a placa com a vista explodida e explore o conjunto de refrigeração, o chip e as conexões.";
    const selectedTemperature = frame.selected
      ? frame.temperatures?.[frame.selected]
      : undefined;
    this.element("#selected-temperature").textContent =
      selectedTemperature === undefined ? "—" : selectedTemperature.toFixed(1);
    this.element<HTMLButtonElement>("#isolate-part").disabled = !selected;
    this.element<HTMLButtonElement>("#clear-selection").disabled = !selected;
    const dataset = frame.dataset;
    const status = this.element("#simulation-status");
    const outsidePipes = dataset?.equilibrium.pipeCapacityExceeded;
    const overTarget = dataset && dataset.equilibrium.sourceC > DESIGN_TEMPERATURE_C;
    const statusText = frame.error ?? (frame.calculating ? "Calculando novo ensaio…" : outsidePipes
      ? "Fora da capacidade ilustrativa dos tubos. Resultado não validado nesse regime."
      : overTarget ? "Equilíbrio acima da meta de 85 °C." : dataset ? "Ensaio calculado · modelo não calibrado." : "Preparando ensaio…");
    if (status.textContent !== statusText) status.textContent = statusText;
    status.classList.toggle("is-warning", !!outsidePipes || !!overTarget);
    status.classList.toggle("is-error", !!frame.error);
    this.element("#source-temperature").textContent = frame.temperatures?.gpu === undefined ? "—" : `${frame.temperatures.gpu.toFixed(1)} °C`;
    this.element("#steady-temperature").textContent = dataset ? `${dataset.equilibrium.sourceC.toFixed(1)} °C` : "—";
    this.element("#steady-temperature").classList.toggle("is-hot", !!overTarget);
    this.element("#base-maximum").textContent = dataset ? `${dataset.equilibrium.baseMaxC.toFixed(1)} °C` : "—";
    this.element("#metal-mass").textContent = dataset ? `${dataset.diagnostics.metalMassKg.toFixed(3)} kg` : "—";
    this.element("#heat-loss").textContent = frame.heatLossW === null ? "—" : `${frame.heatLossW.toFixed(1)} W`;
    const heatmap = this.element<HTMLInputElement>("#heatmap");
    heatmap.disabled = !dataset;
    heatmap.checked = frame.heatmap;
    this.element("#thermal-legend").hidden = !frame.heatmap;
    this.element<HTMLButtonElement>("#reset-time").disabled = !dataset;
    const time = this.element<HTMLInputElement>("#thermal-time");
    time.disabled = !dataset || dataset.timesSeconds.length === 1;
    time.min = String(dataset?.timesSeconds[0] ?? 0);
    time.max = String(dataset?.timesSeconds.at(-1) ?? 1);
    time.value = String(frame.timeSeconds);
    const play = this.element<HTMLButtonElement>("#playback");
    play.disabled = !dataset || dataset.timesSeconds.length === 1;
    play.innerHTML = icon(frame.playing ? "pause" : "play");
    play.setAttribute(
      "aria-label",
      frame.playing ? "Pausar resultados" : "Reproduzir resultados",
    );
    const speed = this.element<HTMLSelectElement>("#playback-speed");
    speed.disabled = !dataset || dataset.timesSeconds.length === 1;
    speed.value = String(frame.playbackSpeed);
    this.element("#timeline-time").textContent = dataset
      ? `${frame.timeSeconds.toFixed(1)} / ${dataset.timesSeconds.at(-1)!.toFixed(1)} s`
      : frame.calculating ? "CALCULANDO…" : "SEM ENSAIO";
    this.element("#time-start").textContent = dataset
      ? `${dataset.timesSeconds[0]} s`
      : "—";
    this.element("#time-end").textContent = dataset
      ? `${dataset.timesSeconds.at(-1)} s`
      : "—";
    this.element("#timeline-note").textContent = dataset
      ? "Ensaio iniciado no ambiente · interpolação entre amostras de 2 s · alterações iniciam outro ensaio."
      : frame.error ? "Altere os parâmetros para iniciar um novo cálculo." : "Resolvendo condução, convecção e armazenamento de energia no navegador.";
    this.renderChart(frame);
  }

  private renderChart(frame: StudyFrame): void {
    const id = frame.selected ?? "gpu";
    const dataset = frame.dataset;
    const series = dataset?.temperaturesC[id];
    const canvas = this.element<HTMLCanvasElement>("#thermal-chart");
    this.element("#chart-empty").hidden = !!series;
    canvas.hidden = !series;
    this.element("#chart-component").textContent = series
      ? PARTS.find((part) => part.id === id)!.name.toUpperCase()
      : "HISTÓRICO TÉRMICO";
    if (!series || !dataset) return;
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    const width = canvas.clientWidth;
    const height = 76;
    if (!width) return;
    if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
    }
    const context = canvas.getContext("2d")!;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.setLineDash([]);
    if (series !== this.chartSeries) {
      this.chartSeries = series;
      this.chartMin = Math.floor(Math.min(...series) / 10) * 10;
      this.chartMax = Math.max(this.chartMin + 10, Math.ceil(Math.max(...series) / 10) * 10);
    }
    const min = this.chartMin, max = this.chartMax;
    const start = dataset.timesSeconds[0];
    const duration = dataset.timesSeconds.at(-1)! - start;
    const x = (time: number) =>
      30 + (duration === 0 ? 0 : (time - start) / duration) * (width - 34);
    const y = (temperature: number) =>
      7 + (1 - (temperature - min) / (max - min)) * (height - 14);
    context.strokeStyle = "#2b3c47";
    context.font = "8px monospace";
    context.fillStyle = "#8e9cac";
    for (let i = 0; i < 3; i++) {
      const temperature = min + (max - min) * i / 2, ordinate = y(temperature);
      context.beginPath(); context.moveTo(27, ordinate); context.lineTo(width, ordinate); context.stroke();
      context.fillText(temperature.toFixed(0), 0, ordinate + 3);
    }
    context.beginPath();
    dataset.timesSeconds.forEach((time, index) => {
      if (index === 0) context.moveTo(x(time), y(series[index]));
      else context.lineTo(x(time), y(series[index]));
    });
    context.strokeStyle = "#71e6c5";
    context.lineWidth = 2;
    context.stroke();
    const temperature = frame.temperatures?.[id];
    if (temperature !== undefined) {
      context.beginPath();
      context.arc(x(frame.timeSeconds), y(temperature), 3, 0, Math.PI * 2);
      context.fillStyle = "#bdffe9";
      context.fill();
      context.setLineDash([3, 4]);
      context.strokeStyle = "#71e6c566";
      context.beginPath();
      context.moveTo(x(frame.timeSeconds), 0);
      context.lineTo(x(frame.timeSeconds), height);
      context.stroke();
    }
  }

  notify(message: string, error = false): void {
    window.clearTimeout(this.toastTimer);
    const toast = this.element("#notification");
    toast.textContent = message;
    toast.classList.toggle("is-error", error);
    toast.hidden = false;
    this.toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 7000);
  }

  dispose(): void {
    this.chartObserver.disconnect();
    window.clearTimeout(this.toastTimer);
  }
}
