import {
  DEFAULT_THERMAL_SETTINGS,
  PART_IDS,
  type CameraView,
  type PartId,
  type StudyFrame,
  type ThermalSettings,
  type ThermalSimulator,
} from "../domain_models/gpu-study";
import { advancePlayback, sampleThermalFrame } from "../engines/thermal-playback";
import type { GpuViewport } from "../integrations/graphics/gpu-viewport";

export class GpuStudy {
  private frame: StudyFrame = {
    selected: null, hidden: new Set(), explosion: 0, animateFans: true,
    heatmap: true, requestedSettings: DEFAULT_THERMAL_SETTINGS, calculating: false,
    error: null, dataset: null, temperatures: null, thermalSample: null,
    heatLossW: null, timeSeconds: 0, playing: false, playbackSpeed: 10,
  };
  private listener: ((frame: StudyFrame) => void) | null = null;
  private playbackElapsed = 0;
  private calculationVersion = 0;

  constructor(
    private readonly viewport: GpuViewport,
    private readonly simulator: ThermalSimulator,
  ) {
    viewport.setSelectionHandler((id) => this.selectComponent(id));
  }

  observe(listener: (frame: StudyFrame) => void): void {
    this.listener = listener;
    listener(this.frame);
  }

  private publish(changes: Partial<StudyFrame>): void {
    this.frame = { ...this.frame, ...changes };
    this.listener?.(this.frame);
  }

  selectComponent(id: PartId | null): void {
    this.viewport.setSelected(id);
    this.publish({ selected: id });
  }

  setComponentVisible(id: PartId, visible: boolean): void {
    const hidden = new Set(this.frame.hidden);
    if (visible) hidden.delete(id);
    else hidden.add(id);
    this.viewport.setVisible(id, visible);
    if (!visible && this.frame.selected === id) {
      this.viewport.setSelected(null);
      this.publish({ hidden, selected: null });
    } else this.publish({ hidden });
  }

  isolateComponent(): void {
    const selected = this.frame.selected;
    if (!selected) return;
    const hidden = new Set<PartId>();
    for (const id of PART_IDS) {
      this.viewport.setVisible(id, id === selected);
      if (id !== selected) hidden.add(id);
    }
    this.publish({ hidden });
  }

  restoreComponents(): void {
    for (const id of PART_IDS) this.viewport.setVisible(id, true);
    this.publish({ hidden: new Set() });
  }

  setExplosion(explosion: number): void {
    const amount = Math.min(1, Math.max(0, explosion));
    this.viewport.setExplosion(amount);
    this.publish({ explosion: amount });
  }

  setFanAnimation(enabled: boolean): void {
    this.publish({ animateFans: enabled });
  }

  setCamera(view: CameraView): void {
    this.viewport.setCamera(view);
  }
  setAutoRotation(enabled: boolean): void {
    this.viewport.setAutoRotate(enabled);
  }
  captureImage(): Promise<Blob> {
    return this.viewport.captureImage();
  }

  setHeatmap(heatmap: boolean): void {
    this.viewport.setThermal(this.frame.dataset, this.frame.thermalSample, this.frame.temperatures, heatmap);
    this.publish({ heatmap });
  }

  async calculateStudy(changes: Partial<ThermalSettings> = {}): Promise<void> {
    const version = ++this.calculationVersion;
    const settings: ThermalSettings = { ...this.frame.requestedSettings, ...changes };
    this.playbackElapsed = 0;
    this.viewport.setThermal(null, null, null, false);
    this.publish({
      requestedSettings: settings, calculating: true, error: null,
      dataset: null, temperatures: null, thermalSample: null, heatLossW: null,
      timeSeconds: 0, playing: false,
    });
    try {
      const dataset = await this.simulator.calculate(settings);
      if (version !== this.calculationVersion) return;
      const { sample, temperatures, heatLossW } = sampleThermalFrame(dataset, 0);
      this.viewport.setCoolingSettings(dataset.settings);
      this.viewport.setThermal(dataset, sample, temperatures, this.frame.heatmap);
      this.publish({
        calculating: false, dataset, temperatures, thermalSample: sample,
        heatLossW, timeSeconds: 0, playing: true,
      });
    } catch (error) {
      if (version !== this.calculationVersion) return;
      this.publish({ calculating: false, error: error instanceof Error ? error.message : "Não foi possível calcular o ensaio." });
    }
  }

  seekThermalTime(time: number): void {
    const dataset = this.frame.dataset;
    if (!dataset || !Number.isFinite(time)) return;
    const timeSeconds = Math.min(dataset.timesSeconds.at(-1)!, Math.max(dataset.timesSeconds[0], time));
    const { sample, temperatures, heatLossW } = sampleThermalFrame(dataset, timeSeconds);
    this.viewport.setThermal(dataset, sample, temperatures, this.frame.heatmap);
    this.publish({ timeSeconds, temperatures, thermalSample: sample, heatLossW });
  }

  resetThermalTime(): void {
    this.seekThermalTime(0);
    this.publish({ playing: false });
  }

  togglePlayback(): void {
    const dataset = this.frame.dataset;
    if (!dataset || dataset.timesSeconds.length === 1) return;
    if (
      !this.frame.playing &&
      this.frame.timeSeconds >= dataset.timesSeconds.at(-1)!
    )
      this.seekThermalTime(dataset.timesSeconds[0]);
    this.playbackElapsed = 0;
    this.publish({ playing: !this.frame.playing });
  }

  setPlaybackSpeed(speed: number): void {
    if ([1, 10, 60].includes(speed)) this.publish({ playbackSpeed: speed });
  }

  tick(elapsed: number): void {
    const dataset = this.frame.dataset;
    if (this.frame.playing && dataset) {
      this.playbackElapsed += elapsed;
      if (this.playbackElapsed >= 1 / 30) {
        const time = advancePlayback(
          dataset,
          this.frame.timeSeconds,
          this.playbackElapsed,
          this.frame.playbackSpeed,
        );
        this.playbackElapsed = 0;
        this.seekThermalTime(time);
        if (time >= dataset.timesSeconds.at(-1)!)
          this.publish({ playing: false });
      }
    }
    this.viewport.render(elapsed, this.frame.animateFans);
  }

  dispose(): void {
    this.calculationVersion++;
    this.simulator.dispose();
    this.listener = null;
    this.viewport.dispose();
  }
}
