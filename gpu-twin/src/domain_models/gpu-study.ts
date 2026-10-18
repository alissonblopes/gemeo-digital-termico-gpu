export const PARTS = [
  {
    id: "shroud",
    name: "Carcaça",
    material: "Polímero · estrutura externa",
    color: "#77818d",
    detail:
      "Protege o conjunto e direciona o ar. Forma inspirada na Ventus 2X; não é uma reprodução de fabricação.",
  },
  {
    id: "fans",
    name: "Ventiladores",
    material: "Polímero · convecção forçada",
    color: "#94a3b8",
    detail:
      "Dois ventiladores sobre o dissipador. A animação é visual; a troca com o ar é definida pelo controle de convecção h.",
  },
  {
    id: "heatsink",
    name: "Dissipador",
    material: "Alumínio · aletas",
    color: "#c7d0d8",
    detail:
      "As aletas ampliam a área de troca com o ar. Geometria e espaçamento internos são aproximações didáticas.",
  },
  {
    id: "heatpipes",
    name: "Tubos de calor",
    material: "Cobre · transporte térmico",
    color: "#d69863",
    detail:
      "Heat pipes de cobre com transporte equivalente. Quantidade, resistência e capacidade são hipóteses do ensaio, não medições da placa MSI.",
  },
  {
    id: "base",
    name: "Base de contato",
    material: "Cobre · condução",
    color: "#d69863",
    detail:
      "Distribui o calor recebido da interface térmica para o dissipador. Material e dimensões são hipóteses do modelo.",
  },
  {
    id: "tim",
    name: "Interface térmica",
    material: "Pasta térmica · contato",
    color: "#b5bcc8",
    detail:
      "Interface de 0,1 mm entre encapsulamento e base. A resistência da pasta participa do cálculo; não é metal maciço.",
  },
  {
    id: "gpu",
    name: "Processador gráfico",
    material: "Silício · encapsulamento",
    color: "#91d7cf",
    detail:
      "Representação do chip e do encapsulamento. Os 170 W nominais são da placa inteira, não uma potência medida apenas no chip.",
  },
  {
    id: "memory",
    name: "Memória GDDR6",
    material: "12 GB · seis encapsulamentos",
    color: "#8794a8",
    detail:
      "Memórias ilustrativas ao redor do chip. Posição e tamanho dos componentes internos são aproximados.",
  },
  {
    id: "pcb",
    name: "Placa de circuito",
    material: "FR-4 + cobre · suporte",
    color: "#368c77",
    detail:
      "PCB com conectores PCIe e alimentação de 8 pinos. Trilhas e componentes pequenos são representações visuais.",
  },
  {
    id: "backplate",
    name: "Backplate",
    material: "Estrutura · proteção traseira",
    color: "#7a8491",
    detail:
      "Proteção traseira inspirada na referência. Material, recortes e espessura não são certificados pelo modelo.",
  },
  {
    id: "bracket",
    name: "Espelho e conexões",
    material: "Metal · 3 DP + 1 HDMI",
    color: "#bbc4cc",
    detail:
      "Espelho de dois slots com três DisplayPort e uma HDMI, conforme a ficha técnica. Recortes simplificados.",
  },
] as const;
export type PartId = (typeof PARTS)[number]["id"];
export const PART_IDS: readonly PartId[] = PARTS.map((part) => part.id);
export const REFERENCE = {
  model: "MSI GeForce RTX 3060 Ventus 2X 12G OC",
  dimensionsMm: [235, 124, 42] as const,
  boardPowerW: 170,
  sources: [
    {
      label: "MSI · ficha técnica e fotografias",
      url: "https://storage-asset.msi.com/datasheet/vga/global/GeForce-RTX-3060-VENTUS-2X-12G-OC.pdf",
    },
    {
      label: "ASUS Dual · referência alternativa",
      url: "https://www.asus.com/us/motherboards-components/graphics-cards/dual/dual-rtx3060-12g-v2/techspec/",
    },
  ],
};

export const MATERIALS = {
  aluminium: { name: "Alumínio 6063-T6", k: 201, density: 2700, specificHeat: 900, color: 0xb0bcc5 },
  copper: { name: "Cobre C11000", k: 391, density: 8910, specificHeat: 385, color: 0xc08a55 },
} as const;
export type MaterialId = keyof typeof MATERIALS;
export const COOLING_PRESETS = {
  hybrid: { name: "Híbrido · base Cu + aletas Al", base: "copper", heatsink: "aluminium" },
  copper: { name: "Cobre · base e dissipador", base: "copper", heatsink: "copper" },
  aluminium: { name: "Alumínio · base e dissipador", base: "aluminium", heatsink: "aluminium" },
} as const;
export type CoolingPresetId = keyof typeof COOLING_PRESETS;
export type HeatPipeCount = 2 | 4 | 6;
export interface ThermalSettings {
  readonly preset: CoolingPresetId;
  readonly powerW: number;
  readonly ambientC: number;
  readonly convectionWm2K: number;
  readonly heatPipeCount: HeatPipeCount;
}
export const DEFAULT_THERMAL_SETTINGS: ThermalSettings = {
  preset: "hybrid", powerW: 170, ambientC: 25, convectionWm2K: 80, heatPipeCount: 4,
};
export const THERMAL_COLOR_RANGE = [20, 120] as const;
export const DESIGN_TEMPERATURE_C = 85;
export const THERMAL_PART_IDS: readonly PartId[] = ["gpu", "base", "heatsink", "heatpipes", "tim"];

