import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, LogOut, ListMusic, Copy, Trash2, Play, Square, ChevronLeft, ChevronRight, Link2, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { CheckpointCard } from "@/components/studio/CheckpointCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProject, type Checkpoint } from "@/hooks/useStudioProject";
import { useStudioRuntime } from "@/hooks/useStudioRuntime";
import { getYotoAuthUrl } from "@/lib/yoto.functions";
import { createCodeChallenge, createCodeVerifier, YOTO_VERIFIER_KEY } from "@/lib/pkce";

export const Route = createFileRoute("/_authenticated/spark-studio")({
  head: () => ({
    meta: [
      { title: "Create · Spark Studio" },
      {
        name: "description",
        content: "Build interactive Yoto adventures on an infinite canvas of audio checkpoints.",
      },
      { property: "og:title", content: "Create · Spark Studio" },
      {
        property: "og:description",
        content: "Build interactive Yoto adventures on an infinite canvas of audio checkpoints.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CreatePage,
});

function CreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    projects,
    project,
    selectedProjectId,
    selectProject,
    checkpoints,
    createProject,
    duplicateProject,
    deleteProject,
    addCheckpoint,
    updateCheckpoint,
    removeCheckpoint,
    renameProject,
  } = useCurrentProject();
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [localPos, setLocalPos] = useState<Record<string, { x: number; y: number }>>({});
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const cards = checkpoints.data ?? [];
  const runtime = useStudioRuntime(cards);
  const profile = useQuery({
    queryKey: ["studio", "profile"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sign in required");
      const { data, error } = await supabase.from("profiles").select("display_name,yoto_sub").eq("id", auth.user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  function posOf(card: Checkpoint) {
    return localPos[card.id] ?? { x: card.pos_x, y: card.pos_y };
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!drag || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setLocalPos((prev) => ({
      ...prev,
      [drag.id]: {
        x: Math.max(0, event.clientX - rect.left - drag.dx),
        y: Math.max(0, event.clientY - rect.top - drag.dy),
      },
    }));
  }

  function onPointerUp() {
    if (drag) {
      const pos = localPos[drag.id];
      if (pos) updateCheckpoint.mutate({ id: drag.id, patch: { pos_x: pos.x, pos_y: pos.y } });
    }
    setDrag(null);
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function connectYoto() {
    try {
      const verifier = createCodeVerifier();
      const challenge = await createCodeChallenge(verifier);
      sessionStorage.setItem(YOTO_VERIFIER_KEY, verifier);
      const redirectUri = `${window.location.origin}/auth/yoto/callback`;
      const result = await getYotoAuthUrl({ data: { redirectUri, codeChallenge: challenge } });
      if (!result.configured) throw new Error("Yoto connection is not configured.");
      window.location.href = result.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not connect Yoto.");
    }
  }

  function destination(card: Checkpoint, side: "left" | "right") {
    const action = side === "left" ? card.left_action : card.right_action;
    const target = side === "left" ? card.left_target : card.right_target;
    const index = cards.findIndex((item) => item.id === card.id);
    if (action === "jump") return cards.find((item) => item.id === target);
    if (action === "next") return cards[index + 1];
    if (action === "previous") return cards[index - 1];
    return undefined;
  }

  const connections = cards.flatMap((card) => (["left", "right"] as const).map((side) => ({ card, side, to: destination(card, side) })).filter((item) => item.to));

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center gap-3 border-b bg-card/95 px-4 py-3 backdrop-blur md:px-6">
        <span className="mr-2 font-display text-xl font-extrabold text-primary">Spark Studio</span>
        <Select value={selectedProjectId ?? ""} onValueChange={selectProject}>
          <SelectTrigger className="h-10 w-[220px] bg-background" aria-label="Choose playlist">
            <ListMusic className="size-4 text-primary" />
            <SelectValue placeholder="Choose playlist" />
          </SelectTrigger>
          <SelectContent>
            {(projects.data ?? []).map((item) => (
              <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() => createProject.mutate()}
          disabled={createProject.isPending}
        >
          <Plus className="size-4" /> New playlist
        </Button>
        <Button variant="ghost" size="icon" onClick={() => duplicateProject.mutate()} disabled={!project || duplicateProject.isPending} aria-label="Duplicate playlist" title="Duplicate playlist">
          <Copy className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => {
          if (window.confirm(`Delete ${project?.title ?? "this playlist"}?`)) deleteProject.mutate();
        }} disabled={!project || deleteProject.isPending} aria-label="Delete playlist" title="Delete playlist">
          <Trash2 className="size-4" />
        </Button>
        <Input
          value={project?.title ?? ""}
          onChange={(e) => renameProject.mutate(e.target.value)}
          className="h-10 max-w-56 bg-background font-semibold"
          aria-label="Playlist name"
        />
        <span className="text-sm text-muted-foreground">
          {cards.length} checkpoint{cards.length === 1 ? "" : "s"} · saved automatically
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant={profile.data?.yoto_sub ? "outline" : "secondary"} onClick={connectYoto}>
            <Link2 className="size-4" /> {profile.data?.yoto_sub ? "Yoto connected" : "Connect Yoto"}
          </Button>
          <Button onClick={() => addCheckpoint.mutate()} disabled={!selectedProjectId}>
            <Plus className="size-4" /> Add checkpoint
          </Button>
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <div className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-md border bg-card p-1.5 card-shadow">
        <Button size="icon" variant="ghost" onClick={() => runtime.performAction("left")} aria-label="Test left button"><ChevronLeft className="size-5" /></Button>
        <Button size="icon" onClick={runtime.active ? runtime.togglePause : runtime.start} aria-label={runtime.playing ? "Pause test" : "Play test"}><Play className="size-4" /></Button>
        <Button size="icon" variant="ghost" onClick={runtime.stop} aria-label="Stop test"><Square className="size-4" /></Button>
        <Button size="icon" variant="ghost" onClick={() => runtime.performAction("right")} aria-label="Test right button"><ChevronRight className="size-5" /></Button>
        <span className="mx-1 h-6 w-px bg-border" />
        <Button size="icon" variant="ghost" onClick={() => setZoom((value) => Math.max(.6, value - .1))} aria-label="Zoom out"><ZoomOut className="size-4" /></Button>
        <span className="w-11 text-center text-xs font-bold">{Math.round(zoom * 100)}%</span>
        <Button size="icon" variant="ghost" onClick={() => setZoom((value) => Math.min(1.4, value + .1))} aria-label="Zoom in"><ZoomIn className="size-4" /></Button>
        <Button size="icon" variant="ghost" onClick={() => setZoom(1)} aria-label="Reset zoom"><Maximize2 className="size-4" /></Button>
      </div>

      <div
        ref={canvasRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        className="studio-canvas-grid relative min-h-[calc(100vh-64px)] min-w-[1180px] overflow-auto"
      >
        <div className="absolute left-0 top-0 h-full w-full origin-top-left" style={{ transform: `scale(${zoom})` }}>
        <svg className="pointer-events-none absolute inset-0 size-full">
          {connections.map(({ card, side, to }) => {
            const from = posOf(card);
            const target = to;
            if (!target) return null;
            const end = posOf(target);
            const sourceX = from.x + (side === "left" ? 189 : 308);
            return (
              <path
                key={`${card.id}-${side}`}
                d={`M ${sourceX} ${from.y + 300} C ${sourceX} ${from.y + 360}, ${end.x + 270} ${end.y - 60}, ${end.x + 270} ${end.y}`}
                stroke="var(--studio-line)"
                strokeWidth="3"
                fill="none"
              />
            );
          })}
        </svg>

        {checkpoints.isLoading && <p className="p-8 text-muted-foreground">Loading your canvas…</p>}

        {!checkpoints.isLoading && cards.length === 0 && (
          <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center">
            <h2 className="text-2xl font-bold">This playlist is empty</h2>
            <p className="max-w-sm text-muted-foreground">
              Add your first checkpoint, upload a track, and choose what the buttons do.
            </p>
            <Button onClick={() => addCheckpoint.mutate()} size="lg" className="rounded-full">
              <Plus className="size-4" /> Add checkpoint
            </Button>
          </div>
        )}

        {cards.map((card) => {
          const pos = posOf(card);
          return (
            <div
              key={card.id}
              className="absolute"
              style={{ left: pos.x, top: pos.y, touchAction: "none" }}
            >
              <CheckpointCard
                checkpoint={card}
                siblings={cards}
                onPatch={(patch) => updateCheckpoint.mutate({ id: card.id, patch })}
                onDelete={() => removeCheckpoint.mutate(card.id)}
                onDragStart={(event) => {
                   const wrapper = (event.currentTarget as HTMLElement).closest(".absolute");
                   if (!wrapper) return;
                   const rect = wrapper.getBoundingClientRect();
                  setDrag({
                    id: card.id,
                    dx: event.clientX - rect.left,
                    dy: event.clientY - rect.top,
                  });
                }}
                onPlay={() => runtime.activeId === card.id ? runtime.togglePause() : void runtime.playCheckpoint(card)}
                isActive={runtime.activeId === card.id}
                isPlaying={runtime.playing}
                runtimePosition={runtime.position}
                runtimeDuration={runtime.duration}
                onSeek={runtime.seek}
              />
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
