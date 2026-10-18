import * as THREE from "three";
import {
  COOLING_GEOMETRY,
  THERMAL_COLOR_RANGE,
  THERMAL_PART_IDS,
  type PartId,
  type TemperatureSnapshot,
  type ThermalDataset,
  type ThermalFieldFrames,
  type ThermalSample,
} from "../../domain_models/gpu-study";

type Surface = "base" | "plate" | "fin" | "scalar";
interface Binding {
  readonly mesh: THREE.Mesh;
  readonly original: THREE.Material | THREE.Material[];
  readonly material: THREE.ShaderMaterial;
  readonly part: PartId;
  readonly surface: Surface;
  readonly pipeIndex: number | null;
}
const vertexShader = `
uniform vec3 uOffset;
varying vec3 vThermalPosition;
void main() {
  vec4 localPosition = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    localPosition = instanceMatrix * localPosition;
  #endif
  vThermalPosition = localPosition.xyz + uOffset;
  gl_Position = projectionMatrix * modelViewMatrix * localPosition;
}`;
const fragmentShader = `
uniform sampler2D uField;
uniform vec2 uOrigin;
uniform vec2 uSize;
uniform vec2 uRange;
uniform float uTemperature;
uniform float uSpatial;
uniform float uFin;
uniform float uAmbient;
uniform float uFinM;
uniform float uFinHeight;
uniform float uCorrectedHeight;
uniform float uRootY;
uniform vec3 uCold;
uniform vec3 uCool;
uniform vec3 uWarm;
uniform vec3 uHot;
varying vec3 vThermalPosition;
void main() {
  float temperature = uTemperature;
  if (uSpatial > 0.5) {
    vec2 uv = clamp((vThermalPosition.xz - uOrigin) / uSize, vec2(0.0), vec2(1.0));
    vec4 encodedTexel = texture2D(uField, uv);
    temperature = (encodedTexel.r * 65280.0 + encodedTexel.g * 255.0) * (1024.0 / 65535.0);
  }
  if (uFin > 0.5) {
    float height = clamp(vThermalPosition.y - uRootY, 0.0, uFinHeight);
    float a = uFinM * (uCorrectedHeight - height);
    float b = uFinM * uCorrectedHeight;
    temperature = uAmbient + (temperature - uAmbient) * (exp(a) + exp(-a)) / (exp(b) + exp(-b));
  }
  float t = clamp((temperature - uRange.x) / (uRange.y - uRange.x), 0.0, 1.0);
  vec3 color;
  if (t < 0.333333) color = mix(uCold, uCool, t * 3.0);
  else if (t < 0.666667) color = mix(uCool, uWarm, (t - 0.333333) * 3.0);
  else color = mix(uWarm, uHot, (t - 0.666667) * 3.0);
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}`;

/** Only the graphics adapter knows textures/shaders. Physics data stays in °C. */
export class ThermalSurfaces {
  enabled = false;
  private dataset: ThermalDataset | null = null;
  private baseTexture = this.texture(1, 1);
  private plateTexture = this.texture(1, 1);
  private readonly bindings = new Map<THREE.Mesh, Binding>();
  private readonly ghosts = new Map<THREE.Material, { transparent: boolean; opacity: number; depthWrite: boolean }>();

