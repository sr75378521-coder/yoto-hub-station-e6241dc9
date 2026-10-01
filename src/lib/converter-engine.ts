import type { FFmpeg } from "@ffmpeg/ffmpeg";
import wasmAsset from "@/assets/ffmpeg-core.wasm.asset.json";
import wasmMtAsset from "@/assets/ffmpeg-core-mt.wasm.asset.json";
// Self-contained copy of @ffmpeg/ffmpeg's worker: served from a blob URL so it inherits
// the page's cross-origin isolation (needed for the multi-threaded core).
import workerSource from "./ffmpeg-worker.bundled.js?raw";
import { buildArgs, getContainer, normalizeSpec, outputFileName, type OutputSpec } from "./formats";

export type JobStatus = "queued" | "converting" | "done" | "error" | "cancelled";

export interface Job {
  id: string;
  file: File;
  status: JobStatus;
  progress: number; // 0..1
  outputName?: string | undefined;
  outputBlob?: Blob | undefined;
  outputSize?: number | undefined;
  error?: string | undefined;
  startedAt?: number | undefined;
  finishedAt?: number | undefined;
}

export interface EngineState {
  jobs: Job[];
  running: boolean;
  engineReady: boolean;
  engineLoading: boolean;
  engineError?: string | undefined;
  workers: number;
  threaded: boolean;
}

type Listener = () => void;

const CORE_URL = "/ffmpeg-core.js";
const WASM_URL = wasmAsset.url;
const CORE_MT_URL = "/ffmpeg-core-mt.js";
const WASM_MT_URL = wasmMtAsset.url;
const WORKER_MT_URL = "/ffmpeg-core-mt.worker.js";

/** Multi-threaded ffmpeg needs SharedArrayBuffer, which needs cross-origin isolation. */
export function canUseThreads(): boolean {
  return typeof window !== "undefined" && window.crossOriginIsolated === true && typeof SharedArrayBuffer !== "undefined";
}

function defaultWorkers(): number {
  if (typeof navigator === "undefined") return 2;
  const cores = navigator.hardwareConcurrency || 4;
  // With the threaded core each worker already uses several cores, so fewer workers is faster.
  if (canUseThreads()) return Math.max(1, Math.min(3, Math.round(cores / 4)));
  return Math.max(1, Math.min(4, cores - 1));
}

class Slot {
  ffmpeg: FFmpeg | null = null;
  busy = false;
  currentJob: string | null = null;
}

/**
 * Runs a pool of independent ffmpeg.wasm workers so several files convert at once.
 * Everything happens in the browser: no uploads, no server, no cost.
 */
class ConverterEngine {
  private state: EngineState = {
    jobs: [],
    running: false,
    engineReady: false,
    engineLoading: false,
    workers: defaultWorkers(),
    threaded: canUseThreads(),
  };
  private listeners = new Set<Listener>();
  private slots: Slot[] = [];
  private cancelRequested = false;
  private spec: OutputSpec | null = null;
  private coreBlob: Promise<string> | null = null;
  private wasmBlob: Promise<string> | null = null;
  private workerBlob: Promise<string> | null = null;
  private classWorkerURL: string | null = null;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = () => this.state;

  private set(patch: Partial<EngineState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
  private updateJob(id: string, patch: Partial<Job>) {
    this.set({ jobs: this.state.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) });
  }

  setWorkers(n: number) {
    if (this.state.running) return;
    this.set({ workers: Math.max(1, Math.min(8, n)) });
  }

  addFiles(files: File[]) {
    const existing = new Set(this.state.jobs.map((j) => `${j.file.name}:${j.file.size}`));
    const fresh = files
      .filter((f) => !existing.has(`${f.name}:${f.size}`))
      .map<Job>((file) => ({ id: crypto.randomUUID(), file, status: "queued", progress: 0 }));
    this.set({ jobs: [...this.state.jobs, ...fresh] });
  }
  removeJob(id: string) {
    if (this.state.running) return;
    this.set({ jobs: this.state.jobs.filter((j) => j.id !== id) });
  }
  clearFinished() {
    this.set({ jobs: this.state.jobs.filter((j) => j.status === "queued" || j.status === "converting") });
  }
  clearAll() {
    if (this.state.running) return;
    this.set({ jobs: [] });
  }
  resetForRetry() {
    this.set({
      jobs: this.state.jobs.map((j) =>
        j.status === "error" || j.status === "cancelled" ? { ...j, status: "queued", progress: 0, error: undefined } : j,
      ),
    });
  }

