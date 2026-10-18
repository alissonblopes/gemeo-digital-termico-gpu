import {
  COOLING_GEOMETRY as G,
  COOLING_PRESETS,
  MATERIALS,
  PIPE_LAYOUTS,
  ThermalSimulationError,
  type PartId,
  type ThermalDataset,
  type ThermalGrid,
  type ThermalSettings,
} from "../domain_models/gpu-study";

export interface SimulationOptions {
  readonly stepSeconds?: number;
  readonly durationSeconds?: number;
  readonly sampleSeconds?: number;
  readonly plateNx?: number;
  readonly plateNz?: number;
  readonly baseNx?: number;
  readonly baseNz?: number;
}
interface Grid {
  readonly description: ThermalGrid;
  readonly offset: number;
  readonly dx: number;
  readonly dz: number;
  readonly x0: number;
  readonly z0: number;
  readonly count: number;
}
interface PipeLink { readonly cell: number; readonly pipe: number; readonly conductance: number }
interface Network {
  readonly plate: Grid;
  readonly base: Grid;
  readonly pipeStart: number;
  readonly source: number;
  readonly size: number;
  readonly edgeA: Uint32Array;
  readonly edgeB: Uint32Array;
  readonly conductance: Float64Array;
  readonly diagonal: Float64Array;
  readonly capacity: Float64Array;
  readonly convection: Float64Array;
  readonly aluminiumMeanWeights: Float64Array;
  readonly sourceWeights: Float64Array;
  readonly pipeLinks: readonly PipeLink[];
  readonly sourceResistance: number;
  readonly timMeanResistance: number;
  readonly finEfficiency: number;
  readonly finM: number;
  readonly massKg: number;
}
interface Workspace { readonly residual: Float64Array; readonly direction: Float64Array; readonly product: Float64Array; readonly preconditioned: Float64Array }
const mm = 0.001;
const overlap = (a: number, b: number, c: number, d: number): number => Math.max(0, Math.min(b, d) - Math.max(a, c));

