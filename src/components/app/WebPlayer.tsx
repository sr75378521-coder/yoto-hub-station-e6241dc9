import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
  Music,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { WebTrack } from "@/lib/players.functions";

interface WebPlayerState {
  playQueue: (args: { title: string; artwork?: string; tracks: WebTrack[] }) => void;
  isActive: boolean;
}

const WebPlayerContext = createContext<WebPlayerState | null>(null);

export function useWebPlayer() {
  const ctx = useContext(WebPlayerContext);
  if (!ctx) throw new Error("useWebPlayer must be used inside WebPlayerProvider");
  return ctx;
}

function fmt(s: number) {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export function WebPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [tracks, setTracks] = useState<WebTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [title, setTitle] = useState("");
  const [artwork, setArtwork] = useState<string | undefined>();
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  const current = tracks[index];

  const playQueue = useCallback(
    ({ title: t, artwork: a, tracks: list }: { title: string; artwork?: string; tracks: WebTrack[] }) => {
      const playable = list.filter((x) => x.url);
      setTracks(playable);
      setTitle(t);
      setArtwork(a);
      setIndex(0);
      setPlaying(true);
    },
    [],
  );

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !current?.url) return;
    el.src = current.url;
    el.load();
    if (playing) void el.play().catch(() => setPlaying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.url]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) void el.play().catch(() => setPlaying(false));
    else el.pause();
  }, [playing]);

  useEffect(() => {
    const el = audioRef.current;
    if (el) {
      el.volume = volume;
      el.muted = muted;
    }
  }, [volume, muted]);

  const next = useCallback(() => {
    setIndex((i) => (i + 1 < tracks.length ? i + 1 : i));
  }, [tracks.length]);

  const value = useMemo<WebPlayerState>(
    () => ({ playQueue, isActive: tracks.length > 0 }),
    [playQueue, tracks.length],
  );

  return (
    <WebPlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onEnded={next}
        className="hidden"
      />
      {tracks.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-4">
            {artwork ? (
              <img src={artwork} alt={title} className="size-11 rounded-md object-cover" />
            ) : (
              <div className="flex size-11 items-center justify-center rounded-md bg-primary/10">
                <Music className="size-5 text-primary/60" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{current?.title ?? title}</div>
              <div className="truncate text-xs text-muted-foreground">{title}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="w-9 text-right text-[10px] tabular-nums text-muted-foreground">
                  {fmt(position)}
                </span>
                <Slider
                  value={[position]}
                  max={duration || current?.duration || 100}
                  step={1}
                  onValueChange={([v]) => {
                    if (audioRef.current) audioRef.current.currentTime = v;
                    setPosition(v);
                  }}
                  className="flex-1"
                />
                <span className="w-9 text-[10px] tabular-nums text-muted-foreground">
                  {fmt(duration || current?.duration || 0)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
              >
                <SkipBack className="size-4" />
              </Button>
              <Button size="icon" onClick={() => setPlaying((p) => !p)}>
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={next}
                disabled={index + 1 >= tracks.length}
              >
                <SkipForward className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setMuted((m) => !m)}>
                {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </Button>
              <Slider
                value={[muted ? 0 : volume * 100]}
                max={100}
                step={1}
                onValueChange={([v]) => {
                  setMuted(false);
                  setVolume(v / 100);
                }}
                className="hidden w-24 sm:block"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setPlaying(false);
                  setTracks([]);
                }}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </WebPlayerContext.Provider>
  );
}
