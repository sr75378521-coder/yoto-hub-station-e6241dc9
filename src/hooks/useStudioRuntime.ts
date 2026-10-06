import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { getAudioUrl, type Checkpoint } from "@/hooks/useStudioProject";

type Side = "left" | "right";

function firstCheckpoint(checkpoints: Checkpoint[]) {
  return checkpoints.find((checkpoint) => checkpoint.is_start) ?? checkpoints[0] ?? null;
}

export function useStudioRuntime(checkpoints: Checkpoint[]) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const checkpointsRef = useRef(checkpoints);
  const activeIdRef = useRef<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    checkpointsRef.current = checkpoints;
  }, [checkpoints]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlaying(false);
    setPosition(0);
  }, []);

  const playCheckpoint = useCallback(async (checkpoint: Checkpoint) => {
    activeIdRef.current = checkpoint.id;
    setActiveId(checkpoint.id);
    audioRef.current?.pause();
    setPosition(0);

    if (!checkpoint.audio_path) {
      setPlaying(false);
      setDuration(checkpoint.audio_duration ?? 0);
      toast.error(`${checkpoint.title} needs an audio file.`);
      return;
    }

    try {
      const audio = new Audio(await getAudioUrl(checkpoint.audio_path));
      audio.volume = checkpoint.volume / 100;
      audio.loop = checkpoint.loop_audio;
      audio.addEventListener("timeupdate", () => setPosition(audio.currentTime));
      audio.addEventListener("loadedmetadata", () => setDuration(audio.duration));
      audio.addEventListener("play", () => setPlaying(true));
      audio.addEventListener("pause", () => setPlaying(false));
      audio.addEventListener("ended", () => {
        setPlaying(false);
        const current = checkpointsRef.current.find((item) => item.id === activeIdRef.current);
        if (!current?.auto_advance) return;
        const index = checkpointsRef.current.findIndex((item) => item.id === current.id);
        const next = current.auto_target
          ? checkpointsRef.current.find((item) => item.id === current.auto_target)
          : checkpointsRef.current[index + 1];
        if (next) void playCheckpoint(next);
      });
      audioRef.current = audio;
      await audio.play();
    } catch (error) {
      console.error(error);
      setPlaying(false);
      toast.error("This track could not be played.");
    }
  }, []);

  const start = useCallback(() => {
    const checkpoint = firstCheckpoint(checkpointsRef.current);
    if (!checkpoint) {
      toast.error("Add a checkpoint before testing this playlist.");
      return;
    }
    void playCheckpoint(checkpoint);
  }, [playCheckpoint]);

  const togglePause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }, []);

  const performAction = useCallback((side: Side) => {
    const list = checkpointsRef.current;
    const current = list.find((item) => item.id === activeIdRef.current);
    if (!current) return;
    const action = side === "left" ? current.left_action : current.right_action;
    const targetId = side === "left" ? current.left_target : current.right_target;
    const index = list.findIndex((item) => item.id === current.id);

    if (action === "restart") {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        void audioRef.current.play();
      }
      return;
    }
    if (action === "pause") {
      togglePause();
      return;
    }
    if (action === "stop") {
      stop();
      return;
    }
    if (action === "none") return;

    const destination = action === "jump"
      ? list.find((item) => item.id === targetId)
      : action === "previous"
        ? list[index - 1]
        : list[index + 1];
    if (destination) void playCheckpoint(destination);
  }, [playCheckpoint, stop, togglePause]);

  const seek = useCallback((percent: number) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = (percent / 100) * duration;
    setPosition(audio.currentTime);
  }, [duration]);

  useEffect(() => () => audioRef.current?.pause(), []);

  return {
    activeId,
    active: checkpoints.find((item) => item.id === activeId) ?? null,
    playing,
    position,
    duration,
    start,
    stop,
    togglePause,
    performAction,
    seek,
    playCheckpoint,
  };
}