/** Authorial geometry in mm; shared by the solver and the 3D, not MSI internal dimensions. */
export const COOLING_GEOMETRY = {
  base: { length: 45, width: 45, thickness: 4, centerX: -42, centerZ: 0, bottomY: -10.85 },
  heatsink: { length: 211, width: 100, thickness: 2, bottomY: -6.85, finCount: 49, finThickness: 0.7, finHeight: 21, finPitch: 2 },
  source: { length: 20, width: 20, packageCapacityJK: 3.5, internalResistanceKW: 0.1 },
  tim: { thickness: 0.1, conductivityWmK: 3, contactResistanceKW: 0.02 },
  contactAreaResistanceM2KW: 0.00002,
  pipe: { diameter: 6, wallThickness: 0.35, resistanceKW: 0.18, bondResistanceKW: 0.02, assumedCapacityW: 40,
    x: [-101, -82, -42, 10, 75, 102], y: [-5.25, -5.75, -5.85, -5.75, -3.75, 2.25] },
} as const;
export const PIPE_LAYOUTS: Readonly<Record<HeatPipeCount, readonly number[]>> = {
  2: [-18, 18], 4: [-18, -6, 6, 18], 6: [-18, -10.8, -3.6, 3.6, 10.8, 18],
};
export interface ThermalGrid {
  readonly nx: number;
  readonly nz: number;
  readonly originXmm: number;
  readonly originZmm: number;
  readonly lengthMm: number;
  readonly widthMm: number;
}
export interface ThermalFieldFrames {
  readonly grid: ThermalGrid;
  /** Consecutive frames, each containing nx*nz cell-centre temperatures in °C. */
  readonly temperaturesC: Float32Array;
}
export interface ThermalSample {
  readonly left: number;
  readonly right: number;
  readonly fraction: number;
}
export interface ThermalEquilibrium {
  readonly sourceC: number;
  readonly baseMeanC: number;
  readonly baseMaxC: number;
  readonly heatsinkMeanC: number;
  readonly plateMaxC: number;
  readonly heatLossW: number;
  readonly resistanceKW: number | null;
  readonly pipeFlowsW: readonly number[];
  readonly pipeCapacityExceeded: boolean;
}
export interface ThermalDataset {
  readonly version: 1;
  readonly source: string;
  readonly settings: ThermalSettings;
  readonly timesSeconds: readonly number[];
  readonly temperaturesC: Readonly<Partial<Record<PartId, readonly number[]>>>;
  readonly baseField: ThermalFieldFrames;
  readonly heatsinkField: ThermalFieldFrames;
  readonly pipeTemperaturesC: Float32Array;
  readonly heatLossW: readonly number[];
  readonly equilibrium: ThermalEquilibrium;
  readonly diagnostics: {
    readonly maxStepEnergyResidualW: number;
    readonly steadyEnergyResidualW: number;
    readonly stepSeconds: number;
    readonly finEfficiency: number;
    readonly finMPerMetre: number;
    readonly metalMassKg: number;
    readonly unknowns: number;
    readonly sourceToBaseResistanceKW: number;
  };
}
export type TemperatureSnapshot = Readonly<Partial<Record<PartId, number>>>;
export type CameraView = "perspective" | "front" | "back" | "side";
export interface ThermalSimulator {
  calculate(settings: ThermalSettings): Promise<ThermalDataset>;
  dispose(): void;
}
export interface SolverRequest { readonly id: number; readonly settings: ThermalSettings }
export type SolverResponse =
  | { readonly id: number; readonly type: "completed"; readonly dataset: ThermalDataset }
  | { readonly id: number; readonly type: "failed"; readonly message: string };
export interface SolverEndpoint {
  onmessage: ((event: { data: SolverRequest }) => void) | null;
  postMessage(message: SolverResponse, transfer: ArrayBuffer[]): void;
}
export interface StudyFrame {
  readonly selected: PartId | null;
  readonly hidden: ReadonlySet<PartId>;
  readonly explosion: number;
  readonly animateFans: boolean;
  readonly heatmap: boolean;
  readonly requestedSettings: ThermalSettings;
  readonly calculating: boolean;
  readonly error: string | null;
  readonly dataset: ThermalDataset | null;
  readonly temperatures: TemperatureSnapshot | null;
  readonly thermalSample: ThermalSample | null;
  readonly heatLossW: number | null;
  readonly timeSeconds: number;
  readonly playing: boolean;
  readonly playbackSpeed: number;
}
export class ThermalSimulationError extends Error {
  constructor(message: string) { super(message); this.name = "ThermalSimulationError"; }
}
export class GpuDisplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GpuDisplayError";
  }
}
