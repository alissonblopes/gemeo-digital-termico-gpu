import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  GpuDisplayError,
  PART_IDS,
  type CameraView,
  type PartId,
  type TemperatureSnapshot,
  type ThermalDataset,
  type ThermalSample,
  type ThermalSettings,
} from "../../domain_models/gpu-study";
import { GpuAssembly } from "./gpu-assembly";

export class GpuViewport {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(36, 1, 0.5, 2000);
  private readonly controls: OrbitControls;
  private readonly assembly = new GpuAssembly();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly observer: ResizeObserver;
  private readonly environment: THREE.WebGLRenderTarget;
  private selectionHandler: ((id: PartId | null) => void) | null = null;
  private pointerDown: readonly [number, number] = [0, 0];
  private autoRotate = false;
  private explosion = 0;
  private readonly floor: THREE.GridHelper;

  constructor(private readonly container: HTMLElement) {
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
    } catch {
      this.assembly.dispose();
      throw new GpuDisplayError(
        "WebGL indisponível. Ative a aceleração gráfica do navegador para abrir o modelo 3D.",
      );
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Modelo 3D interativo da RTX 3060. Arraste para girar e role para aproximar.",
    );
    this.renderer.domElement.tabIndex = 0;
    container.append(this.renderer.domElement);
    const environmentScene = new RoomEnvironment();
    const generator = new THREE.PMREMGenerator(this.renderer);
    this.environment = generator.fromScene(environmentScene, 0.04);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.65;
    environmentScene.dispose();
    generator.dispose();
    this.scene.add(new THREE.HemisphereLight(0xd2e7ff, 0x293b3c, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 2.3);
    key.position.set(80, 280, 120);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    key.shadow.camera.left = -220;
    key.shadow.camera.right = 220;
    key.shadow.camera.top = 220;
    key.shadow.camera.bottom = -220;
    key.shadow.normalBias = 0.8;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x97c7c0, 0.7);
    rim.position.set(-120, 60, -180);
    this.scene.add(rim);
    this.floor = new THREE.GridHelper(800, 40, 0x2b5551, 0x1a3338);
    this.floor.position.y = -71;
    const gridMaterials = Array.isArray(this.floor.material)
      ? this.floor.material
      : [this.floor.material];
    for (const material of gridMaterials) {
      material.transparent = true;
      material.opacity = 0.32;
    }
    this.scene.add(this.floor, this.assembly.root);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.minDistance = 120;
    this.controls.maxDistance = 1050;
    this.controls.target.set(0, 10, 0);
    this.controls.autoRotateSpeed = 0.7;
    this.resize();
    this.setCamera("perspective");
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.renderer.domElement.addEventListener(
      "pointerdown",
      this.onPointerDown,
    );
    this.renderer.domElement.addEventListener("pointerup", this.onPointerUp);
    this.renderer.domElement.addEventListener(
      "webglcontextlost",
      this.onContextLost,
    );
  }

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    this.container.dispatchEvent(
      new CustomEvent("gpu-display-error", {
        detail:
          "O contexto gráfico foi perdido. Recarregue a página para retomar a visualização.",
      }),
    );
  };

  private onPointerDown = (event: PointerEvent): void => {
    this.pointerDown = [event.clientX, event.clientY];
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (
      event.button !== 0 ||
      Math.hypot(
        event.clientX - this.pointerDown[0],
        event.clientY - this.pointerDown[1],
      ) > 5
    )
      return;
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.assembly.root, true);
    for (const hit of hits) {
      let current: THREE.Object3D | null = hit.object;
      let id: PartId | null = null;
      let visible = true;
      while (current && current !== this.assembly.root) {
        visible = visible && current.visible;
        if (PART_IDS.includes(current.userData.partId))
          id = current.userData.partId as PartId;
        current = current.parent;
      }
      if (visible && id && this.assembly.isPickable(id)) {
        this.selectionHandler?.(id);
        return;
      }
    }
    this.selectionHandler?.(null);
  };

  private resize(): void {
    const { clientWidth, clientHeight } = this.container;
    this.renderer.setSize(clientWidth, clientHeight);
    this.camera.aspect = clientWidth / Math.max(1, clientHeight);
    this.camera.updateProjectionMatrix();
  }

  setSelectionHandler(handler: (id: PartId | null) => void): void {
    this.selectionHandler = handler;
  }

  setCamera(view: CameraView): void {
    const scale =
      Math.max(1, 1.1 / this.camera.aspect) * (1 + this.explosion * 0.3);
    this.controls.target.set(0, 20 + this.explosion * 20, 0);
    this.camera.up.set(0, 1, 0);
    if (view === "front") {
      this.camera.position.set(0, 430 * scale, 0);
      this.camera.up.set(0, 0, -1);
    } else if (view === "back") {
      this.camera.position.set(0, -430 * scale, 0);
      this.camera.up.set(0, 0, 1);
    } else if (view === "side") this.camera.position.set(360 * scale, 70, 0);
    else this.camera.position.set(240 * scale, 230 * scale, 300 * scale);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  setExplosion(amount: number): void {
    this.assembly.setExplosion(amount);
    this.camera.position.sub(this.controls.target);
    this.controls.target.y += (amount - this.explosion) * 20;
    this.camera.position
      .multiplyScalar((1 + amount * 0.3) / (1 + this.explosion * 0.3))
      .add(this.controls.target);
    this.explosion = amount;
    this.controls.update();
  }
  setVisible(id: PartId, visible: boolean): void {
    this.assembly.setVisible(id, visible);
  }
  setSelected(id: PartId | null): void {
    this.assembly.setSelected(id);
  }
  setThermal(
    dataset: ThermalDataset | null,
    sample: ThermalSample | null,
    temperatures: TemperatureSnapshot | null,
    enabled: boolean,
  ): void {
    this.assembly.setThermal(dataset, sample, temperatures, enabled);
  }

  setCoolingSettings(settings: ThermalSettings): void {
    this.assembly.setCoolingSettings(settings);
  }
  setAutoRotate(enabled: boolean): void {
    this.autoRotate = enabled;
  }

  render(elapsed: number, animateFans: boolean): void {
    this.assembly.update(elapsed, animateFans);
    this.controls.autoRotate = this.autoRotate;
    this.controls.update(elapsed);
    this.renderer.render(this.scene, this.camera);
  }

  async captureImage(): Promise<Blob> {
    this.renderer.render(this.scene, this.camera);
    const { promise, resolve, reject } = Promise.withResolvers<Blob>();
    this.renderer.domElement.toBlob((blob) => {
      if (blob) resolve(blob);
      else
        reject(
          new GpuDisplayError("Não foi possível capturar a imagem do modelo."),
        );
    }, "image/png");
    return promise;
  }

  dispose(): void {
    this.observer.disconnect();
    this.renderer.domElement.removeEventListener(
      "pointerdown",
      this.onPointerDown,
    );
    this.renderer.domElement.removeEventListener("pointerup", this.onPointerUp);
    this.renderer.domElement.removeEventListener(
      "webglcontextlost",
      this.onContextLost,
    );
    this.controls.dispose();
    this.assembly.dispose();
    this.environment.dispose();
    this.floor.geometry.dispose();
    const materials = Array.isArray(this.floor.material)
      ? this.floor.material
      : [this.floor.material];
    for (const material of materials) material.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.DirectionalLight) object.shadow.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
