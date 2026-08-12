import { useState } from "react";
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Moon,
  Rewind,
  FastForward,
  BatteryCharging,
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
import { useYotoDevice } from "@/hooks/useYotoRealtime";
import { yotoDevice } from "@/lib/yoto/mqtt-client";

function fmt(sec: number | null | undefined) {
  if (sec == null || !Number.isFinite(sec)) return "--:--";
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

const bump = (key: string | null, delta: number) => {
  const n = Number(key ?? "1");
  const next = Math.max(1, (Number.isFinite(n) ? n : 1) + delta);
  return next.toString().padStart(2, "0");
};

interface Props {
  deviceId: string;
  initialOnline: boolean;
}

/**
 * All player control happens over MQTT (yoto.dev/players-mqtt) — the REST
 * command endpoints need private scopes that public apps can't request.
 */
export function PlayerControls({ deviceId, initialOnline }: Props) {
  const { state } = useYotoDevice(deviceId, initialOnline);
  const [seekLocal, setSeekLocal] = useState<number | null>(null);
  const [volLocal, setVolLocal] = useState<number | null>(null);
  const [lastVol, setLastVol] = useState(50);

  const position = seekLocal ?? state?.position ?? 0;
  const duration = state?.trackLength ?? 0;
  const volume = volLocal ?? state?.volume ?? 50;
  const playing = state?.playbackStatus === "playing";
  const muted = (state?.volume ?? 1) === 0;
  const cardId = state?.cardId ?? null;
  const disabled = !initialOnline;

  const run = (p: Promise<unknown>, msg: string) =>
    void p.catch((e) => toast.error(`${msg}: ${e instanceof Error ? e.message : "failed"}`));

  const seekTo = (seconds: number, trackDelta = 0) => {
    if (!cardId) return toast.error("Nothing is playing on this player");
    run(
      yotoDevice.startCard(deviceId, {
        cardId,
        chapterKey: state?.chapterKey ?? "01",
        trackKey: bump(state?.trackKey ?? null, trackDelta),
        secondsIn: Math.max(0, Math.round(seconds)),
      }),
      "Playback",
    );
  };

  return (
    <div className="space-y-3">
      {(state?.trackTitle || state?.chapterTitle) && (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {state.trackTitle ?? state.chapterTitle}
          </p>
          {state.trackTitle && state.chapterTitle && (
            <p className="truncate text-xs text-muted-foreground">{state.chapterTitle}</p>
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
          disabled={disabled || !duration || !cardId}
          onValueChange={(v) => setSeekLocal(v[0] ?? 0)}
          onValueCommit={(v) => {
            const s = v[0] ?? 0;
            setSeekLocal(null);
            seekTo(s);
          }}
          className="flex-1"
        />
        <span className="w-10 shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {fmt(duration)}
        </span>
      </div>

      {/* Transport */}
      <div className="flex flex-wrap items-center justify-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled || !cardId}
          onClick={() => seekTo(0, -1)}
          aria-label="Previous track"
        >
          <SkipBack className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled || !cardId}
          onClick={() => seekTo(Math.max(0, position - 10))}
          aria-label="Back 10 seconds"
        >
          <Rewind className="size-4" />
        </Button>
        {playing ? (
          <Button
            size="icon"
            disabled={disabled}
            onClick={() => run(yotoDevice.pause(deviceId), "Pause")}
            aria-label="Pause"
          >
            <Pause className="size-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            disabled={disabled}
            onClick={() => run(yotoDevice.resume(deviceId), "Play")}
            aria-label="Play"
          >
            <Play className="size-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled || !cardId}
          onClick={() => seekTo(position + 10)}
          aria-label="Forward 10 seconds"
        >
          <FastForward className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={() => run(yotoDevice.stop(deviceId), "Stop")}
          aria-label="Stop"
        >
          <Square className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled || !cardId}
          onClick={() => seekTo(0, 1)}
          aria-label="Next track"
        >
          <SkipForward className="size-4" />
        </Button>
      </div>

      {/* Volume + Mute */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={() => {
            if (muted) {
              run(yotoDevice.setVolume(deviceId, lastVol || 50), "Volume");
            } else {
              setLastVol(volume || 50);
              run(yotoDevice.setVolume(deviceId, 0), "Volume");
            }
          }}
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
            run(yotoDevice.setVolume(deviceId, val), "Volume");
          }}
          className="flex-1"
        />
        <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
          {Math.round(volume)}
        </span>
      </div>

      {/* Sleep timer + battery */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={disabled} className="gap-1.5">
              <Moon className="size-3.5" />
              {state?.sleepTimerActive && state.sleepTimerSeconds
                ? `${Math.round(state.sleepTimerSeconds / 60)}m`
                : "Sleep"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {[0, 15, 30, 45, 60, 90].map((m) => (
              <DropdownMenuItem
                key={m}
                onClick={() => run(yotoDevice.setSleepTimer(deviceId, m * 60), "Sleep timer")}
              >
                {m === 0 ? "Off" : `${m} minutes`}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {state?.batteryLevel != null && (
          <Badge variant="secondary" className="gap-1 text-[10px]">
            {state.charging && <BatteryCharging className="size-3" />}
            Battery {Math.round(state.batteryLevel)}%
          </Badge>
        )}
      </div>
    </div>
  );
}
