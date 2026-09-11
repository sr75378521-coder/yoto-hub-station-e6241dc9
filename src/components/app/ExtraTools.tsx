import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Archive, FileAudio, Loader2, Timer, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { getPlaylistsData, getPlaylistDetails } from "@/lib/players.functions";

/** Export every playlist on the account as a single JSON backup file. */
export function PlaylistBackupTool() {
  const fetchList = useServerFn(getPlaylistsData);
  const fetchDetails = useServerFn(getPlaylistDetails);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  const run = async () => {
    setBusy(true);
    try {
      const list = await fetchList();
      const playlists = list.playlists ?? [];
      if (playlists.length === 0) {
        toast.error("No playlists found on this account.");
        return;
      }
      const out: unknown[] = [];
      for (const [i, p] of playlists.entries()) {
        setProgress(`${i + 1} / ${playlists.length} · ${p.name}`);
        const res = await fetchDetails({ data: { playlistId: p.playlistId } });
        out.push({ summary: p, detail: res.success ? res.playlist : { error: res.error } });
      }
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), playlists: out }, null, 2)], {
        type: "application/json",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `yoto-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`Backed up ${playlists.length} playlists`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backup failed");
    } finally {
      setProgress("");
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Archive className="size-4 text-primary" /> Playlist backup
        </CardTitle>
        <CardDescription>
          Save a copy of every playlist — titles, tracks, icons and artwork — to one file on your
          computer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button onClick={() => void run()} disabled={busy} className="w-full">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />}
          Download backup
        </Button>
        {progress && <p className="text-xs text-muted-foreground">{progress}</p>}
      </CardContent>
    </Card>
  );
}

interface Inspected {
  name: string;
  size: number;
  duration: number;
  sampleRate: number;
  channels: number;
  kbps: number;
  warnings: string[];
}

/** Check local audio files for Yoto-friendly format before uploading. */
export function AudioInspectorTool() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<Inspected[]>([]);
  const [busy, setBusy] = useState(false);

  const inspect = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const ctx = new AudioContext();
    const next: Inspected[] = [];
    for (const file of Array.from(files)) {
      try {
        const buf = await ctx.decodeAudioData(await file.arrayBuffer());
        const kbps = Math.round((file.size * 8) / buf.duration / 1000);
        const warnings: string[] = [];
        if (buf.duration > 60 * 60) warnings.push("Longer than an hour");
        if (file.size > 100 * 1024 * 1024) warnings.push("Very large file");
        if (buf.sampleRate < 32000) warnings.push("Low sample rate");
        if (kbps < 64) warnings.push("Low quality");
        next.push({
          name: file.name,
          size: file.size,
          duration: buf.duration,
          sampleRate: buf.sampleRate,
          channels: buf.numberOfChannels,
          kbps,
          warnings,
        });
      } catch {
        toast.error(`Couldn't read ${file.name}`);
      }
    }
    void ctx.close();
    setRows((prev) => [...prev, ...next]);
    setBusy(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileAudio className="size-4 text-primary" /> Audio checker
        </CardTitle>
        <CardDescription>
          Drop audio files here to see length, quality and anything that might cause upload
          trouble.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          ref={inputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(e) => void inspect(e.target.files)}
        />
        <Button variant="outline" className="w-full" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Choose files
        </Button>
        {rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={`${r.name}-${i}`} className="rounded-xl border border-border/70 p-3 text-sm">
                <p className="truncate font-medium">{r.name}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Timer className="size-3" />
                    {Math.floor(r.duration / 60)}:
                    {String(Math.floor(r.duration % 60)).padStart(2, "0")}
                  </span>
                  <span>{(r.size / 1024 / 1024).toFixed(1)} MB</span>
                  <span>{r.kbps} kbps</span>
                  <span>{(r.sampleRate / 1000).toFixed(1)} kHz</span>
                  <span>{r.channels === 1 ? "mono" : "stereo"}</span>
                </p>
                {r.warnings.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.warnings.map((w) => (
                      <Badge key={w} variant="destructive" className="text-[10px]">
                        {w}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