function validate(settings: ThermalSettings, options: SimulationOptions): void {
  if (!Object.hasOwn(COOLING_PRESETS, settings.preset)) throw new ThermalSimulationError("Material do ensaio desconhecido.");
  for (const [name, value, low, high] of [
    ["Potência", settings.powerW, 0, 300],
    ["Ambiente", settings.ambientC, 10, 45],
    ["Convecção h", settings.convectionWm2K, 5, 150],
  ] as const) {
    if (!Number.isFinite(value) || value < low || value > high) throw new ThermalSimulationError(`${name}: use um valor entre ${low} e ${high}.`);
  }
  if (![2, 4, 6].includes(settings.heatPipeCount)) throw new ThermalSimulationError("Escolha 2, 4 ou 6 heat pipes.");
  for (const value of [options.plateNx ?? 41, options.plateNz ?? 25, options.baseNx ?? 15, options.baseNz ?? 15]) {
    if (!Number.isInteger(value) || value < 3 || value > 150) throw new ThermalSimulationError("Resolução numérica inválida.");
  }
}
function grid(nx: number, nz: number, length: number, width: number, x: number, z: number, offset: number): Grid {
  return { description: { nx, nz, lengthMm: length, widthMm: width, originXmm: x - length / 2, originZmm: z - width / 2 },
    offset, dx: length * mm / nx, dz: width * mm / nz, x0: (x - length / 2) * mm, z0: (z - width / 2) * mm, count: nx * nz };
}
function buildNetwork(settings: ThermalSettings, options: SimulationOptions): Network {
  const preset = COOLING_PRESETS[settings.preset];
  const baseMaterial = MATERIALS[preset.base], finMaterial = MATERIALS[preset.heatsink];
  const plate = grid(options.plateNx ?? 41, options.plateNz ?? 25, G.heatsink.length, G.heatsink.width, 0, 0, 0);
  const base = grid(options.baseNx ?? 15, options.baseNz ?? 15, G.base.length, G.base.width, G.base.centerX, G.base.centerZ, plate.count);
  const pipeStart = plate.count + base.count, source = pipeStart + settings.heatPipeCount, size = source + 1;
  const capacity = new Float64Array(size), convection = new Float64Array(size), diagonal = new Float64Array(size);
  const a: number[] = [], b: number[] = [], conductances: number[] = [];
  const connect = (i: number, j: number, conductance: number): void => {
    if (conductance <= 0) return;
    a.push(i); b.push(j); conductances.push(conductance);
    diagonal[i] += conductance; diagonal[j] += conductance;
  };
  const neighbours = (field: Grid, k: number, thickness: number): void => {
    const { nx, nz } = field.description;
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      const i = field.offset + z * nx + x;
      if (x + 1 < nx) connect(i, i + 1, k * thickness * field.dz / field.dx);
      if (z + 1 < nz) connect(i, i + nx, k * thickness * field.dx / field.dz);
    }
  };
  neighbours(plate, finMaterial.k, G.heatsink.thickness * mm);
  neighbours(base, baseMaterial.k, G.base.thickness * mm);
  const h = settings.convectionWm2K, finThickness = G.heatsink.finThickness * mm, finHeight = G.heatsink.finHeight * mm;
  const finM = Math.sqrt(2 * h / (finMaterial.k * finThickness));
  const correctedHeight = finHeight + finThickness / 2;
  const finEfficiency = Math.tanh(finM * correctedHeight) / (finM * correctedHeight);
  const aluminiumMeanWeights = new Float64Array(plate.count);
  const plateVolume = G.heatsink.length * G.heatsink.width * G.heatsink.thickness * 1e-9;
  const finsVolume = G.heatsink.finCount * G.heatsink.length * G.heatsink.finThickness * G.heatsink.finHeight * 1e-9;
  const { nx: pnx, nz: pnz } = plate.description;
  for (let z = 0; z < pnz; z++) {
    const z0 = plate.z0 + z * plate.dz, z1 = z0 + plate.dz;
    let finRootWidth = 0;
    for (let fin = 0; fin < G.heatsink.finCount; fin++) {
      const centre = (fin - (G.heatsink.finCount - 1) / 2) * G.heatsink.finPitch * mm;
      finRootWidth += overlap(z0, z1, centre - finThickness / 2, centre + finThickness / 2);
    }
    for (let x = 0; x < pnx; x++) {
      const i = z * pnx + x, rootArea = plate.dx * finRootWidth;
      const baseVolume = plate.dx * plate.dz * G.heatsink.thickness * mm;
      const localFinVolume = rootArea * finHeight;
      capacity[i] = finMaterial.density * finMaterial.specificHeat * (baseVolume + localFinVolume);
      aluminiumMeanWeights[i] = (baseVolume + finEfficiency * localFinVolume) / (plateVolume + finsVolume);
      convection[i] = h * (plate.dx * plate.dz - rootArea + finEfficiency * rootArea / finThickness * (2 * finHeight + finThickness));
      if (x === 0 || x === pnx - 1) convection[i] += h * G.heatsink.thickness * mm * plate.dz;
      if (z === 0 || z === pnz - 1) convection[i] += h * G.heatsink.thickness * mm * plate.dx;
    }
  }
  const { nx: bnx, nz: bnz } = base.description;
  const baseCellVolume = base.dx * base.dz * G.base.thickness * mm;
  const interfaceResistance = G.contactAreaResistanceM2KW + G.base.thickness * mm / (2 * baseMaterial.k) + G.heatsink.thickness * mm / (2 * finMaterial.k);
  const sourceArea = G.source.length * G.source.width * 1e-6;
  const timResistance = G.tim.thickness * mm / (G.tim.conductivityWmK * sourceArea);
  const halfBaseResistance = G.base.thickness * mm / (2 * baseMaterial.k * sourceArea);
  const sourceResistance = G.source.internalResistanceKW + G.tim.contactResistanceKW + timResistance + halfBaseResistance;
  const sourceWeights = new Float64Array(base.count);
  for (let z = 0; z < bnz; z++) for (let x = 0; x < bnx; x++) {
    const local = z * bnx + x, i = base.offset + local;
    const x0 = base.x0 + x * base.dx, x1 = x0 + base.dx, z0 = base.z0 + z * base.dz, z1 = z0 + base.dz;
    capacity[i] = baseMaterial.density * baseMaterial.specificHeat * baseCellVolume;
    const ax0 = Math.max(0, Math.floor((x0 - plate.x0) / plate.dx));
    const ax1 = Math.min(pnx - 1, Math.floor((x1 - plate.x0 - 1e-12) / plate.dx));
    const az0 = Math.max(0, Math.floor((z0 - plate.z0) / plate.dz));
    const az1 = Math.min(pnz - 1, Math.floor((z1 - plate.z0 - 1e-12) / plate.dz));
    for (let az = az0; az <= az1; az++) for (let ax = ax0; ax <= ax1; ax++) {
      const area = overlap(x0, x1, plate.x0 + ax * plate.dx, plate.x0 + (ax + 1) * plate.dx) * overlap(z0, z1, plate.z0 + az * plate.dz, plate.z0 + (az + 1) * plate.dz);
      connect(i, az * pnx + ax, area / interfaceResistance);
    }
    const sourceOverlap = overlap(x0, x1, G.base.centerX * mm - G.source.length * mm / 2, G.base.centerX * mm + G.source.length * mm / 2) * overlap(z0, z1, -G.source.width * mm / 2, G.source.width * mm / 2);
    sourceWeights[local] = sourceOverlap / sourceArea;
    connect(i, source, sourceWeights[local] / sourceResistance);
  }
  capacity[source] = G.source.packageCapacityJK;
  const pipeLinks: PipeLink[] = [];
  let pipeLength = 0;
  for (let i = 1; i < G.pipe.x.length; i++) pipeLength += Math.hypot(G.pipe.x[i] - G.pipe.x[i - 1], G.pipe.y[i] - G.pipe.y[i - 1]) * mm;
  const pipeWallVolume = Math.PI * ((G.pipe.diameter * mm / 2) ** 2 - ((G.pipe.diameter / 2 - G.pipe.wallThickness) * mm) ** 2) * pipeLength;
  const pipeConductance = 1 / (G.pipe.resistanceKW / 2 + G.pipe.bondResistanceKW);
  const evap = new Float64Array(base.count), cond = new Float64Array(plate.count);
  for (let pipe = 0; pipe < settings.heatPipeCount; pipe++) {
    const node = pipeStart + pipe, centreZ = PIPE_LAYOUTS[settings.heatPipeCount][pipe] * mm;
    capacity[node] = pipeWallVolume * MATERIALS.copper.density * MATERIALS.copper.specificHeat;
    let evaporationArea = 0, condensationArea = 0;
    for (let z = 0; z < bnz; z++) for (let x = 0; x < bnx; x++) {
      const i = z * bnx + x;
      evap[i] = base.dx * overlap(base.z0 + z * base.dz, base.z0 + (z + 1) * base.dz, centreZ - G.pipe.diameter * mm / 2, centreZ + G.pipe.diameter * mm / 2);
      evaporationArea += evap[i];
    }
    const pipeX0 = G.pipe.x[0] * mm, pipeX1 = G.pipe.x[G.pipe.x.length - 1] * mm;
    for (let z = 0; z < pnz; z++) for (let x = 0; x < pnx; x++) {
      const x0 = plate.x0 + x * plate.dx, x1 = x0 + plate.dx;
      const outsideBase = overlap(x0, x1, pipeX0, base.x0) + overlap(x0, x1, base.x0 + G.base.length * mm, pipeX1);
      const area = outsideBase * overlap(plate.z0 + z * plate.dz, plate.z0 + (z + 1) * plate.dz, centreZ - G.pipe.diameter * mm / 2, centreZ + G.pipe.diameter * mm / 2);
      cond[z * pnx + x] = area; condensationArea += area;
    }
    for (let i = 0; i < base.count; i++) if (evap[i] > 0) {
      const conductance = pipeConductance * evap[i] / evaporationArea;
      connect(base.offset + i, node, conductance);
      pipeLinks.push({ cell: base.offset + i, pipe: node, conductance });
    }
    for (let i = 0; i < plate.count; i++) if (cond[i] > 0) connect(i, node, pipeConductance * cond[i] / condensationArea);
  }
  for (let i = 0; i < size; i++) diagonal[i] += convection[i];
  return { plate, base, pipeStart, source, size, edgeA: Uint32Array.from(a), edgeB: Uint32Array.from(b), conductance: Float64Array.from(conductances), diagonal, capacity, convection, aluminiumMeanWeights, sourceWeights, pipeLinks, sourceResistance,
    timMeanResistance: halfBaseResistance + G.tim.contactResistanceKW / 2 + timResistance / 2,
    finEfficiency, finM, massKg: (plateVolume + finsVolume) * finMaterial.density + base.count * baseCellVolume * baseMaterial.density + settings.heatPipeCount * pipeWallVolume * MATERIALS.copper.density };
}
function applyMatrix(network: Network, diagonal: Float64Array, x: Float64Array, out: Float64Array): void {
  for (let i = 0; i < network.size; i++) out[i] = diagonal[i] * x[i];
  for (let e = 0; e < network.conductance.length; e++) {
    const i = network.edgeA[e], j = network.edgeB[e], g = network.conductance[e];
    out[i] -= g * x[j]; out[j] -= g * x[i];
  }
}
function solve(network: Network, diagonal: Float64Array, rhs: Float64Array, x: Float64Array, work: Workspace): void {
  const { residual: r, direction: p, product: ap, preconditioned: z } = work;
  applyMatrix(network, diagonal, x, ap);
  let normB = 0, normR = 0, rz = 0;
  for (let i = 0; i < x.length; i++) {
    r[i] = rhs[i] - ap[i]; z[i] = r[i] / diagonal[i]; p[i] = z[i];
    normB += rhs[i] * rhs[i]; normR += r[i] * r[i]; rz += r[i] * z[i];
  }
  const toleranceSquared = Math.max(1, normB) * 1e-20;
  if (normR <= toleranceSquared) return;
  for (let iteration = 0; iteration < 1200; iteration++) {
    applyMatrix(network, diagonal, p, ap);
    let denominator = 0;
    for (let i = 0; i < x.length; i++) denominator += p[i] * ap[i];
    if (!(denominator > 0)) throw new ThermalSimulationError("O sistema térmico perdeu a definição positiva.");
    const alpha = rz / denominator;
    normR = 0;
    for (let i = 0; i < x.length; i++) { x[i] += alpha * p[i]; r[i] -= alpha * ap[i]; normR += r[i] * r[i]; }
    if (normR <= toleranceSquared) return;
    let nextRz = 0;
    for (let i = 0; i < x.length; i++) { z[i] = r[i] / diagonal[i]; nextRz += r[i] * z[i]; }
    const beta = nextRz / rz;
    for (let i = 0; i < x.length; i++) p[i] = z[i] + beta * p[i];
    rz = nextRz;
  }
  throw new ThermalSimulationError("O cálculo térmico não convergiu. O ensaio não foi aceito.");
}
function heatLoss(network: Network, theta: Float64Array): number {
  let total = 0;
  for (let i = 0; i < theta.length; i++) total += network.convection[i] * theta[i];
  return total;
}
function storedEnergy(network: Network, theta: Float64Array): number {
  let total = 0;
  for (let i = 0; i < theta.length; i++) total += network.capacity[i] * theta[i];
  return total;
}
function baseMean(network: Network, theta: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < network.base.count; i++) sum += theta[network.base.offset + i];
  return sum / network.base.count;
}
function heatsinkMean(network: Network, theta: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < network.plate.count; i++) sum += network.aluminiumMeanWeights[i] * theta[i];
  return sum;
}
function maximum(theta: Float64Array, start: number, count: number): number {
  let max = -Infinity;
  for (let i = start; i < start + count; i++) max = Math.max(max, theta[i]);
  return max;
}
function pipeFlows(network: Network, theta: Float64Array, count: number): number[] {
  const flows = new Array<number>(count).fill(0);
  for (const link of network.pipeLinks) flows[link.pipe - network.pipeStart] += link.conductance * (theta[link.cell] - theta[link.pipe]);
  return flows;
}