  private texture(nx: number, nz: number): THREE.DataTexture {
    const texture = new THREE.DataTexture(new Uint8Array(nx * nz * 4), nx, nz, THREE.RGBAFormat);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  bind(mesh: THREE.Mesh, part: PartId, surface: Surface, pipeIndex: number | null = null): void {
    if (this.bindings.has(mesh)) return;
    const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, toneMapped: false,
      uniforms: {
        uOffset: { value: mesh.position.clone() }, uField: { value: this.baseTexture },
        uOrigin: { value: new THREE.Vector2() }, uSize: { value: new THREE.Vector2(1, 1) },
        uRange: { value: new THREE.Vector2(...THERMAL_COLOR_RANGE) }, uTemperature: { value: 25 },
        uSpatial: { value: surface === "scalar" ? 0 : 1 }, uFin: { value: surface === "fin" ? 1 : 0 },
        uAmbient: { value: 25 }, uFinM: { value: 0 }, uFinHeight: { value: COOLING_GEOMETRY.heatsink.finHeight },
        uCorrectedHeight: { value: COOLING_GEOMETRY.heatsink.finHeight + COOLING_GEOMETRY.heatsink.finThickness / 2 },
        uRootY: { value: COOLING_GEOMETRY.heatsink.bottomY + COOLING_GEOMETRY.heatsink.thickness },
        uCold: { value: new THREE.Color(0x2563eb) }, uCool: { value: new THREE.Color(0x22d3ee) },
        uWarm: { value: new THREE.Color(0xfacc15) }, uHot: { value: new THREE.Color(0xef4444) },
      },
    });
    this.bindings.set(mesh, { mesh, original: mesh.material, material, part, surface, pipeIndex });
    if (this.dataset) this.configure(this.bindings.get(mesh)!);
    if (this.enabled) mesh.material = material;
  }

  unbindPart(part: PartId): void {
    for (const [mesh, binding] of this.bindings) if (binding.part === part) {
      mesh.material = binding.original;
      binding.material.dispose();
      this.bindings.delete(mesh);
    }
  }

  registerGhost(material: THREE.Material): void {
    if (this.ghosts.has(material)) return;
    this.ghosts.set(material, { transparent: material.transparent, opacity: material.opacity, depthWrite: material.depthWrite });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled && this.dataset !== null;
    for (const binding of this.bindings.values()) binding.mesh.material = this.enabled ? binding.material : binding.original;
    for (const [material, original] of this.ghosts) {
      const transparent = this.enabled || original.transparent;
      if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
      material.opacity = this.enabled ? 0.12 : original.opacity;
      material.depthWrite = this.enabled ? false : original.depthWrite;
    }
  }

  setDataset(dataset: ThermalDataset | null): void {
    this.dataset = dataset;
    if (!dataset) { this.setEnabled(false); return; }
    const base = dataset.baseField.grid, plate = dataset.heatsinkField.grid;
    if (this.baseTexture.image.width !== base.nx || this.baseTexture.image.height !== base.nz) {
      this.baseTexture.dispose(); this.baseTexture = this.texture(base.nx, base.nz);
    }
    if (this.plateTexture.image.width !== plate.nx || this.plateTexture.image.height !== plate.nz) {
      this.plateTexture.dispose(); this.plateTexture = this.texture(plate.nx, plate.nz);
    }
    for (const binding of this.bindings.values()) this.configure(binding);
  }

  private configure(binding: Binding): void {
    const dataset = this.dataset!;
    const grid = binding.surface === "base" ? dataset.baseField.grid : dataset.heatsinkField.grid;
    const uniforms = binding.material.uniforms;
    uniforms.uField.value = binding.surface === "base" ? this.baseTexture : this.plateTexture;
    uniforms.uOrigin.value.set(grid.originXmm, grid.originZmm);
    uniforms.uSize.value.set(grid.lengthMm, grid.widthMm);
    uniforms.uAmbient.value = dataset.settings.ambientC;
    uniforms.uFinM.value = dataset.diagnostics.finMPerMetre * 0.001;
  }

  update(sample: ThermalSample, temperatures: TemperatureSnapshot): void {
    const dataset = this.dataset;
    if (!dataset) return;
    this.upload(dataset.baseField, sample, this.baseTexture);
    this.upload(dataset.heatsinkField, sample, this.plateTexture);
    for (const binding of this.bindings.values()) if (binding.surface === "scalar") {
      let value = temperatures[binding.part] ?? dataset.settings.ambientC;
      if (binding.pipeIndex !== null) {
        const count = dataset.settings.heatPipeCount;
        const left = dataset.pipeTemperaturesC[sample.left * count + binding.pipeIndex];
        value = left + (dataset.pipeTemperaturesC[sample.right * count + binding.pipeIndex] - left) * sample.fraction;
      }
      binding.material.uniforms.uTemperature.value = value;
    }
  }

  private upload(field: ThermalFieldFrames, sample: ThermalSample, texture: THREE.DataTexture): void {
    const count = field.grid.nx * field.grid.nz, data = texture.image.data as Uint8Array;
    const left = sample.left * count, right = sample.right * count;
    for (let i = 0; i < count; i++) {
      const a = field.temperaturesC[left + i];
      const temperature = a + (field.temperaturesC[right + i] - a) * sample.fraction;
      const packed = Math.round(Math.min(1, Math.max(0, temperature / 1024)) * 65535);
      data[4 * i] = packed >>> 8; data[4 * i + 1] = packed & 255; data[4 * i + 3] = 255;
    }
    texture.needsUpdate = true;
  }

  isPickable(part: PartId): boolean {
    return !this.enabled || THERMAL_PART_IDS.includes(part);
  }

  dispose(): void {
    for (const binding of this.bindings.values()) { binding.mesh.material = binding.original; binding.material.dispose(); }
    this.bindings.clear(); this.ghosts.clear(); this.baseTexture.dispose(); this.plateTexture.dispose();
  }
}
