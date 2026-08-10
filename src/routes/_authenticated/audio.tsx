import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Import,
  Loader2,
  Merge,
  Pause,
  Play,
  Scissors,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getPlaylistsData, getPlaylistTracks } from "@/lib/players.functions";
import { appendTracks, uploadTrack } from "@/lib/yoto/myo.functions";
import {
  applyGain,
  audioCtx,
  concat,
  cutRegion,
  decodeFile,
  decodeUrl,
  encodeWav,
  equalize,
  fade,
  fmtTime,
  normalize as normalizeBuf,
  peaks as computePeaks,
  reverse as reverseBuf,
  sliceBuffer,
  changeSpeed,
  toMono,
  trimSilence,
} from "@/lib/audio/engine";

export const Route = createFileRoute("/_authenticated/audio")({
  head: () => ({
    meta: [
      { title: "Audio Playground · Yoto Control Center" },
      {
        name: "description",
        content:
          "Cut, merge, fade, normalize and EQ audio from your Yoto playlists or your own files, then save straight back to a playlist.",
      },
      { property: "og:title", content: "Audio Playground · Yoto Control Center" },
      {
        property: "og:description",
        content: "A full audio editor for your Yoto MYO playlists — trim, merge and master in the browser.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AudioPlaygroundPage,
});

interface Clip {
  id: string;
  name: string;
  buffer: AudioBuffer;
  peaks: number[];
  start: number;
  end: number;
  gainDb: number;
  fadeIn: number;
  fadeOut: number;
  speed: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  reverse: boolean;
  normalize: boolean;
  silence: boolean;
  mono: boolean;
}

function makeClip(name: string, buffer: AudioBuffer): Clip {
  return {
    id: `${name}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    buffer,
    peaks: computePeaks(buffer),
    start: 0,
    end: buffer.duration,
    gainDb: 0,
    fadeIn: 0,
    fadeOut: 0,
    speed: 1,
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0,
    reverse: false,
    normalize: false,
    silence: false,
    mono: false,
  };
}

async function renderClip(clip: Clip): Promise<AudioBuffer> {
  let buf = sliceBuffer(clip.buffer, clip.start, clip.end);
  if (clip.silence) buf = trimSilence(buf);
  if (clip.mono) buf = toMono(buf);
  if (clip.reverse) buf = reverseBuf(buf);
  if (clip.gainDb) buf = applyGain(buf, clip.gainDb);
  if (clip.fadeIn || clip.fadeOut) buf = fade(buf, clip.fadeIn, clip.fadeOut);
  buf = await equalize(buf, { low: clip.eqLow, mid: clip.eqMid, high: clip.eqHigh });
  buf = await changeSpeed(buf, clip.speed);
  if (clip.normalize) buf = normalizeBuf(buf);
  return buf;
}

function AudioPlaygroundPage() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [merge, setMerge] = useState(true);
  const [crossfade, setCrossfade] = useState(0);
  const [outputName, setOutputName] = useState("My mix");
  const [dest, setDest] = useState<string>("__new__");
  const [newName, setNewName] = useState("New playlist");
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const fetchPlaylists = useServerFn(getPlaylistsData);
  const doUpload = useServerFn(uploadTrack);
  const doAppend = useServerFn(appendTracks);

  const { data: playlistData } = useQuery({
    queryKey: ["playlists"],
    queryFn: () => fetchPlaylists(),
    staleTime: 60_000,
  });
  const myoPlaylists = (playlistData?.playlists ?? []).filter((p) => p.source === "myo");

  useEffect(() => () => sourceRef.current?.stop(), []);

  const patch = (id: string, next: Partial<Clip>) =>
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...next } : c)));

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      setBusy(`Decoding ${file.name}…`);
      try {
        const buf = await decodeFile(file);
        setClips((prev) => [...prev, makeClip(file.name.replace(/\.[^.]+$/, ""), buf)]);
      } catch {
        toast.error(`Couldn't decode ${file.name}`);
      }
    }
    setBusy(null);
  };

  const stop = () => {
    sourceRef.current?.stop();
    sourceRef.current = null;
    setPlayingId(null);
  };

  const preview = async (clip: Clip) => {
    if (playingId === clip.id) return stop();
    stop();
    setBusy("Rendering preview…");
    try {
      const buf = await renderClip(clip);
      const ctx = audioCtx();
      if (ctx.state === "suspended") await ctx.resume();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.onended = () => setPlayingId(null);
      src.start();
      sourceRef.current = src;
      setPlayingId(clip.id);
    } finally {
      setBusy(null);
    }
  };

  const buildOutputs = async (): Promise<Array<{ name: string; buffer: AudioBuffer }>> => {
    const rendered: AudioBuffer[] = [];
    for (const c of clips) rendered.push(await renderClip(c));
    if (merge) {
      return [{ name: outputName || "My mix", buffer: concat(rendered, crossfade) }];
    }
    return rendered.map((b, i) => ({ name: clips[i]!.name, buffer: b }));
  };

  const exportFiles = async () => {
    if (!clips.length) return;
    setBusy("Exporting…");
    try {
      for (const out of await buildOutputs()) {
        const url = URL.createObjectURL(encodeWav(out.buffer));
        const a = document.createElement("a");
        a.href = url;
        a.download = `${out.name}.wav`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
      toast.success("Exported");
    } finally {
      setBusy(null);
    }
  };

  const saveToYoto = async () => {
    if (!clips.length) return;
    if (dest === "__new__" && !newName.trim()) {
      toast.error("Name the new playlist first");
      return;
    }
    setBusy("Rendering…");
    try {
      const outputs = await buildOutputs();
      const tracks = [];
      for (const out of outputs) {
        setBusy(`Uploading ${out.name}…`);
        const file = new File([encodeWav(out.buffer)], `${out.name}.wav`, { type: "audio/wav" });
        const fd = new FormData();
        fd.append("file", file);
        const res = await doUpload({ data: fd });
        if (!res.success || !res.track) {
          toast.error(`${out.name}: ${res.error ?? "upload failed"}`);
          continue;
        }
        tracks.push({ ...res.track, title: out.name });
      }
      if (!tracks.length) return;
      setBusy("Saving to playlist…");
      const res = await doAppend({
        data:
          dest === "__new__"
            ? { newTitle: newName.trim(), tracks }
            : { cardId: dest, tracks },
      });
      if (!res.success) {
        toast.error(res.error ?? "Couldn't save to the playlist");
        return;
      }
      toast.success(
        dest === "__new__"
          ? `Created "${newName.trim()}" with ${tracks.length} track(s)`
          : `Added ${tracks.length} track(s) to your playlist`,
      );
    } finally {
      setBusy(null);
    }
  };

  const totalDuration = useMemo(
    () => clips.reduce((a, c) => a + (c.end - c.start) / (c.speed || 1), 0),
    [clips],
  );

  return (
    <AppShell title="Audio Playground">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Audio Playground</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pull audio out of your Yoto playlists or drop your own files, then cut, merge, fade,
            EQ and master — and send the result straight back to a playlist.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">1 · Bring in audio</CardTitle>
            <CardDescription>Import from a playlist or upload files from this device.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <ImportFromPlaylist
              onImported={(name, buf) => setClips((prev) => [...prev, makeClip(name, buf)])}
              setBusy={setBusy}
            />
            <label className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground hover:border-primary/60">
              <Upload className="size-5 text-primary" />
              Drag &amp; drop or click to add audio
              <span className="text-[11px]">MP3 · WAV · M4A · FLAC · OGG</span>
              <input
                type="file"
                multiple
                accept="audio/*,.mp3,.wav,.m4a,.flac"
                className="hidden"
                onChange={(e) => void addFiles(e.target.files)}
              />
            </label>
          </CardContent>
        </Card>

        {busy && (
          <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-secondary/50 px-4 py-2 text-sm">
            <Loader2 className="size-4 animate-spin text-primary" /> {busy}
          </div>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">2 · Edit clips ({clips.length})</CardTitle>
              <CardDescription>
                Total after edits: {fmtTime(totalDuration)}
              </CardDescription>
            </div>
            {clips.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setClips([])}>
                <Trash2 className="size-4" /> Clear
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {clips.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No clips yet — import from a playlist or upload a file above.
              </p>
            ) : (
              clips.map((clip, i) => (
                <ClipEditor
                  key={clip.id}
                  clip={clip}
                  index={i}
                  count={clips.length}
                  playing={playingId === clip.id}
                  onPreview={() => void preview(clip)}
                  onPatch={(n) => patch(clip.id, n)}
                  onRemove={() => setClips((prev) => prev.filter((c) => c.id !== clip.id))}
                  onMove={(dir) =>
                    setClips((prev) => {
                      const j = i + dir;
                      if (j < 0 || j >= prev.length) return prev;
                      const next = [...prev];
                      [next[i], next[j]] = [next[j]!, next[i]!];
                      return next;
                    })
                  }
                  onSplit={() =>
                    setClips((prev) => {
                      const mid = (clip.start + clip.end) / 2;
                      const a = { ...clip, id: `${clip.id}-a`, end: mid, name: `${clip.name} (1)` };
                      const b = { ...clip, id: `${clip.id}-b`, start: mid, name: `${clip.name} (2)` };
                      return prev.flatMap((c) => (c.id === clip.id ? [a, b] : [c]));
                    })
                  }
                  onCutMiddle={() => {
                    const q = (clip.end - clip.start) / 4;
                    const buf = cutRegion(clip.buffer, clip.start + q, clip.end - q);
                    patch(clip.id, {
                      buffer: buf,
                      peaks: computePeaks(buf),
                      start: 0,
                      end: buf.duration,
                    });
                  }}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">3 · Export or save to Yoto</CardTitle>
            <CardDescription>Choose an existing playlist or create a new one.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2">
              <Label className="flex items-center gap-2 text-sm">
                <Merge className="size-4 text-primary" /> Merge all clips into one track
              </Label>
              <Switch checked={merge} onCheckedChange={setMerge} />
            </div>

            {merge && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Track name</Label>
                  <Input value={outputName} onChange={(e) => setOutputName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Crossfade · {crossfade.toFixed(1)}s</Label>
                  <Slider
                    value={[crossfade]}
                    min={0}
                    max={5}
                    step={0.1}
                    onValueChange={([v]) => setCrossfade(v ?? 0)}
                  />
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Save to</Label>
                <Select value={dest} onValueChange={setDest}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a playlist" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__new__">➕ New playlist…</SelectItem>
                    {myoPlaylists.map((p) => (
                      <SelectItem key={p.playlistId} value={p.playlistId}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {dest === "__new__" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">New playlist name</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void saveToYoto()} disabled={!clips.length || busy !== null}>
                <Sparkles className="size-4" /> Save to Yoto
              </Button>
              <Button
                variant="outline"
                onClick={() => void exportFiles()}
                disabled={!clips.length || busy !== null}
              >
                <Download className="size-4" /> Download WAV
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function ClipEditor({
  clip,
  index,
  count,
  playing,
  onPreview,
  onPatch,
  onRemove,
  onMove,
  onSplit,
  onCutMiddle,
}: {
  clip: Clip;
  index: number;
  count: number;
  playing: boolean;
  onPreview: () => void;
  onPatch: (n: Partial<Clip>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onSplit: () => void;
  onCutMiddle: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border/70 p-4">
      <div className="flex items-center gap-2">
        <span className="w-5 text-xs tabular-nums text-muted-foreground">{index + 1}.</span>
        <Input
          value={clip.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          className="h-9 flex-1"
        />
        <Badge variant="secondary" className="tabular-nums">
          {fmtTime((clip.end - clip.start) / (clip.speed || 1))}
        </Badge>
        <Button size="icon" variant="ghost" className="size-8" onClick={onPreview}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <Button size="icon" variant="ghost" className="size-8" onClick={() => onMove(-1)} disabled={index === 0}>
          <ArrowUp className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={() => onMove(1)}
          disabled={index === count - 1}
        >
          <ArrowDown className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" className="size-8" onClick={onRemove}>
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="mt-3 flex h-16 items-end gap-[2px]">
        {clip.peaks.map((p, i) => {
          const pos = (i / clip.peaks.length) * clip.buffer.duration;
          const inRange = pos >= clip.start && pos <= clip.end;
          return (
            <div
              key={i}
              className={`flex-1 rounded-sm ${inRange ? "bg-primary" : "bg-muted"}`}
              style={{ height: `${Math.max(5, p * 100)}%` }}
            />
          );
        })}
      </div>

      <div className="mt-2 space-y-1">
        <Slider
          value={[clip.start, clip.end]}
          min={0}
          max={clip.buffer.duration}
          step={0.05}
          onValueChange={([s, e]) => onPatch({ start: s ?? 0, end: e ?? clip.end })}
        />
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Scissors className="size-3" /> {fmtTime(clip.start)} – {fmtTime(clip.end)}
          </span>
          <span>{fmtTime(clip.buffer.duration)} original</span>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Knob label={`Gain · ${clip.gainDb.toFixed(1)} dB`} value={clip.gainDb} min={-24} max={24} step={0.5} onChange={(v) => onPatch({ gainDb: v })} />
        <Knob label={`Fade in · ${clip.fadeIn.toFixed(1)}s`} value={clip.fadeIn} min={0} max={10} step={0.1} onChange={(v) => onPatch({ fadeIn: v })} />
        <Knob label={`Fade out · ${clip.fadeOut.toFixed(1)}s`} value={clip.fadeOut} min={0} max={10} step={0.1} onChange={(v) => onPatch({ fadeOut: v })} />
        <Knob label={`Speed · ${clip.speed.toFixed(2)}×`} value={clip.speed} min={0.5} max={2} step={0.01} onChange={(v) => onPatch({ speed: v })} />
        <Knob label={`Bass · ${clip.eqLow.toFixed(0)} dB`} value={clip.eqLow} min={-20} max={20} step={1} onChange={(v) => onPatch({ eqLow: v })} />
        <Knob label={`Mid · ${clip.eqMid.toFixed(0)} dB`} value={clip.eqMid} min={-20} max={20} step={1} onChange={(v) => onPatch({ eqMid: v })} />
        <Knob label={`Treble · ${clip.eqHigh.toFixed(0)} dB`} value={clip.eqHigh} min={-20} max={20} step={1} onChange={(v) => onPatch({ eqHigh: v })} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Toggle label="Normalize" on={clip.normalize} onToggle={(v) => onPatch({ normalize: v })} />
        <Toggle label="Trim silence" on={clip.silence} onToggle={(v) => onPatch({ silence: v })} />
        <Toggle label="Reverse" on={clip.reverse} onToggle={(v) => onPatch({ reverse: v })} />
        <Toggle label="Mono" on={clip.mono} onToggle={(v) => onPatch({ mono: v })} />
        <Button size="sm" variant="outline" onClick={onSplit}>
          <Scissors className="size-3.5" /> Split
        </Button>
        <Button size="sm" variant="outline" onClick={onCutMiddle}>
          <Wand2 className="size-3.5" /> Cut middle
        </Button>
      </div>
    </div>
  );
}

function Knob({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v ?? value)} />
    </div>
  );
}

function Toggle({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!on)}
      className={`rounded-full border px-3 py-1 text-xs transition ${
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function ImportFromPlaylist({
  onImported,
  setBusy,
}: {
  onImported: (name: string, buf: AudioBuffer) => void;
  setBusy: (s: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const fetchPlaylists = useServerFn(getPlaylistsData);
  const fetchTracks = useServerFn(getPlaylistTracks);

  const { data } = useQuery({
    queryKey: ["playlists"],
    queryFn: () => fetchPlaylists(),
    staleTime: 60_000,
  });

  const { data: tracks, isFetching } = useQuery({
    queryKey: ["playlist-tracks", selected],
    queryFn: () => fetchTracks({ data: { playlistId: selected } }),
    enabled: Boolean(selected),
    staleTime: 5 * 60 * 1000,
  });

  const importTrack = async (title: string, url: string) => {
    setBusy(`Importing ${title}…`);
    try {
      const buf = await decodeUrl(url);
      onImported(title, buf);
      toast.success(`Imported "${title}"`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-auto flex-1 flex-col gap-1 rounded-2xl border-2 border-dashed p-6">
          <Import className="size-5 text-primary" />
          Import from a playlist
          <span className="text-[11px] text-muted-foreground">Personal or family library</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import audio from a playlist</DialogTitle>
          <DialogDescription>Pick a playlist, then choose the track to edit.</DialogDescription>
        </DialogHeader>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a playlist" />
          </SelectTrigger>
          <SelectContent>
            {(data?.playlists ?? []).map((p) => (
              <SelectItem key={p.playlistId} value={p.playlistId}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="max-h-[45vh] space-y-1 overflow-y-auto pr-1">
          {isFetching ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading tracks…
            </div>
          ) : (
            (tracks?.tracks ?? [])
              .filter((t) => t.url)
              .map((t, i) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => void importTrack(t.title, t.url!)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-secondary"
                >
                  <span className="w-5 text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {t.duration ? fmtTime(t.duration) : ""}
                  </span>
                </button>
              ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