/** Pure case calculation; all work buffers are local and reused between steps.
 * FVM plates + quasi-steady analytic fins + equivalent isothermal heat pipes.
 * No CFD, measured fan curve, real GPU calibration or heat-pipe dry-out solver.
 */
export function simulateThermalStudy(settings: ThermalSettings, options: SimulationOptions = {}): ThermalDataset {
  validate(settings, options);
  const dt = options.stepSeconds ?? 0.5, duration = options.durationSeconds ?? 300, sampleSeconds = options.sampleSeconds ?? 2;
  const steps = Math.round(duration / dt), sampleEvery = Math.round(sampleSeconds / dt);
  if (!(dt > 0 && duration > 0 && duration <= 1200 && sampleEvery > 0) || !Number.isFinite(steps) || Math.abs(steps * dt - duration) > 1e-8 || Math.abs(sampleEvery * dt - sampleSeconds) > 1e-8 || steps % sampleEvery !== 0) throw new ThermalSimulationError("Passo e duração da simulação são incompatíveis.");
  const network = buildNetwork(settings, options), n = network.size;
  const work: Workspace = { residual: new Float64Array(n), direction: new Float64Array(n), product: new Float64Array(n), preconditioned: new Float64Array(n) };
  const steady = new Float64Array(n), rhs = new Float64Array(n);
  rhs[network.source] = settings.powerW;
  solve(network, network.diagonal, rhs, steady, work);
  const steadyHeatLoss = heatLoss(network, steady), steadyPipeFlows = pipeFlows(network, steady, settings.heatPipeCount);
  const ambient = settings.ambientC;
  const equilibrium = { sourceC: ambient + steady[network.source], baseMeanC: ambient + baseMean(network, steady), baseMaxC: ambient + maximum(steady, network.base.offset, network.base.count), heatsinkMeanC: ambient + heatsinkMean(network, steady), plateMaxC: ambient + maximum(steady, 0, network.plate.count), heatLossW: steadyHeatLoss,
    resistanceKW: settings.powerW === 0 ? null : steady[network.source] / settings.powerW, pipeFlowsW: steadyPipeFlows, pipeCapacityExceeded: steadyPipeFlows.some((value) => Math.abs(value) > G.pipe.assumedCapacityW) };
  const frameCount = steps / sampleEvery + 1;
  const baseFrames = new Float32Array(frameCount * network.base.count), plateFrames = new Float32Array(frameCount * network.plate.count), pipeFrames = new Float32Array(frameCount * settings.heatPipeCount);
  const times: number[] = [], losses: number[] = [];
  const series: Partial<Record<PartId, number[]>> = { gpu: [], base: [], heatsink: [], heatpipes: [], tim: [] };
  const theta = new Float64Array(n), diagonal = new Float64Array(n);
  for (let i = 0; i < n; i++) diagonal[i] = network.diagonal[i] + network.capacity[i] / dt;
  let frameIndex = 0, maxStepEnergyResidualW = 0;
  const save = (time: number): void => {
    times.push(time); losses.push(heatLoss(network, theta));
    series.gpu!.push(ambient + theta[network.source]); series.base!.push(ambient + baseMean(network, theta)); series.heatsink!.push(ambient + heatsinkMean(network, theta));
    let pipeMean = 0, contactMean = 0;
    for (let i = 0; i < network.base.count; i++) {
      const value = theta[network.base.offset + i];
      baseFrames[frameIndex * network.base.count + i] = ambient + value; contactMean += network.sourceWeights[i] * value;
    }
    for (let i = 0; i < network.plate.count; i++) plateFrames[frameIndex * network.plate.count + i] = ambient + theta[i];
    for (let i = 0; i < settings.heatPipeCount; i++) { const value = theta[network.pipeStart + i]; pipeFrames[frameIndex * settings.heatPipeCount + i] = ambient + value; pipeMean += value; }
    series.heatpipes!.push(ambient + pipeMean / settings.heatPipeCount);
    const interfaceFlow = (theta[network.source] - contactMean) / network.sourceResistance;
    series.tim!.push(ambient + contactMean + interfaceFlow * network.timMeanResistance);
    frameIndex++;
  };
  save(0);
  for (let step = 1; step <= steps; step++) {
    const before = storedEnergy(network, theta);
    for (let i = 0; i < n; i++) rhs[i] = network.capacity[i] / dt * theta[i];
    rhs[network.source] += settings.powerW;
    solve(network, diagonal, rhs, theta, work);
    const residual = (storedEnergy(network, theta) - before) / dt + heatLoss(network, theta) - settings.powerW;
    maxStepEnergyResidualW = Math.max(maxStepEnergyResidualW, Math.abs(residual));
    if (step % sampleEvery === 0) save(step * dt);
  }
  const steadyResidual = steadyHeatLoss - settings.powerW;
  if (maxStepEnergyResidualW > Math.max(1, settings.powerW) * 1e-5 || Math.abs(steadyResidual) > Math.max(1, settings.powerW) * 1e-5) throw new ThermalSimulationError("O ensaio não conservou energia na tolerância numérica.");
  return { version: 1, source: "Volumes finitos 2D nas bases, aletas analíticas e heat pipes equivalentes. Geometria autoral; parâmetros não calibrados para a placa comercial.", settings: { ...settings }, timesSeconds: times, temperaturesC: series,
    baseField: { grid: network.base.description, temperaturesC: baseFrames }, heatsinkField: { grid: network.plate.description, temperaturesC: plateFrames }, pipeTemperaturesC: pipeFrames, heatLossW: losses, equilibrium,
    diagnostics: { maxStepEnergyResidualW, steadyEnergyResidualW: steadyResidual, stepSeconds: dt, finEfficiency: network.finEfficiency, finMPerMetre: network.finM, metalMassKg: network.massKg, unknowns: n, sourceToBaseResistanceKW: network.sourceResistance } };
}
