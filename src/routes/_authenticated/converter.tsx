import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Download, Play, Square, Trash2, Upload } from "lucide-react";
import { zipSync } from "fflate";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { FormatPanel } from "@/components/converter/FormatPanel";
import { FileQueue } from "@/components/converter/FileQueue";
import { PodcastImport } from "@/components/podcast/PodcastImport";
import { downloadBlob } from "@/lib/download";
import { DEFAULT_SPEC, type OutputSpec } from "@/lib/formats";
import type { EngineState } from "@/lib/converter-engine";


export const Route = createFileRoute("/_authenticated/converter")({
  head: () => ({
    meta: [
      { title: "Converter · Yoto Control Center" },
      { name: "description", content: "Convert audio and video files in bulk right in your browser." },
      { property: "og:title", content: "Converter · Yoto Control Center" },
      { property: "og:description", content: "Convert audio and video files in bulk right in your browser." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConverterPage,
});

type Engine = Awaited<ReturnType<typeof loadEngine>>;
const loadEngine = async () => (await import("@/lib/converter-engine")).getEngine();

const EMPTY: EngineState = { jobs: [], running: false, engineReady: false, engineLoading: false, workers: 2, threaded: false };

function ConverterPage() {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [spec, setSpec] = useState<OutputSpec>({ ...DEFAULT_SPEC, container: "mp3" } as OutputSpec);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadEngine().then(setEngine);
  }, []);

  const state = useSyncExternalStore(
    (cb) => (engine ? engine.subscribe(cb) : () => {}),
    () => (engine ? engine.getSnapshot() : EMPTY),
    () => EMPTY,
  ) as EngineState;

  const add = (files: File[]) => engine?.addFiles(files);
  const done = state.jobs.filter((j) => j.status === "done" && j.outputBlob);

  const downloadAll = async () => {
    const entries: Record<string, Uint8Array> = {};
    for (const j of done) entries[j.outputName ?? j.file.name] = new Uint8Array(await j.outputBlob!.arrayBuffer());
    downloadBlob(new Blob([zipSync(entries, { level: 0 }) as BlobPart], { type: "application/zip" }), "converted.zip");
  };

  return (
    <AppShell title="Converter">
      <div className="mx-auto max-w-5xl space-y-4">
        <PodcastImport onImport={add} disabled={state.running} />
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); add(Array.from(e.dataTransfer.files)); }}
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer rounded-xl border-2 border-dashed border-border bg-card p-8 text-center hover:border-primary/60"
        >
          <Upload className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-2 text-sm font-medium">Drop audio or video files here, or click to browse</p>
          <p className="text-xs text-muted-foreground">Up to 80 files · converted on your computer</p>
          <input ref={inputRef} type="file" multiple accept="audio/*,video/*" hidden onChange={(e) => { add(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
              <span className="text-sm font-semibold">{state.jobs.length} files</span>
              <div className="ml-auto flex flex-wrap gap-2">
                {state.running ? (
                  <Button size="sm" variant="destructive" onClick={() => engine?.cancel()}><Square className="h-4 w-4" /> Stop</Button>
                ) : (
                  <Button size="sm" disabled={!state.jobs.length} onClick={() => engine?.start(spec)}><Play className="h-4 w-4" /> Convert all</Button>
                )}
                <Button size="sm" variant="outline" disabled={!done.length} onClick={downloadAll}><Download className="h-4 w-4" /> Download ZIP</Button>
                <Button size="sm" variant="ghost" disabled={state.running || !state.jobs.length} onClick={() => engine?.clearAll()}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
            {state.engineError && <p className="p-3 text-xs text-destructive">{state.engineError}</p>}
            {state.jobs.length ? (
              <FileQueue jobs={state.jobs} running={state.running} onRemove={(id) => engine?.removeJob(id)} />
            ) : (
              <p className="p-8 text-center text-sm text-muted-foreground">No files yet</p>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <FormatPanel spec={spec} onChange={setSpec} workers={state.workers} onWorkersChange={(n) => engine?.setWorkers(n)} disabled={state.running} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
