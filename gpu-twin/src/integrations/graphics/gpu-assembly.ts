import * as THREE from "three";
import {
  PART_IDS,
  COOLING_GEOMETRY,
  COOLING_PRESETS,
  DEFAULT_THERMAL_SETTINGS,
  MATERIALS,
  PIPE_LAYOUTS,
  THERMAL_PART_IDS,
  type PartId,
  type TemperatureSnapshot,
  type ThermalDataset,
  type ThermalSample,
  type ThermalSettings,
} from "../../domain_models/gpu-study";
import { ThermalSurfaces } from "./thermal-surfaces";

interface ComponentAssembly {
  readonly group: THREE.Group;
  readonly separation: number;
  readonly materials: THREE.MeshStandardMaterial[];
}

export class GpuAssembly {
  readonly root = new THREE.Group();
  private readonly components = new Map<PartId, ComponentAssembly>();
  private readonly rotors: THREE.Group[] = [];
  private readonly thermals = new ThermalSurfaces();
  private coolingSettings = DEFAULT_THERMAL_SETTINGS;
  private thermalDataset: ThermalDataset | null = null;
  private selected: PartId | null = null;

  constructor() {
    const separation: Record<PartId, number> = {
      shroud: 120,
      fans: 90,
      heatsink: 57,
      heatpipes: 35,
      base: 24,
      tim: 12,
      gpu: 0,
      memory: 0,
      pcb: -15,
      backplate: -45,
      bracket: -15,
    };
    for (const id of PART_IDS) {
      const group = new THREE.Group();
      group.name = id;
      group.userData.partId = id;
      this.root.add(group);
      this.components.set(id, {
        group,
        separation: separation[id],
        materials: [],
      });
    }
    this.buildCircuitBoard();
    this.buildChipAndMemory();
    this.buildCoolingAssembly();
    this.buildFansAndShroud();
    this.buildBackplateAndBracket();
    this.prepareThermalSurfaces();
  }