  private async createFFmpeg(): Promise<FFmpeg> {
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import("@ffmpeg/ffmpeg"), import("@ffmpeg/util")]);
    // Blob URLs let the worker import the core regardless of dev/prod hosting rules.
    const mt = this.state.threaded;
    const [coreURL, wasmURL, workerURL] = await Promise.all([
      this.coreBlob ?? (this.coreBlob = toBlobURL(mt ? CORE_MT_URL : CORE_URL, "text/javascript")),
      this.wasmBlob ?? (this.wasmBlob = toBlobURL(mt ? WASM_MT_URL : WASM_URL, "application/wasm")),
      mt ? (this.workerBlob ?? (this.workerBlob = toBlobURL(WORKER_MT_URL, "text/javascript"))) : Promise.resolve(""),
    ]);
    if (!this.classWorkerURL) {
      this.classWorkerURL = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
    }
    const classWorkerURL = this.classWorkerURL;
    const ff = new FFmpeg();
    await ff.load(mt ? { classWorkerURL, coreURL, wasmURL, workerURL } : { classWorkerURL, coreURL, wasmURL });
    return ff;
  }

  /** Warm up one worker so the first click is instant. */
  async preload() {
    if (this.state.engineReady || this.state.engineLoading) return;
    this.set({ engineLoading: true, engineError: undefined });
    try {
      const slot = new Slot();
      slot.ffmpeg = await this.createFFmpeg();
      this.attachProgress(slot);
      this.slots = [slot];
      this.set({ engineReady: true, engineLoading: false });
    } catch (e) {
      this.set({ engineLoading: false, engineError: e instanceof Error ? e.message : "Failed to load the conversion engine" });
    }
  }

  private attachProgress(slot: Slot) {
    slot.ffmpeg?.on("progress", ({ progress }) => {
      if (!slot.currentJob) return;
      const p = Number.isFinite(progress) ? Math.min(0.99, Math.max(0, progress)) : 0;
      this.updateJob(slot.currentJob, { progress: p });
    });
  }

  private async ensureSlots(n: number) {
    while (this.slots.length < n) {
      const slot = new Slot();
      slot.ffmpeg = await this.createFFmpeg();
      this.attachProgress(slot);
      this.slots.push(slot);
    }
  }

  async start(spec: OutputSpec) {
    if (this.state.running) return;
    this.spec = normalizeSpec(spec);
    this.cancelRequested = false;
    this.set({ running: true, engineLoading: !this.state.engineReady, engineError: undefined });

    try {
      await this.ensureSlots(1);
      this.set({ engineReady: true, engineLoading: false });
      const queued = this.state.jobs.filter((j) => j.status === "queued").length;
      const n = Math.max(1, Math.min(this.state.workers, queued));
      // spin up remaining workers in the background while the first one starts
      const extra = this.ensureSlots(n).catch(() => {});
      const runners = this.slots.map((s) => this.runLoop(s));
      await extra;
      runners.push(...this.slots.slice(runners.length).map((s) => this.runLoop(s)));
      await Promise.all(runners);
    } catch (e) {
      this.set({ engineError: e instanceof Error ? e.message : "Conversion engine failed to start", engineLoading: false });
    } finally {
      this.set({ running: false });
    }
  }

  private nextJob(): Job | undefined {
    if (this.cancelRequested) return undefined;
    const job = this.state.jobs.find((j) => j.status === "queued");
    if (job) this.updateJob(job.id, { status: "converting", progress: 0, startedAt: Date.now() });
    return job;
  }

  private async runLoop(slot: Slot) {
    let job: Job | undefined;
    while ((job = this.nextJob())) {
      slot.busy = true;
      slot.currentJob = job.id;
      try {
        await this.convertOne(slot, job);
      } catch (e) {
        if (this.cancelRequested) {
          this.updateJob(job.id, { status: "cancelled" });
        } else {
          this.updateJob(job.id, { status: "error", error: e instanceof Error ? e.message : String(e), finishedAt: Date.now() });
          // a crashed worker is unreliable: replace it
          try { slot.ffmpeg?.terminate(); } catch { /* ignore */ }
          try {
            slot.ffmpeg = await this.createFFmpeg();
            this.attachProgress(slot);
          } catch {
            slot.ffmpeg = null;
            break;
          }
        }
      } finally {
        slot.busy = false;
        slot.currentJob = null;
      }
    }
  }

  private async convertOne(slot: Slot, job: Job) {
    const ff = slot.ffmpeg;
    const spec = this.spec;
    if (!ff || !spec) throw new Error("Engine not ready");

    const ext = job.file.name.split(".").pop() || "bin";
    const inName = `in_${job.id}.${ext}`;
    const outName = `out_${job.id}.${getContainer(spec.container).ext}`;
    const logs: string[] = [];
    const onLog = ({ message }: { message: string }) => {
      logs.push(message);
      if (logs.length > 40) logs.shift();
    };
    ff.on("log", onLog);

    try {
      await ff.writeFile(inName, new Uint8Array(await job.file.arrayBuffer()));
      const code = await ff.exec(buildArgs(inName, outName, spec));
      if (code !== 0) {
        const hint = logs.filter((l) => /error|invalid|not supported|unknown/i.test(l)).slice(-2).join(" ");
        throw new Error(hint || `ffmpeg exited with code ${code}`);
      }
      const data = (await ff.readFile(outName)) as Uint8Array;
      if (!data.byteLength) throw new Error("Output was empty");
      const blob = new Blob([data as BlobPart], { type: getContainer(spec.container).mime });
      this.updateJob(job.id, {
        status: "done",
        progress: 1,
        outputBlob: blob,
        outputSize: blob.size,
        outputName: outputFileName(job.file.name, spec),
        finishedAt: Date.now(),
      });
    } finally {
      ff.off("log", onLog);
      await ff.deleteFile(inName).catch(() => {});
      await ff.deleteFile(outName).catch(() => {});
    }
  }

  cancel() {
    if (!this.state.running) return;
    this.cancelRequested = true;
    for (const s of this.slots) {
      try { s.ffmpeg?.terminate(); } catch { /* ignore */ }
    }
    this.slots = [];
    this.set({
      engineReady: false,
      jobs: this.state.jobs.map((j) => (j.status === "converting" ? { ...j, status: "cancelled", progress: 0 } : j)),
    });
  }
}

let engine: ConverterEngine | null = null;
export function getEngine(): ConverterEngine {
  if (!engine) engine = new ConverterEngine();
  return engine;
}
