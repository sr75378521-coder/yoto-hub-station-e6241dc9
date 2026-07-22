import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Repeat1,
  Moon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  getPlayerStatus,
  playerPause,
  playerPlay,
  playerStop,
  playerNext,
  playerPrevious,
  playerSeek,
  playerSetVolume,
  playerMute,
  playerShuffle,
  playerRepeat,
  playerSleepTimer,
  type PlayerStatus,
} from "@/lib/yoto/commands.functions";

function fmt(sec: number | null | undefined) {
  if (sec == null || !Number.isFinite(sec)) return "--:--";
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

interface Props {
  deviceId: string;
  initialOnline: boolean;
}

export function PlayerControls({ deviceId, initialOnline }: Props) {
  const fetchStatus = useServerFn(getPlayerStatus);
  const qc = useQueryClient();
  const key = ["player-status", deviceId];

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchStatus({ data: { deviceId } }),
    refetchInterval: 5000,
    enabled: initialOnline,
  });

  const status: PlayerStatus | null =
    query.data && !("notConnected" in query.data) ? (query.data as PlayerStatus) : null;

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const wrap = <T,>(fn: (arg: T) => Promise<unknown>, msg: string) =>
    useMutation({
      mutationFn: fn,
      onError: (e) => toast.error(`${msg}: ${(e as Error).message}`),
      onSuccess: () => setTimeout(invalidate, 400),
    });

  const play = wrap(useServerFn(playerPlay), "Play failed");
  const pause = wrap(useServerFn(playerPause), "Pause failed");
  const stop = wrap(useServerFn(playerStop), "Stop failed");
  const next = wrap(useServerFn(playerNext), "Next failed");
  const prev = wrap(useServerFn(playerPrevious), "Previous failed");
  const seek = wrap(useServerFn(playerSeek), "Seek failed");
  const setVol = wrap(useServerFn(playerSetVolume), "Volume failed");
  const mute = wrap(useServerFn(playerMute), "Mute failed");
  const shuf = wrap(useServerFn(playerShuffle), "Shuffle failed");
  const rep = wrap(useServerFn(playerRepeat), "Repeat failed");
  const sleep = wrap(useServerFn(playerSleepTimer), "Sleep timer failed");

  // Local slider state so drag feels smooth
  const [seekLocal, setSeekLocal] = useState<number | null>(null);
  const [volLocal, setVolLocal] = useState<number | null>(null);
  useEffect(() => {
    if (seekLocal !== null) return;
  }, [status?.positionSeconds]); // eslint-disable-line react-hooks/exhaustive-deps

  const position = seekLocal ?? status?.positionSeconds ?? 0;
  const duration = status?.durationSeconds ?? 0;
  const volume = volLocal ?? status?.volume ?? 50;
  const playing = status?.playing ?? false;
  const muted = status?.muted ?? false;
  const shuffle = status?.shuffle ?? false;
  const repeat = status?.repeat ?? "off";
  const disabled = !initialOnline;

  const RepeatIcon = repeat === "one" ? Repeat1 : Repeat;
  const nextRepeat: Record<typeof repeat, "off" | "one" | "all"> = {
    off: "all",
    all: "one",
    one: "off",
  };

  return (
    <div className="space-y-3">
      {(status?.trackTitle || status?.cardTitle) && (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {status.trackTitle ?? status.cardTitle}
          </p>
          {status.trackTitle && status.cardTitle && (
            <p className="truncate text-xs text-muted-foreground">{status.cardTitle}</p>
          )}
        </div>
      )}

      {/* Seek bar */}
      <div className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
          {fmt(position)}
        </span>
        <Slider
          value={[Math.min(position, duration || position)]}
          max={Math.max(duration, position, 1)}
          step={1}
          disabled={disabled || !duration}
          onValueChange={(v) => setSeekLocal(v[0] ?? 0)}
          onValueCommit={(v) => {
            const s = v[0] ?? 0;
            setSeekLocal(null);
            seek.mutate({ data: { deviceId, positionSeconds: s } });
          }}
          className="flex-1"
        />
        <span className="w-10 shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {fmt(duration)}
        </span>
      </div>

      {/* Transport */}
      <div className="flex items-center justify-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled || prev.isPending}
          onClick={() => prev.mutate({ data: { deviceId } })}
          aria-label="Previous"
        >
          <SkipBack className="size-4" />
        </Button>
        {playing ? (
          <Button
            size="icon"
            disabled={disabled || pause.isPending}
            onClick={() => pause.mutate({ data: { deviceId } })}
            aria-label="Pause"
          >
            <Pause className="size-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            disabled={disabled || play.isPending}
            onClick={() => play.mutate({ data: { deviceId } })}
            aria-label="Play"
          >
            <Play className="size-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled || stop.isPending}
          onClick={() => stop.mutate({ data: { deviceId } })}
          aria-label="Stop"
        >
          <Square className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled || next.isPending}
          onClick={() => next.mutate({ data: { deviceId } })}
          aria-label="Next"
        >
          <SkipForward className="size-4" />
        </Button>
      </div>

      {/* Volume + Mute */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled || mute.isPending}
          onClick={() => mute.mutate({ data: { deviceId, mute: !muted } })}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </Button>
        <Slider
          value={[volume]}
          min={0}
          max={100}
          step={1}
          disabled={disabled}
          onValueChange={(v) => setVolLocal(v[0] ?? 0)}
          onValueCommit={(v) => {
            const val = v[0] ?? 0;
            setVolLocal(null);
            setVol.mutate({ data: { deviceId, volume: val } });
          }}
          className="flex-1"
        />
        <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
          {Math.round(volume)}
        </span>
      </div>

      {/* Modes */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant={shuffle ? "default" : "ghost"}
            size="icon"
            disabled={disabled || shuf.isPending}
            onClick={() => shuf.mutate({ data: { deviceId, shuffle: !shuffle } })}
            aria-label="Shuffle"
          >
            <Shuffle className="size-4" />
          </Button>
          <Button
            variant={repeat !== "off" ? "default" : "ghost"}
            size="icon"
            disabled={disabled || rep.isPending}
            onClick={() => rep.mutate({ data: { deviceId, repeat: nextRepeat[repeat] } })}
            aria-label={`Repeat ${repeat}`}
          >
            <RepeatIcon className="size-4" />
          </Button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={disabled} className="gap-1.5">
              <Moon className="size-3.5" />
              {status?.sleepMinutesRemaining
                ? `${Math.round(status.sleepMinutesRemaining)}m`
                : "Sleep"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {[0, 15, 30, 45, 60, 90].map((m) => (
              <DropdownMenuItem
                key={m}
                onClick={() => sleep.mutate({ data: { deviceId, minutes: m } })}
              >
                {m === 0 ? "Off" : `${m} minutes`}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {status?.batteryPercent != null && (
        <Badge variant="secondary" className="text-[10px]">
          Battery {Math.round(status.batteryPercent)}%
        </Badge>
      )}
    </div>
  );
}
