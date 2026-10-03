import { Pause, Play, Trash2, UploadCloud, Repeat, Volume2, Settings2, ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  ACTIONS,
  uploadCheckpointAudio,
  type Checkpoint,
} from "@/hooks/useStudioProject";

const ICONS = ["🎧", "🧙", "🦸", "🐉", "🧝", "🧚", "🚀", "🐺", "🦉", "🗺️", "⚔️", "🔮"];

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatSize(bytes: number | null) {
  if (!bytes) return "No file";
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

type Props = {
  checkpoint: Checkpoint;
  siblings: Checkpoint[];
  onPatch: (patch: Partial<Checkpoint>) => void;
  onDelete: () => void;
  onDragStart: (event: React.PointerEvent) => void;
  onPlay: () => void;
  isActive: boolean;
  isPlaying: boolean;
  runtimePosition: number;
  runtimeDuration: number;
  onSeek: (percent: number) => void;
};

export function CheckpointCard({ checkpoint, siblings, onPatch, onDelete, onDragStart, onPlay, isActive, isPlaying, runtimePosition, runtimeDuration, onSeek }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const path = await uploadCheckpointAudio(file, checkpoint.id);
      const probe = new Audio(URL.createObjectURL(file));
      const length = await new Promise<number>((resolve) => {
        probe.addEventListener("loadedmetadata", () => resolve(probe.duration));
        probe.addEventListener("error", () => resolve(0));
      });
      onPatch({
        audio_path: path,
        audio_name: file.name.replace(/\.[^.]+$/, ""),
        audio_size: file.size,
        audio_duration: Number.isFinite(length) ? length : null,
      });
      toast.success(`${file.name} uploaded`);
    } catch (error) {
      console.error(error);
      toast.error("Upload failed. Try a smaller file.");
    } finally {
      setUploading(false);
    }
  }

  const others = siblings.filter((c) => c.id !== checkpoint.id);

  return (
    <div className="relative h-[300px] w-[540px] rounded-[64px] border-[3px] border-primary bg-card px-8 pb-6 pt-10 card-shadow">
      <div
        onPointerDown={onDragStart}
        className="absolute -top-4 left-10 inline-flex cursor-grab items-center rounded-md bg-primary px-4 py-1.5 text-base font-extrabold text-primary-foreground active:cursor-grabbing"
      >
        {checkpoint.is_start ? `Start: ${checkpoint.title}` : checkpoint.title}
      </div>

      <span className="absolute -top-2 left-1/2 size-4 -translate-x-1/2 rounded-full border-2 border-primary bg-primary" />
      <div className="flex items-center gap-4">
        <Select value={checkpoint.icon ?? "🎧"} onValueChange={(icon) => onPatch({ icon })}>
          <SelectTrigger className="h-14 w-16 justify-center border-none bg-transparent text-3xl shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ICONS.map((icon) => (
              <SelectItem key={icon} value={icon} className="text-xl">
                {icon}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="icon"
          onClick={onPlay}
          className="size-14 shrink-0 rounded-full"
          aria-label={isActive && isPlaying ? "Pause" : "Play"}
        >
          {isActive && isPlaying ? <Pause className="size-6" /> : <Play className="ml-0.5 size-6" />}
        </Button>

        <Input
          value={checkpoint.audio_name ?? ""}
          placeholder="track_name"
          onChange={(e) => onPatch({ audio_name: e.target.value })}
          className="h-10 min-w-0 border-none bg-transparent px-0 text-xl font-extrabold shadow-none focus-visible:ring-0"
        />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileRef.current?.click()}
          className="shrink-0 text-primary"
          aria-label="Upload audio"
        >
          <UploadCloud className="size-7" />
        </Button>
        <span className="w-16 shrink-0 text-sm text-muted-foreground">
          {uploading ? "…" : formatSize(checkpoint.audio_size)}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
      </div>

      <div className="mt-5 flex items-center gap-3">
        <span className="text-sm tabular-nums text-muted-foreground">{formatTime(isActive ? runtimePosition : 0)}</span>
        <Slider
          value={[isActive && runtimeDuration ? (runtimePosition / runtimeDuration) * 100 : 0]}
          onValueChange={([value]) => isActive && onSeek(value ?? 0)}
          className="flex-1"
        />
        <span className="text-sm tabular-nums text-muted-foreground">{formatTime(isActive ? runtimeDuration : checkpoint.audio_duration ?? 0)}</span>
      </div>

      <div className="mt-5 flex items-end justify-center gap-11">
        <div className="flex flex-col items-center gap-2">
          <Label className="text-sm font-semibold">Left</Label>
          <Select value={checkpoint.left_action} onValueChange={(v) => onPatch({ left_action: v })}>
            <SelectTrigger className="size-14 rounded-full border-primary bg-primary px-0 text-[0] text-primary-foreground [&>svg]:hidden" title={ACTIONS.find((a) => a.value === checkpoint.left_action)?.label}>
              <span className="sr-only"><SelectValue /></span>
              <ChevronDown className="size-5" />
            </SelectTrigger>
            <SelectContent>
              {ACTIONS.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {checkpoint.left_action === "jump" && (
            <Select
              value={checkpoint.left_target ?? ""}
              onValueChange={(v) => onPatch({ left_target: v })}
            >
              <SelectTrigger className="absolute bottom-2 left-7 h-8 w-36 bg-card text-xs">
                <SelectValue placeholder="Target" />
              </SelectTrigger>
              <SelectContent>
                {others.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex flex-col items-center gap-2">
          <Label className="text-sm font-semibold">Right</Label>
          <Select value={checkpoint.right_action} onValueChange={(v) => onPatch({ right_action: v })}>
            <SelectTrigger className="size-14 rounded-full border-primary bg-primary px-0 text-[0] text-primary-foreground [&>svg]:hidden" title={ACTIONS.find((a) => a.value === checkpoint.right_action)?.label}>
              <span className="sr-only"><SelectValue /></span>
              <ChevronDown className="size-5" />
            </SelectTrigger>
            <SelectContent>
              {ACTIONS.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {checkpoint.right_action === "jump" && (
            <Select
              value={checkpoint.right_target ?? ""}
              onValueChange={(v) => onPatch({ right_target: v })}
            >
              <SelectTrigger className="absolute bottom-2 left-48 h-8 w-36 bg-card text-xs">
                <SelectValue placeholder="Target" />
              </SelectTrigger>
              <SelectContent>
                {others.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex flex-col items-center gap-2">
          <Label className="text-sm font-semibold">Auto-advance</Label>
          <Button
            type="button"
            size="icon"
            variant={checkpoint.auto_advance ? "default" : "outline"}
            className="size-14 rounded-full border-2 border-primary"
            onClick={() => onPatch({ auto_advance: !checkpoint.auto_advance })}
            aria-label="Toggle auto-advance"
          >
            <ChevronDown className="size-5" />
          </Button>
        </div>
      </div>

      <div className="absolute right-5 top-3 flex items-center gap-1">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Checkpoint settings">
              <Settings2 className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-4">
            <div className="space-y-1.5">
              <Label>Checkpoint name</Label>
              <Input value={checkpoint.title} onChange={(e) => onPatch({ title: e.target.value })} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2"><Repeat className="size-4" /> Loop audio</Label>
              <Switch checked={checkpoint.loop_audio} onCheckedChange={(loop_audio) => {
                onPatch({ loop_audio });
              }} />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Volume2 className="size-4" /> Volume {checkpoint.volume}%</Label>
              <Slider value={[checkpoint.volume]} max={100} onValueCommit={([value]) => onPatch({ volume: value ?? 100 })} />
            </div>
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label={`Delete ${checkpoint.title}`}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
       </div>
       <span className="absolute -bottom-2 left-[35%] size-4 rounded-full border-2 border-primary bg-primary" />
       <span className="absolute -bottom-2 left-[57%] size-4 rounded-full border-2 border-primary bg-primary" />
       <span className="absolute -bottom-2 left-[79%] size-4 rounded-full border-2 border-primary bg-primary" />
    </div>
  );
}
