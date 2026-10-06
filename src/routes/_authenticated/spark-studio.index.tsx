import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Music, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { AddAudioMenu, audioDuration } from "@/components/studio/AddAudioMenu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { addAudioBoxes, type StudioProject } from "@/hooks/useStudioProject";

export const Route = createFileRoute("/_authenticated/spark-studio/")({
  head: () => ({
    meta: [
      { title: "Spark Studio · Yoto Control Center" },
      { name: "description", content: "Your interactive Yoto playlists — create a new one and design it as a flow chart." },
      { property: "og:title", content: "Spark Studio · Yoto Control Center" },
      { property: "og:description", content: "Your interactive Yoto playlists — create a new one and design it as a flow chart." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudioGallery,
});

function StudioGallery() {
  const [open, setOpen] = useState(false);
  const projects = useQuery({
    queryKey: ["studio", "projects"],
    queryFn: async (): Promise<StudioProject[]> => {
      const { data, error } = await supabase.from("studio_projects").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <AppShell title="Spark Studio">
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-extrabold">Interactive playlists</h1>
          <p className="text-muted-foreground">Make choose-your-own-adventure playlists that kids steer with the player's buttons.</p>
        </div>
        <div className="flex flex-wrap gap-5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex aspect-[54/86] w-44 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary/50 bg-primary/5 text-primary transition hover:bg-primary/10"
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground"><Plus className="size-7" /></span>
            <span className="font-bold">New playlist</span>
          </button>
          {projects.isLoading && <Loader2 className="size-6 animate-spin text-muted-foreground" />}
          {(projects.data ?? []).map((p) => (
            <Link
              key={p.id}
              to="/spark-studio/$projectId"
              params={{ projectId: p.id }}
              className="flex aspect-[54/86] w-44 flex-col overflow-hidden rounded-2xl border bg-card card-shadow transition hover:-translate-y-1"
            >
              <div className="flex flex-1 items-center justify-center bg-gradient-to-br from-primary/80 to-primary text-primary-foreground">
                <Music className="size-12" />
              </div>
              <div className="space-y-1 p-3">
                <div className="line-clamp-2 font-bold leading-tight">{p.title}</div>
                {p.description && <div className="line-clamp-2 text-xs text-muted-foreground">{p.description}</div>}
                {p.yoto_card_id && <div className="flex items-center gap-1 text-xs font-semibold text-primary"><CheckCircle2 className="size-3" /> On Yoto</div>}
              </div>
            </Link>
          ))}
        </div>
      </div>
      {open && <NewPlaylistDialog onClose={() => setOpen(false)} />}
    </AppShell>
  );
}

function NewPlaylistDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("You need to be signed in.");
      const { data: project, error } = await supabase
        .from("studio_projects")
        .insert({ user_id: u.user.id, title: title.trim(), description: description.trim() })
        .select("*")
        .single();
      if (error) throw error;
      await addAudioBoxes(project.id, files, [], audioDuration);
      navigate({ to: "/spark-studio/$projectId", params: { projectId: project.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create playlist");
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-primary">{step === 1 ? "New interactive playlist" : "Add audio"}</DialogTitle>
        </DialogHeader>
        {step === 1 ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="pl-title">Playlist name</Label>
              <Input id="pl-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="The Dragon's Choice" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pl-desc">Description</Label>
              <Textarea id="pl-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="What's this adventure about?" />
            </div>
            <Button className="w-full" disabled={!title.trim() || !description.trim()} onClick={() => setStep(2)}>Next</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <AddAudioMenu onFiles={(f) => setFiles((cur) => [...cur, ...f])} />
            {files.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-auto rounded-xl border p-2 text-sm">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2">
                    <span className="truncate">{f.name}</span>
                    <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}><X className="size-4" /></button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} disabled={busy}>Back</Button>
              <Button className="flex-1" disabled={files.length === 0 || busy} onClick={create}>
                {busy ? <><Loader2 className="size-4 animate-spin" /> Uploading…</> : files.length === 0 ? "Add at least one audio file" : "Create playlist"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
