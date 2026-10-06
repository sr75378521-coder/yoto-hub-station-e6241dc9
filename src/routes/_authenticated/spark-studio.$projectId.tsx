import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, CloudUpload, Flag, HelpCircle, Loader2, Maximize2, Pause, Play, Plus, Square, ZoomIn, ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { AddAudioMenu, audioDuration } from "@/components/studio/AddAudioMenu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { addAudioBoxes, type Checkpoint, type StudioProject } from "@/hooks/useStudioProject";
import { useStudioRuntime } from "@/hooks/useStudioRuntime";
import { publishStudioProject, uploadStudioCheckpoint } from "@/lib/yoto/studio.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/spark-studio/$projectId")({
  head: () => ({
    meta: [
      { title: "Studio editor · Spark Studio" },
      { name: "description", content: "Design an interactive Yoto playlist as a top-to-bottom flow chart." },
      { property: "og:title", content: "Studio editor · Spark Studio" },
      { property: "og:description", content: "Design an interactive Yoto playlist as a top-to-bottom flow chart." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudioEditor,
});

const W = 270;
const H = 130;
type Side = "left" | "right" | "auto";
type Pt = { x: number; y: number };
const PORT_X: Record<Side, number> = { left: 75, right: 135, auto: 205 };
const ICONS = ["🎧", "🧙", "🦸", "🐉", "🧝", "🧚", "🚀", "🐺", "🦉", "🗺️", "⚔️", "🔮", "🌙", "⭐", "🐻", "🦄", "🏰", "🌊"];

const fmt = (s: number | null | undefined) => {
  if (!s || !Number.isFinite(s)) return "0:00";
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
};
const size = (b: number | null) => (b ? `${(b / 1024 / 1024).toFixed(1)} MB` : "");

function targetOf(c: Checkpoint, side: Side) {
  if (side === "auto") return c.auto_advance ? c.auto_target : null;
  const action = side === "left" ? c.left_action : c.right_action;
  return action === "jump" ? (side === "left" ? c.left_target : c.right_target) : null;
}
function wpOf(c: Checkpoint, side: Side): Pt[] {
  const w = (c.waypoints ?? {}) as Record<string, Pt[]>;
  return Array.isArray(w[side]) ? w[side] : [];
}

function StudioEditor() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const key = ["studio", "checkpoints", projectId];

  const project = useQuery({
    queryKey: ["studio", "project", projectId],
    queryFn: async (): Promise<StudioProject> => {
      const { data, error } = await supabase.from("studio_projects").select("*").eq("id", projectId).single();
      if (error) throw error;
      return data;
    },
  });
  const checkpoints = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Checkpoint[]> => {
      const { data, error } = await supabase.from("checkpoints").select("*").eq("project_id", projectId).order("pos_y");
      if (error) throw error;
      return data;
    },
  });
  const cards = checkpoints.data ?? [];
  const runtime = useStudioRuntime(cards);

  const patch = useCallback(
    async (id: string, p: Partial<Checkpoint>) => {
      qc.setQueryData<Checkpoint[]>(key, (cur) => (cur ?? []).map((c) => (c.id === id ? { ...c, ...p } : c)));
      const { error } = await supabase.from("checkpoints").update(p).eq("id", id);
      if (error) toast.error(error.message);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId],
  );

  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selEdge, setSelEdge] = useState<{ id: string; side: Side } | null>(null);
  const [localPos, setLocalPos] = useState<Record<string, Pt>>({});
  const [localWp, setLocalWp] = useState<Record<string, Pt[]>>({});
  const [connect, setConnect] = useState<{ id: string; side: Side; at: Pt } | null>(null);
  const [marquee, setMarquee] = useState<{ a: Pt; b: Pt } | null>(null);
  const [showHelp, setShowHelp] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<
    | { kind: "nodes"; start: Pt; orig: Record<string, Pt>; moved: boolean }
    | { kind: "point"; id: string; side: Side; idx: number }
    | null
  >(null);

  const toCanvas = (e: { clientX: number; clientY: number }): Pt => {
    const r = innerRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  };
  const posOf = (c: Checkpoint): Pt => localPos[c.id] ?? { x: c.pos_x, y: c.pos_y };
  const wpFor = (c: Checkpoint, side: Side) => localWp[`${c.id}:${side}`] ?? wpOf(c, side);

  // ---------- keyboard delete ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Backspace" && e.key !== "Delete") return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable=true]")) return;
      e.preventDefault();
      if (selEdge) {
        removeEdge(selEdge.id, selEdge.side);
        setSelEdge(null);
      } else if (selected.size) {
        const ids = [...selected];
        qc.setQueryData<Checkpoint[]>(key, (cur) => (cur ?? []).filter((c) => !selected.has(c.id)));
        setSelected(new Set());
        void supabase.from("checkpoints").delete().in("id", ids).then(() => qc.invalidateQueries({ queryKey: key }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function removeEdge(id: string, side: Side) {
    const c = cards.find((x) => x.id === id);
    if (!c) return;
    const w = { ...((c.waypoints ?? {}) as Record<string, Pt[]>) };
    delete w[side];
    if (side === "auto") void patch(id, { auto_advance: false, auto_target: null, waypoints: w });
    else if (side === "left") void patch(id, { left_action: "none", left_target: null, waypoints: w });
    else void patch(id, { right_action: "none", right_target: null, waypoints: w });
  }

  function link(id: string, side: Side, to: string) {
    const c = cards.find((x) => x.id === id);
    if (!c) return;
    const w = { ...((c.waypoints ?? {}) as Record<string, Pt[]>) };
    delete w[side];
    if (side === "auto") void patch(id, { auto_advance: true, auto_target: to, waypoints: w });
    else if (side === "left") void patch(id, { left_action: "jump", left_target: to, waypoints: w });
    else void patch(id, { right_action: "jump", right_target: to, waypoints: w });
  }

  // ---------- pointer handling ----------
  function onNodeDown(e: React.PointerEvent, c: Checkpoint) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input, [data-port]")) return;
    e.stopPropagation();
    setSelEdge(null);
    const multi = e.shiftKey || e.ctrlKey || e.metaKey || e.altKey;
    let next = selected;
    if (multi) {
      next = new Set(selected);
      if (next.has(c.id)) next.delete(c.id);
      else next.add(c.id);
    } else if (!selected.has(c.id)) {
      next = new Set([c.id]);
    }
    setSelected(next);
    const orig: Record<string, Pt> = {};
    for (const card of cards) if (next.has(card.id)) orig[card.id] = posOf(card);
    drag.current = { kind: "nodes", start: toCanvas(e), orig, moved: false };
  }

  function onCanvasDown(e: React.PointerEvent) {
    if (e.button !== 0 || e.target !== e.currentTarget && !(e.target as Element).closest("svg[data-bg]")) return;
    setSelEdge(null);
    if (e.shiftKey) {
      const p = toCanvas(e);
      setMarquee({ a: p, b: p });
    } else setSelected(new Set());
  }

  function onMove(e: React.PointerEvent) {
    const p = toCanvas(e);
    if (connect) setConnect({ ...connect, at: p });
    if (marquee) setMarquee({ ...marquee, b: p });
    const d = drag.current;
    if (d?.kind === "nodes") {
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
      if (!d.moved) return;
      const next: Record<string, Pt> = {};
      for (const [id, o] of Object.entries(d.orig)) next[id] = { x: Math.max(0, o.x + dx), y: Math.max(0, o.y + dy) };
      setLocalPos((cur) => ({ ...cur, ...next }));
    } else if (d?.kind === "point") {
      const c = cards.find((x) => x.id === d.id);
      if (!c) return;
      const pts = [...wpFor(c, d.side)];
      pts[d.idx] = p;
      setLocalWp((cur) => ({ ...cur, [`${d.id}:${d.side}`]: pts }));
    }
  }

  function onUp(e: React.PointerEvent) {
    if (connect) {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-node-id]");
      const to = el?.getAttribute("data-node-id");
      if (to) link(connect.id, connect.side, to);
      setConnect(null);
    }
    if (marquee) {
      const x1 = Math.min(marquee.a.x, marquee.b.x), x2 = Math.max(marquee.a.x, marquee.b.x);
      const y1 = Math.min(marquee.a.y, marquee.b.y), y2 = Math.max(marquee.a.y, marquee.b.y);
      setSelected(new Set(cards.filter((c) => {
        const p = posOf(c);
        return p.x < x2 && p.x + W > x1 && p.y < y2 && p.y + H > y1;
      }).map((c) => c.id)));
      setMarquee(null);
    }
    const d = drag.current;
    if (d?.kind === "nodes" && d.moved) {
      for (const id of Object.keys(d.orig)) {
        const p = localPos[id];
        if (p) void patch(id, { pos_x: p.x, pos_y: p.y });
      }
    } else if (d?.kind === "point") {
      const c = cards.find((x) => x.id === d.id);
      const pts = localWp[`${d.id}:${d.side}`];
      if (c && pts) void patch(c.id, { waypoints: { ...((c.waypoints ?? {}) as object), [d.side]: pts } });
    }
    drag.current = null;
  }

  function addPoint(e: React.MouseEvent, c: Checkpoint, side: Side, pts: Pt[]) {
    e.stopPropagation();
    const p = toCanvas(e);
    const existing = wpFor(c, side);
    // insert at the segment closest to the click
    let best = 0, bestD = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const m = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
      const dd = Math.hypot(m.x - p.x, m.y - p.y);
      if (dd < bestD) { bestD = dd; best = i; }
    }
    const next = [...existing];
    next.splice(best, 0, p);
    setLocalWp((cur) => ({ ...cur, [`${c.id}:${side}`]: next }));
    void patch(c.id, { waypoints: { ...((c.waypoints ?? {}) as object), [side]: next } });
  }

  function deletePoint(e: React.MouseEvent, c: Checkpoint, side: Side, idx: number) {
    e.preventDefault();
    e.stopPropagation();
    const next = wpFor(c, side).filter((_, i) => i !== idx);
    setLocalWp((cur) => ({ ...cur, [`${c.id}:${side}`]: next }));
    void patch(c.id, { waypoints: { ...((c.waypoints ?? {}) as object), [side]: next } });
  }

  // ---------- actions ----------
  const doUpload = useServerFn(uploadStudioCheckpoint);
  const doPublish = useServerFn(publishStudioProject);

  async function saveToYoto() {
    if (!cards.length) return toast.error("Add at least one audio file first.");
    try {
      const todo = cards.filter((c) => !c.yoto_track);
      for (const [i, c] of todo.entries()) {
        setSaving(`Uploading ${i + 1} of ${todo.length}: ${c.title}`);
        const r = await doUpload({ data: { checkpointId: c.id } });
        if (!r.success) throw new Error(`${c.title}: ${r.error}`);
      }
      setSaving("Saving to your Yoto account…");
      const r = await doPublish({ data: { projectId } });
      if (!r.success) throw new Error(r.error);
      toast.success("Saved to your Yoto account!");
      await qc.invalidateQueries({ queryKey: ["studio"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  }

  async function onAddFiles(files: File[]) {
    setAdding(true);
    try {
      await addAudioBoxes(projectId, files, cards, audioDuration);
      await qc.invalidateQueries({ queryKey: key });
      setAddOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setAdding(false);
    }
  }

  async function rename(title: string) {
    qc.setQueryData<StudioProject>(["studio", "project", projectId], (p) => (p ? { ...p, title } : p));
    await supabase.from("studio_projects").update({ title }).eq("id", projectId);
  }

  // ---------- edges ----------
  const edges = cards.flatMap((c) =>
    (["left", "right", "auto"] as Side[]).flatMap((side) => {
      const to = cards.find((x) => x.id === targetOf(c, side));
      if (!to) return [];
      const a = posOf(c), b = posOf(to);
      const start = { x: a.x + PORT_X[side], y: a.y + H };
      const end = { x: b.x + W / 2, y: b.y - 8 };
      const mids = wpFor(c, side);
      return [{ c, side, pts: [start, ...mids, end], mids }];
    }),
  );
  const pathD = (pts: Pt[]) => {
    if (pts.length === 2) {
      const [s, e] = pts;
      const k = Math.max(40, Math.abs(e.y - s.y) / 2);
      return `M ${s.x} ${s.y} C ${s.x} ${s.y + k}, ${e.x} ${e.y - k}, ${e.x} ${e.y}`;
    }
    return pts.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
  };

  const single = selected.size === 1 ? cards.find((c) => selected.has(c.id)) : undefined;
  const canvasW = Math.max(2400, ...cards.map((c) => posOf(c).x + W + 400));
  const canvasH = Math.max(1600, ...cards.map((c) => posOf(c).y + H + 400));

  return (
    <AppShell title="Spark Studio">
      <div className="-mx-4 -my-6 bg-background md:-mx-8 md:-my-8">
        <header className="sticky top-14 z-[6] flex min-h-16 flex-wrap items-center gap-3 border-b bg-card/95 px-4 py-3 backdrop-blur md:px-6">
          <Button variant="ghost" size="icon" asChild aria-label="Back to playlists">
            <Link to="/spark-studio"><ArrowLeft className="size-5" /></Link>
          </Button>
          <Input
            value={project.data?.title ?? ""}
            onChange={(e) => void rename(e.target.value)}
            className="h-10 max-w-64 bg-background font-semibold"
            aria-label="Playlist name"
          />
          <span className="text-sm text-muted-foreground">
            {cards.length} box{cards.length === 1 ? "" : "es"}
            {project.data?.yoto_card_id ? " · on your Yoto account" : ""}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setShowHelp((v) => !v)} aria-label="How it works"><HelpCircle className="size-5" /></Button>
            <Button variant="outline" onClick={() => setAddOpen(true)}><Plus className="size-4" /> Add audio</Button>
            <Button onClick={saveToYoto} disabled={!!saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
              {project.data?.yoto_card_id ? "Update on Yoto" : "Save to Yoto"}
            </Button>
          </div>
          {saving && <p className="w-full text-sm text-muted-foreground">{saving}</p>}
        </header>

        {showHelp && (
          <aside className="fixed right-4 top-36 z-20 w-80 rounded-xl border bg-card p-4 text-sm card-shadow">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-bold">Create a flow chart from top to bottom</h2>
              <button type="button" onClick={() => setShowHelp(false)} className="text-muted-foreground" aria-label="Hide help">✕</button>
            </div>
            <ul className="list-disc space-y-1.5 pl-4 text-muted-foreground">
              <li>Connect boxes with arrows to create the flow</li>
              <li>Connect any combination of left button, right button, and auto-advance</li>
              <li>Auto-advance is what happens when no button is pressed</li>
              <li>Create a loop by connecting an arrow back to an earlier box</li>
              <li>Select a box or arrow and press backspace to delete it; use Shift + Drag or Ctrl/Cmd + Click, and Alt + Click to multi-select</li>
              <li>Double-click an arrow line to add a point; click and drag the point to move; right-click the point to delete</li>
              <li>Click the box icons to assign icons</li>
              <li>Right-click on boxes to set checkpoints; navigate to checkpoints by turning and pressing the right button on the player</li>
              <li>Checkpoint icons won't load on the player until you have played through the playlist at least once</li>
            </ul>
          </aside>
        )}

        {single && (
          <aside className="fixed bottom-20 left-4 z-20 w-72 space-y-3 rounded-xl border bg-card p-4 card-shadow md:left-[17rem]">
            <Input value={single.title} onChange={(e) => void patch(single.id, { title: e.target.value, yoto_track: single.yoto_track })} aria-label="Box name" />
            <label className="flex items-center justify-between text-sm">Start here <Switch checked={single.is_start} onCheckedChange={(v) => {
              for (const c of cards) if (c.is_start && c.id !== single.id) void patch(c.id, { is_start: false });
              void patch(single.id, { is_start: v });
            }} /></label>
            <label className="flex items-center justify-between text-sm">Loop this audio <Switch checked={single.loop_audio} onCheckedChange={(v) => void patch(single.id, { loop_audio: v })} /></label>
            <label className="flex items-center justify-between text-sm">Checkpoint <Switch checked={single.is_checkpoint} onCheckedChange={(v) => void patch(single.id, { is_checkpoint: v })} /></label>
          </aside>
        )}

        <div className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-md border bg-card p-1.5 card-shadow">
          <Button size="sm" variant="ghost" onClick={() => runtime.performAction("left")}>Left</Button>
          <Button size="icon" onClick={runtime.active ? runtime.togglePause : runtime.start} aria-label={runtime.playing ? "Pause test" : "Play test"}>
            {runtime.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={runtime.stop} aria-label="Stop test"><Square className="size-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => runtime.performAction("right")}>Right</Button>
          <span className="mx-1 h-6 w-px bg-border" />
          <Button size="icon" variant="ghost" onClick={() => setZoom((v) => Math.max(0.4, +(v - 0.1).toFixed(1)))} aria-label="Zoom out"><ZoomOut className="size-4" /></Button>
          <span className="w-11 text-center text-xs font-bold">{Math.round(zoom * 100)}%</span>
          <Button size="icon" variant="ghost" onClick={() => setZoom((v) => Math.min(1.6, +(v + 0.1).toFixed(1)))} aria-label="Zoom in"><ZoomIn className="size-4" /></Button>
          <Button size="icon" variant="ghost" onClick={() => setZoom(1)} aria-label="Reset zoom"><Maximize2 className="size-4" /></Button>
        </div>

        <div className="studio-canvas-grid relative h-[calc(100vh-7.5rem)] overflow-auto">
          <div
            ref={innerRef}
            className="relative origin-top-left select-none"
            style={{ width: canvasW, height: canvasH, transform: `scale(${zoom})` }}
            onPointerDown={onCanvasDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
          >
            <svg data-bg className="absolute inset-0" width={canvasW} height={canvasH}>
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary)" />
                </marker>
              </defs>
              {edges.map(({ c, side, pts, mids }) => {
                const isSel = selEdge?.id === c.id && selEdge.side === side;
                const d = pathD(pts);
                return (
                  <g key={`${c.id}-${side}`}>
                    <path d={d} stroke="transparent" strokeWidth={16} fill="none" className="cursor-pointer"
                      onPointerDown={(e) => { e.stopPropagation(); setSelected(new Set()); setSelEdge({ id: c.id, side }); }}
                      onDoubleClick={(e) => addPoint(e, c, side, pts)} />
                    <path d={d} fill="none" stroke={isSel ? "var(--foreground)" : "var(--primary)"} strokeWidth={isSel ? 3 : 2}
                      strokeDasharray="6 5" markerEnd="url(#arrow)" pointerEvents="none" />
                    {mids.map((p, i) => (
                      <circle key={i} cx={p.x} cy={p.y} r={6} fill="var(--card)" stroke="var(--primary)" strokeWidth={2} className="cursor-move"
                        onPointerDown={(e) => { e.stopPropagation(); if (e.button === 0) drag.current = { kind: "point", id: c.id, side, idx: i }; }}
                        onContextMenu={(e) => deletePoint(e, c, side, i)} />
                    ))}
                  </g>
                );
              })}
              {connect && (() => {
                const c = cards.find((x) => x.id === connect.id);
                if (!c) return null;
                const p = posOf(c);
                return <path d={pathD([{ x: p.x + PORT_X[connect.side], y: p.y + H }, connect.at])} stroke="var(--primary)" strokeWidth={2} strokeDasharray="6 5" fill="none" />;
              })()}
              {marquee && (
                <rect x={Math.min(marquee.a.x, marquee.b.x)} y={Math.min(marquee.a.y, marquee.b.y)}
                  width={Math.abs(marquee.a.x - marquee.b.x)} height={Math.abs(marquee.a.y - marquee.b.y)}
                  fill="var(--primary)" fillOpacity={0.08} stroke="var(--primary)" strokeDasharray="4 3" />
              )}
            </svg>

            {checkpoints.isLoading && <p className="absolute p-8 text-muted-foreground">Loading your canvas…</p>}

            {cards.map((c) => {
              const p = posOf(c);
              const active = runtime.activeId === c.id;
              const sel = selected.has(c.id);
              const pct = active && runtime.duration ? (runtime.position / runtime.duration) * 100 : 0;
              return (
                <div
                  key={c.id}
                  data-node-id={c.id}
                  onPointerDown={(e) => onNodeDown(e, c)}
                  onContextMenu={(e) => { e.preventDefault(); void patch(c.id, { is_checkpoint: !c.is_checkpoint }); toast(c.is_checkpoint ? "Checkpoint removed" : "Checkpoint set"); }}
                  className={cn(
                    "absolute cursor-grab rounded-2xl border-2 bg-card px-3 pb-6 pt-3 active:cursor-grabbing",
                    sel ? "border-blue-500 bg-primary/5 ring-2 ring-blue-500/30" : "border-primary",
                    active && "shadow-lg",
                  )}
                  style={{ left: p.x, top: p.y, width: W, height: H, touchAction: "none" }}
                >
                  {/* input port */}
                  <span className="absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 rounded-full bg-primary" />
                  {c.is_start && <span className="absolute -top-3 left-3 rounded-full bg-primary px-2 text-[10px] font-bold text-primary-foreground">START</span>}
                  {c.is_checkpoint && <Flag className="absolute -top-2.5 right-3 size-5 fill-primary text-primary" aria-label="Checkpoint" />}
                  <div className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button type="button" className="text-lg leading-none" aria-label="Choose icon">{c.icon ?? "🎧"}</button>
                      </PopoverTrigger>
                      <PopoverContent className="grid w-56 grid-cols-6 gap-1 p-2">
                        {ICONS.map((i) => (
                          <button key={i} type="button" className="rounded p-1 text-xl hover:bg-muted" onClick={() => void patch(c.id, { icon: i })}>{i}</button>
                        ))}
                      </PopoverContent>
                    </Popover>
                    <button type="button" aria-label={active && runtime.playing ? "Pause" : "Play"}
                      onClick={() => (active ? runtime.togglePause() : void runtime.playCheckpoint(c))}
                      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      {active && runtime.playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                    </button>
                    <span className="flex-1 truncate text-sm font-bold" title={c.title}>{c.title}</span>
                    <span className="text-[11px] text-muted-foreground">{size(c.audio_size)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{fmt(active ? runtime.position : 0)}</span>
                    <div className="h-1 flex-1 rounded bg-muted"><div className="h-1 rounded bg-primary" style={{ width: `${pct}%` }} /></div>
                    <span>{fmt(c.audio_duration)}</span>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 h-0">
                    {(["left", "right", "auto"] as Side[]).map((side) => (
                      <div key={side} className="absolute -translate-x-1/2 text-center" style={{ left: PORT_X[side], bottom: 8 }}>
                        <div className="mb-1 text-[10px] font-medium text-muted-foreground">{side === "auto" ? "Auto-advance" : side === "left" ? "Left" : "Right"}</div>
                        {side !== "auto" && <div className="mx-auto mb-1 size-5 rounded-full bg-gradient-to-b from-primary/70 to-primary" />}
                        <button
                          type="button"
                          data-port
                          aria-label={`Connect ${side}`}
                          onPointerDown={(e) => { e.stopPropagation(); setConnect({ id: c.id, side, at: toCanvas(e) }); }}
                          className={cn("absolute left-1/2 size-3.5 -translate-x-1/2 cursor-crosshair rounded-full border-2 border-card",
                            targetOf(c, side) ? "bg-blue-500" : "bg-primary")}
                          style={{ bottom: -15 }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={(o) => !adding && setAddOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-primary">Add audio</DialogTitle></DialogHeader>
          {adding ? <p className="flex items-center gap-2 py-6 text-sm"><Loader2 className="size-4 animate-spin" /> Uploading…</p> : <AddAudioMenu onFiles={onAddFiles} />}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