  private material(
    id: PartId,
    color: number,
    metalness = 0,
    roughness = 0.5,
  ): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color,
      metalness,
      roughness,
    });
    const component = this.components.get(id)!;
    component.materials.push(material);
    return material;
  }

  private mesh(
    id: PartId,
    geometry: THREE.BufferGeometry,
    material: THREE.MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.components.get(id)!.group.add(mesh);
    return mesh;
  }

  private box(
    id: PartId,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    material: THREE.MeshStandardMaterial,
  ): THREE.Mesh {
    return this.mesh(id, new THREE.BoxGeometry(...size), material, ...position);
  }

  private label(
    id: PartId,
    text: string,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    inverted = false,
  ): void {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 128;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#dce5e9";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "600 60px Arial";
    context.fillText(text, 384, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      roughness: 0.7,
    });
    const mesh = this.mesh(
      id,
      new THREE.PlaneGeometry(width, height),
      material,
      x,
      y,
      z,
    );
    mesh.rotation.x = inverted ? Math.PI / 2 : -Math.PI / 2;
  }

  private buildCircuitBoard(): void {
    const board = this.material("pcb", 0x143f36, 0.12, 0.72);
    const black = this.material("pcb", 0x171d24, 0.05, 0.8);
    const metal = this.material("pcb", 0x8a959c, 0.85, 0.3);
    const gold = this.material("pcb", 0xcaa259, 0.8, 0.28);
    this.box("pcb", [224, 1.8, 108], [0, -15, 0], board);
    this.box("pcb", [86, 1.8, 9], [-46, -15, 58], board);
    const contactGeometry = new THREE.BoxGeometry(1.25, 0.15, 7);
    for (let i = 0; i < 48; i++) {
      this.mesh("pcb", contactGeometry, gold, -87 + i * 1.72, -13.95, 58);
      this.mesh("pcb", contactGeometry, gold, -87 + i * 1.72, -16.05, 58);
    }
    const capacitorGeometry = new THREE.CylinderGeometry(2.3, 2.3, 6, 12);
    const resistorGeometry = new THREE.BoxGeometry(3.3, 1.8, 2.1);
    const chokeGeometry = new THREE.BoxGeometry(8, 5, 8);
    for (let i = 0; i < 7; i++) {
      this.mesh("pcb", chokeGeometry, black, 28, -10, -37 + i * 12);
      this.mesh("pcb", capacitorGeometry, metal, 42, -10, -37 + i * 12);
      this.mesh("pcb", resistorGeometry, metal, 18, -12.6, -37 + i * 12);
    }
    for (let i = 0; i < 44; i++) {
      const x = 54 + (i % 8) * 6.8;
      const z = -40 + Math.floor(i / 8) * 15;
      this.mesh(
        "pcb",
        resistorGeometry,
        i % 3 === 0 ? metal : black,
        x,
        -12.9,
        z,
      );
    }
    this.box("pcb", [23, 10, 13], [81, -9, -50], black);
    for (let pin = 0; pin < 8; pin++) {
      this.box(
        "pcb",
        [3.3, 0.4, 3.3],
        [73 + (pin % 4) * 5.2, -3.8, -53 + Math.floor(pin / 4) * 5.2],
        metal,
      );
    }
    const tracePositions: number[] = [];
    for (let i = 0; i < 38; i++) {
      const x = -101 + i * 5.4;
      const z = i % 2 === 0 ? 46 : -45;
      tracePositions.push(x, -13.95, z, x + 7, -13.95, z - Math.sign(z) * 9);
      tracePositions.push(
        x + 7,
        -13.95,
        z - Math.sign(z) * 9,
        x + 24,
        -13.95,
        z - Math.sign(z) * 9,
      );
    }
    const traces = new THREE.BufferGeometry();
    traces.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(tracePositions, 3),
    );
    this.components
      .get("pcb")!
      .group.add(
        new THREE.LineSegments(
          traces,
          new THREE.LineBasicMaterial({ color: 0x317365 }),
        ),
      );
    this.label("pcb", "RTX 3060 / 12 GB", 57, -13.9, 26, 58, 9);
  }

  private buildChipAndMemory(): void {
    const substrate = this.material("gpu", 0x234c47, 0.1, 0.6);
    const silicon = this.material("gpu", 0x91babe, 0.72, 0.15);
    const edge = this.material("gpu", 0xb7c7c9, 0.8, 0.28);
    this.box("gpu", [37, 2.1, 37], [-42, -12.8, 0], substrate);
    const { source, base, tim } = COOLING_GEOMETRY;
    this.box("gpu", [source.length, 0.8, source.width], [base.centerX, base.bottomY - tim.thickness - 0.4, base.centerZ], silicon);
    for (const x of [-58, -26])
      for (const z of [-15, 15])
        this.box("gpu", [2, 0.6, 2], [x, -11.45, z], edge);
    const memory = this.material("memory", 0x19212a, 0.08, 0.75);
    for (const x of [-57, -29])
      for (const z of [-32, 32])
        this.box("memory", [12, 2, 14], [x, -12.4, z], memory);
    for (const z of [-13, 13])
      this.box("memory", [14, 2, 12], [-77, -12.4, z], memory);
    const paste = this.material("tim", 0xb4b7be, 0.08, 0.85);
    this.box("tim", [source.length, tim.thickness, source.width], [base.centerX, base.bottomY - tim.thickness / 2, base.centerZ], paste);
  }

  private buildCoolingAssembly(): void {
    const { base, heatsink } = COOLING_GEOMETRY;
    const copper = this.material("base", MATERIALS.copper.color, 0.92, 0.27);
    this.box("base", [base.length, base.thickness, base.width], [base.centerX, base.bottomY + base.thickness / 2, base.centerZ], copper);
    this.buildHeatPipes();
    const aluminum = this.material("heatsink", MATERIALS.aluminium.color, 0.88, 0.3);
    this.box("heatsink", [heatsink.length, heatsink.thickness, heatsink.width], [0, heatsink.bottomY + heatsink.thickness / 2, 0], aluminum);
    const fins = new THREE.InstancedMesh(
      new THREE.BoxGeometry(heatsink.length, heatsink.finHeight, heatsink.finThickness),
      aluminum, heatsink.finCount,
    );
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < heatsink.finCount; i++) {
      matrix.makeTranslation(0, heatsink.bottomY + heatsink.thickness + heatsink.finHeight / 2, (i - (heatsink.finCount - 1) / 2) * heatsink.finPitch);
      fins.setMatrixAt(i, matrix);
    }
    fins.instanceMatrix.needsUpdate = true;
    fins.castShadow = true;
    fins.receiveShadow = true;
    this.components.get("heatsink")!.group.add(fins);
  }

  private buildHeatPipes(): void {
    const pipe = COOLING_GEOMETRY.pipe;
    const material = this.material("heatpipes", 0xc89061, 0.88, 0.24);
    PIPE_LAYOUTS[this.coolingSettings.heatPipeCount].forEach((z, index) => {
      const curve = new THREE.CatmullRomCurve3(pipe.x.map((x, i) => new THREE.Vector3(x, pipe.y[i], z)));
      const mesh = this.mesh("heatpipes", new THREE.TubeGeometry(curve, 36, pipe.diameter / 2, 10, false), material, 0, 0, 0);
      mesh.userData.pipeIndex = index;
    });
  }

  private prepareThermalSurfaces(): void {
    for (const [id, component] of this.components) {
      if (THERMAL_PART_IDS.includes(id)) {
        component.group.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const surface = id === "base" ? "base" : id === "heatsink" ? object instanceof THREE.InstancedMesh ? "fin" : "plate" : "scalar";
          this.thermals.bind(object, id, surface, id === "heatpipes" ? object.userData.pipeIndex : null);
        });
      } else for (const material of component.materials) this.thermals.registerGhost(material);
    }
  }

  setCoolingSettings(settings: ThermalSettings): void {
    if (settings.heatPipeCount !== this.coolingSettings.heatPipeCount) {
      const pipes = this.components.get("heatpipes")!;
      this.thermals.unbindPart("heatpipes");
      while (pipes.group.children.length) {
        const object = pipes.group.children.at(-1)!;
        if (object instanceof THREE.Mesh) object.geometry.dispose();
        pipes.group.remove(object);
      }
      for (const material of pipes.materials) material.dispose();
      pipes.materials.length = 0;
      this.coolingSettings = settings;
      this.buildHeatPipes();
      this.prepareThermalSurfaces();
    }
    this.coolingSettings = settings;
    const preset = COOLING_PRESETS[settings.preset];
    for (const id of ["base", "heatsink"] as const) {
      const component = this.components.get(id)!;
      const color = MATERIALS[preset[id === "base" ? "base" : "heatsink"]].color;
      for (const material of component.materials) material.color.setHex(color);
    }
    this.setSelected(this.selected);
  }

  private buildFansAndShroud(): void {
    const graphite = this.material("shroud", 0x292f39, 0.35, 0.46);
    const silver = this.material("shroud", 0x818b96, 0.75, 0.37);
    const dark = this.material("fans", 0x151a21, 0.22, 0.46);
    const bladeMaterial = this.material("fans", 0x303740, 0.4, 0.36);
    const fanSilver = this.material("fans", 0x818b96, 0.75, 0.37);
    const shape = new THREE.Shape();
    shape.moveTo(-113, -46);
    shape.lineTo(-105, -54);
    shape.lineTo(105, -54);
    shape.lineTo(113, -46);
    shape.lineTo(113, 46);
    shape.lineTo(105, 54);
    shape.lineTo(-105, 54);
    shape.lineTo(-113, 46);
    shape.closePath();
    for (const x of [-55, 55]) {
      const hole = new THREE.Path();
      hole.absarc(x, 0, 44.5, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    const shroudGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: 2.4,
      bevelEnabled: true,
      bevelThickness: 0.7,
      bevelSize: 0.8,
      bevelSegments: 2,
      curveSegments: 48,
    });
    shroudGeometry.rotateX(-Math.PI / 2);
    this.mesh("shroud", shroudGeometry, graphite, 0, 19.7, 0);
    for (const z of [-53, 53])
      this.box("shroud", [215, 10, 3], [0, 15, z], graphite);
    for (const x of [-111, 111])
      this.box("shroud", [3, 10, 94], [x, 15, 0], graphite);
    for (const x of [-55, 55]) {
      const rim = this.mesh(
        "shroud",
        new THREE.TorusGeometry(45.9, 1.2, 8, 64),
        silver,
        x,
        22.5,
        0,
      );
      rim.rotation.x = Math.PI / 2;
    }
    for (const z of [-50, 50]) {
      for (const x of [-90, -10, 10, 90]) {
        const accent = this.box("shroud", [26, 0.9, 4], [x, 23.2, z], silver);
        accent.rotation.y = (x < 0 ? 1 : -1) * 0.28;
      }
    }
    const blade = new THREE.Shape();
    blade.moveTo(10, -2);
    blade.quadraticCurveTo(21, -15, 41, -9);
    blade.quadraticCurveTo(44, -2, 41, 6);
    blade.quadraticCurveTo(24, 0, 12, 7);
    blade.closePath();
    const bladeGeometry = new THREE.ExtrudeGeometry(blade, {
      depth: 1.2,
      bevelEnabled: true,
      bevelSize: 0.4,
      bevelThickness: 0.4,
      bevelSegments: 1,
      curveSegments: 10,
    });
    bladeGeometry.rotateX(-Math.PI / 2);
    const hubGeometry = new THREE.CylinderGeometry(12.5, 13.8, 5, 40);
    const hubRingGeometry = new THREE.TorusGeometry(9.5, 0.5, 6, 32);
    for (const x of [-55, 55]) {
      const rotor = new THREE.Group();
      rotor.position.set(x, 20.3, 0);
      for (let i = 0; i < 11; i++) {
        const bladeMesh = new THREE.Mesh(bladeGeometry, bladeMaterial);
        bladeMesh.rotation.y = (i / 11) * Math.PI * 2;
        bladeMesh.castShadow = true;
        rotor.add(bladeMesh);
      }
      const hub = new THREE.Mesh(hubGeometry, dark);
      hub.position.y = 1.1;
      hub.castShadow = true;
      rotor.add(hub);
      const hubRing = new THREE.Mesh(hubRingGeometry, fanSilver);
      hubRing.rotation.x = Math.PI / 2;
      hubRing.position.y = 3.65;
      rotor.add(hubRing);
      this.components.get("fans")!.group.add(rotor);
      this.rotors.push(rotor);
    }
    this.label("shroud", "GEFORCE RTX", 0, 23.4, -48, 47, 6);
  }

  private buildBackplateAndBracket(): void {
    const black = this.material("backplate", 0x252c34, 0.4, 0.6);
    const screwMaterial = this.material("backplate", 0x869099, 0.8, 0.34);
    const plateShape = new THREE.Shape();
    plateShape.moveTo(-112, -51);
    plateShape.lineTo(105, -51);
    plateShape.lineTo(112, -44);
    plateShape.lineTo(112, 44);
    plateShape.lineTo(105, 51);
    plateShape.lineTo(-112, 51);
    plateShape.closePath();
    for (let row = 0; row < 7; row++) {
      const hole = new THREE.Path();
      hole.moveTo(64, -33 + row * 10);
      hole.lineTo(98, -33 + row * 10);
      hole.lineTo(98, -28 + row * 10);
      hole.lineTo(64, -28 + row * 10);
      hole.closePath();
      plateShape.holes.push(hole);
    }
    const plate = new THREE.ExtrudeGeometry(plateShape, {
      depth: 1.5,
      bevelEnabled: false,
    });
    plate.rotateX(Math.PI / 2);
    this.mesh("backplate", plate, black, 0, -18.8, 0);
    const screwGeometry = new THREE.CylinderGeometry(1.8, 1.8, 0.7, 12);
    for (const x of [-103, -24, 53, 104])
      for (const z of [-43, 43])
        this.mesh("backplate", screwGeometry, screwMaterial, x, -20.7, z);
    this.label("backplate", "GEFORCE RTX", -17, -20.4, 0, 74, 12, true);
    const bracketMetal = this.material("bracket", 0x9aa7b2, 0.87, 0.3);
    const portMaterial = this.material("bracket", 0x121921, 0.25, 0.55);
    this.box("bracket", [1.4, 38, 4], [-117, 0, -51], bracketMetal);
    this.box("bracket", [1.4, 38, 4], [-117, 0, 51], bracketMetal);
    this.box("bracket", [1.4, 3, 106], [-117, 19, 0], bracketMetal);
    this.box("bracket", [1.4, 3, 106], [-117, -18, 0], bracketMetal);
    for (let i = 0; i < 12; i++)
      this.box("bracket", [1.4, 17, 2], [-117, 8, -44 + i * 8], bracketMetal);
    for (let i = 0; i < 4; i++) {
      this.box("bracket", [9, 8, 18], [-113, -9, -36 + i * 24], bracketMetal);
      this.box(
        "bracket",
        [0.8, 5, i === 3 ? 12 : 14],
        [-117.9, -9, -36 + i * 24],
        portMaterial,
      );
    }
    this.box("bracket", [13, 2, 10], [-117, -20, 57], bracketMetal);
  }

  setExplosion(amount: number): void {
    for (const component of this.components.values())
      component.group.position.y = component.separation * amount;
  }

  setVisible(id: PartId, visible: boolean): void {
    this.components.get(id)!.group.visible = visible;
  }

  setSelected(id: PartId | null): void {
    this.selected = id;
    for (const [partId, component] of this.components) {
      for (const material of component.materials) {
        material.emissive.setHex(partId === id ? 0x55e5be : 0x000000);
        material.emissiveIntensity = partId === id ? 0.23 : 0;
      }
    }
  }

  setThermal(
    dataset: ThermalDataset | null,
    sample: ThermalSample | null,
    temperatures: TemperatureSnapshot | null,
    enabled: boolean,
  ): void {
    if (dataset !== this.thermalDataset) {
      this.thermalDataset = dataset;
      this.thermals.setDataset(dataset);
    }
    if (this.thermals.enabled !== (enabled && dataset !== null)) this.thermals.setEnabled(enabled);
    if (enabled && sample && temperatures) this.thermals.update(sample, temperatures);
  }

  isPickable(id: PartId): boolean {
    return this.thermals.isPickable(id);
  }

  update(elapsedSeconds: number, animateFans: boolean): void {
    if (animateFans)
      for (const rotor of this.rotors) rotor.rotation.y -= elapsedSeconds * 7;
  }

  dispose(): void {
    this.thermals.dispose();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.root.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.LineSegments
      ) {
        geometries.add(object.geometry);
        const list = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of list) {
          materials.add(material);
          if (material instanceof THREE.MeshStandardMaterial && material.map)
            textures.add(material.map);
        }
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
  }
}
