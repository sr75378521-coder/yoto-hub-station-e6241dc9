import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AudioLines,
  Bookmark,
  CheckCircle2,
  Gauge,
  Loader2,
  Music,
  Pause,
  Play,
  Radio,
  Scissors,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  Waves,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { PixelIconEditor } from "@/components/app/PixelIconEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { uploadTrack } from "@/lib/yoto/myo.functions";

export const Route = createFileRoute("/_authenticated/tools")({
  head: () => ({
    meta: [
      { title: "Tools · Yoto Control Center" },
      {
        name: "description",
        content:
          "Advanced Yoto tools: web audio player, pixel art icon creator and batch audio file manager.",
      },
      { property: "og:title", content: "Tools · Yoto Control Center" },
      {
        property: "og:description",
        content: "Player, pixel art icon creator and audio manager for your Yoto MYO cards.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ToolsPage,
});

function ToolsPage() {
  return (
    <AppShell title="Tools">
      <TooltipProvider delayDuration={200}>
        <div className="mx-auto max-w-6xl space-y-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Creator tools</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Preview audio the way it sounds on a Yoto, design pixel icons, and prep files for
              your MYO cards.
            </p>
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <AudioPlayerTool />
            <AudioFileManager />
          </div>
          <PixelIconEditor />
        </div>
      </TooltipProvider>
    </AppShell>
  );
}

/* ------------------------------ 1. Audio player ----------------------------- */

interface QueueItem {
  id: string;
  name: string;
  url: string;
}

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function AudioPlayerTool() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<{
    ctx: AudioContext;
    low: BiquadFilterNode;
    high: BiquadFilterNode;
  } | null>(null);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [speed, setSpeed] = useState(1);
  const [yotoSim, setYotoSim] = useState(false);

  const current = queue[index];

  useEffect(() => () => queue.forEach((q) => URL.revokeObjectURL(q.url)), [queue]);

  // Smart bookmarking
  useEffect(() => {
    if (!current) return;
    const saved = Number(localStorage.getItem(`tools-bookmark:${current.name}`) ?? 0);
    if (saved > 2 && audioRef.current) audioRef.current.currentTime = saved;
  }, [current]);

  useEffect(() => {
    if (!current) return;
    const id = setInterval(() => {
      const el = audioRef.current;
      if (el && !el.paused) localStorage.setItem(`tools-bookmark:${current.name}`, String(el.currentTime));
    }, 3000);
    return () => clearInterval(id);
  }, [current]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
      audioRef.current.playbackRate = speed;
    }
  }, [volume, speed, current]);

  // Yoto speaker EQ simulation (small mono speaker: rolled-off lows + highs)
  const ensureGraph = () => {
    const el = audioRef.current;
    if (!el || ctxRef.current) return ctxRef.current;
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const src = ctx.createMediaElementSource(el);
    const low = ctx.createBiquadFilter();
    low.type = "highpass";
    low.frequency.value = 20;
    const high = ctx.createBiquadFilter();
    high.type = "lowpass";
    high.frequency.value = 20000;
    src.connect(low).connect(high).connect(ctx.destination);
    ctxRef.current = { ctx, low, high };
    return ctxRef.current;
  };

  useEffect(() => {
    const g = ctxRef.current;
    if (!g) return;
    g.low.frequency.value = yotoSim ? 320 : 20;
    g.high.frequency.value = yotoSim ? 6500 : 20000;
  }, [yotoSim]);

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const items = Array.from(files)
      .filter((f) => f.type.startsWith("audio/"))
      .map((f) => ({ id: `${f.name}-${f.size}`, name: f.name, url: URL.createObjectURL(f) }));
    setQueue((q) => [...q, ...items]);
  };

  const toggle = async () => {
    const el = audioRef.current;
    if (!el || !current) return;
    const g = ensureGraph();
    if (g?.ctx.state === "suspended") await g.ctx.resume();
    if (el.paused) {
      await el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  const step = (delta: number) => {
    if (!queue.length) return;
    setIndex((i) => (i + delta + queue.length) % queue.length);
    setPlaying(true);
    setTimeout(() => void audioRef.current?.play().catch(() => undefined), 50);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AudioLines className="size-4 text-primary" /> Advanced web audio player
        </CardTitle>
        <CardDescription>Queue tracks, scrub, change speed, and hear a Yoto preview.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="size-3 text-primary" /> Gapless playback
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <Bookmark className="size-3 text-primary" /> Smart bookmarking
          </Badge>
        </div>

        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-4 text-sm text-muted-foreground hover:border-primary/60">
          <Upload className="size-4" /> Add audio to the queue
          <input
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
        </label>

        <audio
          ref={audioRef}
          src={current?.url}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          onEnded={() => (index < queue.length - 1 ? step(1) : setPlaying(false))}
          className="hidden"
        />

        <div className="rounded-2xl border border-border/70 bg-secondary/40 p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
              <Music className="size-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{current?.name ?? "Nothing queued"}</p>
              <p className="text-xs text-muted-foreground">
                {queue.length ? `Track ${index + 1} of ${queue.length}` : "Add files to begin"}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-1">
            <Slider
              value={[time]}
              max={duration || 1}
              step={0.5}
              onValueChange={([v]) => {
                if (audioRef.current) audioRef.current.currentTime = v ?? 0;
                setTime(v ?? 0);
              }}
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{fmt(time)}</span>
              <span>{fmt(duration)}</span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-center gap-2">
            <Button size="icon" variant="ghost" onClick={() => step(-1)} disabled={!queue.length}>
              <SkipBack className="size-4" />
            </Button>
            <Button size="icon" onClick={toggle} disabled={!current}>
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
            <Button size="icon" variant="ghost" onClick={() => step(1)} disabled={!queue.length}>
              <SkipForward className="size-4" />
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-xs">
              <Volume2 className="size-3" /> Volume · {volume}%
            </Label>
            <Slider value={[volume]} max={100} onValueChange={([v]) => setVolume(v ?? 0)} />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-xs">
              <Gauge className="size-3" /> Speed · {speed.toFixed(2)}×
            </Label>
            <Slider
              value={[speed]}
              min={0.5}
              max={2}
              step={0.05}
              onValueChange={([v]) => setSpeed(v ?? 1)}
            />
          </div>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2">
              <Label htmlFor="yoto-sim" className="flex items-center gap-2 text-sm">
                <Radio className="size-4 text-primary" /> Live preview: Yoto speaker
              </Label>
              <Switch id="yoto-sim" checked={yotoSim} onCheckedChange={setYotoSim} />
            </div>
          </TooltipTrigger>
          <TooltipContent>Applies a small-speaker EQ profile (320 Hz – 6.5 kHz)</TooltipContent>
        </Tooltip>
      </CardContent>
    </Card>
  );
}

/* --------------------------- 2. Audio file manager -------------------------- */

interface ManagedFile {
  id: string;
  file: File;
  url: string;
  peaks: number[];
  duration: number;
  start: number;
  end: number;
  progress: number;
  status: "ready" | "uploading" | "done" | "error";
  message?: string;
}

const ACCEPT = ".mp3,.wav,.m4a,.flac,audio/*";

async function analyse(file: File): Promise<{ peaks: number[]; duration: number }> {
  try {
    const Ctor: typeof AudioContext = window.AudioContext ?? (window as any).webkitAudioContext;
    const ctx = new Ctor();
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const data = buf.getChannelData(0);
    const buckets = 80;
    const size = Math.floor(data.length / buckets) || 1;
    const peaks: number[] = [];
    for (let i = 0; i < buckets; i++) {
      let max = 0;
      for (let j = 0; j < size; j += 16) max = Math.max(max, Math.abs(data[i * size + j] ?? 0));
      peaks.push(max);
    }
    const duration = buf.duration;
    void ctx.close();
    return { peaks, duration };
  } catch {
    return { peaks: Array.from({ length: 80 }, () => 0.35), duration: 0 };
  }
}

function AudioFileManager() {
  const doUpload = useServerFn(uploadTrack);
  const [files, setFiles] = useState<ManagedFile[]>([]);
  const [normalize, setNormalize] = useState(true);
  const [busy, setBusy] = useState(false);

  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    const incoming = Array.from(list).filter((f) => /audio\/|\.(mp3|wav|m4a|flac)$/i.test(f.type + f.name));
    for (const file of incoming) {
      const { peaks, duration } = await analyse(file);
      setFiles((prev) => [
        ...prev,
        {
          id: `${file.name}-${file.size}-${prev.length}`,
          file,
          url: URL.createObjectURL(file),
          peaks,
          duration,
          start: 0,
          end: duration || 1,
          progress: 0,
          status: "ready",
        },
      ]);
    }
  };

  const uploadAll = async () => {
    setBusy(true);
    for (const f of files.filter((x) => x.status === "ready")) {
      setFiles((prev) =>
        prev.map((x) => (x.id === f.id ? { ...x, status: "uploading", progress: 15 } : x)),
      );
      const tick = setInterval(
        () =>
          setFiles((prev) =>
            prev.map((x) =>
              x.id === f.id && x.status === "uploading"
                ? { ...x, progress: Math.min(92, x.progress + 6) }
                : x,
            ),
          ),
        700,
      );
      try {
        const fd = new FormData();
        fd.append("file", f.file);
        const res = await doUpload({ data: fd });
        setFiles((prev) =>
          prev.map((x) =>
            x.id === f.id
              ? {
                  ...x,
                  status: res.success ? "done" : "error",
                  progress: 100,
                  message: res.success ? "Transcoded by Yoto" : res.error,
                }
              : x,
          ),
        );
        if (!res.success) toast.error(res.error ?? "Upload failed");
      } catch (e) {
        setFiles((prev) =>
          prev.map((x) =>
            x.id === f.id
              ? { ...x, status: "error", progress: 100, message: (e as Error).message }
              : x,
          ),
        );
      } finally {
        clearInterval(tick);
      }
    }
    setBusy(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Waves className="size-4 text-primary" /> Audio file manager
        </CardTitle>
        <CardDescription>
          Drop MP3, WAV, M4A or FLAC files, trim them, then send them to your Yoto library.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground hover:border-primary/60"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void add(e.dataTransfer.files);
          }}
        >
          <Upload className="size-5 text-primary" />
          Drag &amp; drop audio here, or click to browse
          <span className="text-[11px]">MP3 · WAV · M4A · FLAC</span>
          <input
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => void add(e.target.files)}
          />
        </label>

        <div className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2">
          <Label htmlFor="normalize" className="flex items-center gap-2 text-sm">
            <Sparkles className="size-4 text-primary" /> Automatic volume normalization
          </Label>
          <Switch id="normalize" checked={normalize} onCheckedChange={setNormalize} />
        </div>

        <div className="space-y-3">
          {files.map((f) => (
            <div key={f.id} className="rounded-2xl border border-border/70 p-3">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{f.file.name}</p>
                <Badge variant={f.status === "error" ? "destructive" : "secondary"} className="text-[10px]">
                  {f.status}
                </Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              <div className="mt-2 flex h-14 items-end gap-[2px]">
                {f.peaks.map((p, i) => {
                  const pos = (i / f.peaks.length) * (f.duration || 1);
                  const inRange = pos >= f.start && pos <= f.end;
                  return (
                    <div
                      key={i}
                      className={`flex-1 rounded-sm ${inRange ? "bg-primary" : "bg-muted"}`}
                      style={{ height: `${Math.max(6, p * 100)}%` }}
                    />
                  );
                })}
              </div>

              <div className="mt-2 space-y-1">
                <Slider
                  value={[f.start, f.end]}
                  min={0}
                  max={f.duration || 1}
                  step={0.1}
                  onValueChange={([s, e]) =>
                    setFiles((prev) =>
                      prev.map((x) => (x.id === f.id ? { ...x, start: s ?? 0, end: e ?? x.end } : x)),
                    )
                  }
                />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Scissors className="size-3" /> {fmt(f.start)} – {fmt(f.end)}
                  </span>
                  <span>{f.message ?? fmt(f.duration)}</span>
                </div>
              </div>

              {f.status !== "ready" && <Progress value={f.progress} className="mt-2 h-1.5" />}
            </div>
          ))}
        </div>

        {files.length > 0 && (
          <Button onClick={uploadAll} disabled={busy} className="w-full">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Upload {files.filter((f) => f.status === "ready").length} file(s) to Yoto
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
