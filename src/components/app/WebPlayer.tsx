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
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
  Music,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

import { Slider } from "@/components/ui/slider";
import type { WebTrack } from "@/lib/players.functions";

interface QueueArgs {
  id?: string;
  title: string;
  artwork?: string;
  tracks: WebTrack[];
}

interface WebPlayerState {
  playQueue: (args: QueueArgs) => void;
  isActive: boolean;
}

const WebPlayerContext = createContext<WebPlayerState | null>(null);

const RESUME_KEY = "ycc-resume";

interface ResumeState {
  id?: string;
  title: string;
  artwork?: string;
  tracks: WebTrack[];
  index: number;
  position: number;
}

function loadResume(): ResumeState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResumeState;
    if (!Array.isArray(parsed?.tracks) || parsed.tracks.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

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
  const [queueId, setQueueId] = useState<string | undefined>();
  const [tracks, setTracks] = useState<WebTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [title, setTitle] = useState("");
  const [artwork, setArtwork] = useState<string | undefined>();
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const seekTo = useRef<number | null>(null);

  const current = tracks[index];

  // Restore the last session so playback picks up where it left off.
  useEffect(() => {
    const saved = loadResume();
    if (!saved) return;
    setQueueId(saved.id);
    setTracks(saved.tracks);
    setTitle(saved.title);
    setArtwork(saved.artwork);
    setIndex(Math.min(saved.index, saved.tracks.length - 1));
    setPosition(saved.position);
    seekTo.current = saved.position;
  }, []);

  // Persist progress so it survives reloads and returning the next day.
  useEffect(() => {
    if (typeof window === "undefined" || tracks.length === 0) return;
    const payload: ResumeState = { id: queueId, title, artwork, tracks, index, position };
    try {
      window.localStorage.setItem(RESUME_KEY, JSON.stringify(payload));
    } catch {
      /* storage full or unavailable */
    }
  }, [queueId, title, artwork, tracks, index, Math.floor(position)]);

  const playQueue = useCallback(
    ({ id, title: t, artwork: a, tracks: list }: QueueArgs) => {
      const playable = list.filter((x) => x.url);
      const saved = loadResume();
      const resuming = saved && id && saved.id === id;
      setQueueId(id);
      setTracks(playable);
      setTitle(t);
      setArtwork(a);
      const startIndex = resuming ? Math.min(saved.index, playable.length - 1) : 0;
      setIndex(startIndex);
      setPosition(resuming ? saved.position : 0);
      seekTo.current = resuming ? saved.position : 0;
      setPlaying(true);
      if (resuming && saved.position > 5) {
        toast.success(`Resuming from ${fmt(saved.position)}`);
      }
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

  const seekBy = useCallback((delta: number) => {
    const el = audioRef.current;
    if (!el) return;
    const next = Math.max(0, Math.min(el.duration || Infinity, el.currentTime + delta));
    el.currentTime = next;
    setPosition(next);
  }, []);

  const seekAbsolute = useCallback((v: number) => {
    if (audioRef.current) audioRef.current.currentTime = v;
    setPosition(v);
  }, []);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i + 1 < tracks.length) {
        seekTo.current = 0;
        return i + 1;
      }
      return i;
    });
  }, [tracks.length]);

  const prev = useCallback(() => {
    setIndex((i) => {
      if (i > 0) seekTo.current = 0;
      return Math.max(0, i - 1);
    });
  }, []);

  const close = useCallback(() => {
    setPlaying(false);
    setTracks([]);
    setExpanded(false);
    if (typeof window !== "undefined") window.localStorage.removeItem(RESUME_KEY);
  }, []);

  const value = useMemo<WebPlayerState>(
    () => ({ playQueue, isActive: tracks.length > 0 }),
    [playQueue, tracks.length],
  );

  const max = duration || current?.duration || 100;

  return (
    <WebPlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration || 0);
          if (seekTo.current != null) {
            const t = seekTo.current;
            seekTo.current = null;
            if (t > 0 && t < (e.currentTarget.duration || Infinity)) {
              e.currentTarget.currentTime = t;
              setPosition(t);
            }
          }
        }}
        onEnded={next}
        onError={() => {
          setPlaying(false);
          toast.error(`Couldn't play "${current?.title ?? "track"}"`);
        }}
        className="hidden"
      />

      {tracks.length > 0 && (
        <>
          {/* Full-screen Now Playing */}
          {expanded && (
            <div className="fixed inset-0 z-50 flex flex-col bg-background bg-[image:var(--gradient-player)] px-6 py-6">
              <div className="flex items-center justify-between">
                <Button size="icon" variant="ghost" onClick={() => setExpanded(false)}>
                  <ChevronDown className="size-5" />
                </Button>
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Now playing
                </span>
                <Button size="icon" variant="ghost" onClick={close}>
                  <X className="size-5" />
                </Button>
              </div>

              <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6">
                {artwork ? (
                  <img
                    src={artwork}
                    alt={title}
                    className="aspect-square w-full max-w-xs rounded-3xl object-cover shadow-[var(--shadow-elegant)]"
                  />
                ) : (
                  <div className="flex aspect-square w-full max-w-xs items-center justify-center rounded-3xl bg-primary/10">
                    <Music className="size-20 text-primary/50" />
                  </div>
                )}

                <div className="w-full text-center">
                  <h2 className="truncate text-2xl font-bold">{current?.title ?? title}</h2>
                  <p className="truncate text-sm text-muted-foreground">{title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Track {index + 1} of {tracks.length}
                  </p>
                </div>

                <div className="w-full">
                  <Slider
                    value={[position]}
                    max={max}
                    step={1}
                    onValueChange={([v]) => seekAbsolute(v)}
                  />
                  <div className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
                    <span>{fmt(position)}</span>
                    <span>{fmt(max)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button size="icon" variant="ghost" onClick={prev} disabled={index === 0}>
                    <SkipBack className="size-5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="relative size-12 rounded-full"
                    onClick={() => seekBy(-10)}
                    title="Back 10 seconds"
                  >
                    <RotateCcw className="size-6" />
                    <span className="absolute text-[9px] font-bold">10</span>
                  </Button>
                  <Button
                    size="icon"
                    className="size-16 rounded-full shadow-[var(--shadow-elegant)]"
                    onClick={() => setPlaying((p) => !p)}
                  >
                    {playing ? <Pause className="size-7" /> : <Play className="size-7" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="relative size-12 rounded-full"
                    onClick={() => seekBy(10)}
                    title="Forward 10 seconds"
                  >
                    <RotateCw className="size-6" />
                    <span className="absolute text-[9px] font-bold">10</span>
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={next}
                    disabled={index + 1 >= tracks.length}
                  >
                    <SkipForward className="size-5" />
                  </Button>
                </div>

                <div className="flex w-full max-w-xs items-center gap-3">
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
                    className="flex-1"
                  />
                </div>

                <div className="max-h-40 w-full overflow-y-auto rounded-2xl bg-card/60 p-2">
                  {tracks.map((t, i) => (
                    <button
                      key={`${t.url}-${i}`}
                      type="button"
                      onClick={() => {
                        seekTo.current = 0;
                        setIndex(i);
                        setPlaying(true);
                      }}
                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-accent ${
                        i === index ? "font-semibold text-primary" : ""
                      }`}
                    >
                      <span className="w-5 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                      <span className="flex-1 truncate">{t.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Mini bar */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
            <div className="mx-auto flex max-w-5xl items-center gap-4">
              <Button size="icon" variant="ghost" onClick={() => setExpanded(true)} title="Now playing">
                <ChevronUp className="size-5" />
              </Button>
              {artwork ? (
                <img src={artwork} alt={title} className="size-11 rounded-xl object-cover" />
              ) : (
                <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10">
                  <Music className="size-5 text-primary/60" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{current?.title ?? title}</div>
                <div className="truncate text-xs text-muted-foreground">{title}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="w-9 text-right text-[10px] tabular-nums text-muted-foreground">
                    {fmt(position)}
                  </span>
                  <Slider
                    value={[position]}
                    max={max}
                    step={1}
                    onValueChange={([v]) => seekAbsolute(v)}
                    className="flex-1"
                  />
                  <span className="w-9 text-[10px] tabular-nums text-muted-foreground">
                    {fmt(max)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={() => seekBy(-10)} title="Back 10s">
                  <RotateCcw className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={prev} disabled={index === 0}>
                  <SkipBack className="size-4" />
                </Button>
                <Button size="icon" className="rounded-full" onClick={() => setPlaying((p) => !p)}>
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
                <Button size="icon" variant="ghost" onClick={() => seekBy(10)} title="Forward 10s">
                  <RotateCw className="size-4" />
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
                <Button size="icon" variant="ghost" onClick={close}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </WebPlayerContext.Provider>
  );
}
