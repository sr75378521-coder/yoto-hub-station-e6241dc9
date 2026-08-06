import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { IconPicker } from "@/components/app/IconPicker";
import { getPlaylistTracks } from "@/lib/players.functions";
import {
  deleteCard,
  saveCard,
  uploadTrack,
  type EditableCard,
  type EditableChapter,
} from "@/lib/yoto/myo.functions";

function fmtDur(s?: number) {
  if (!s) return "";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function downloadHref(url: string, name: string) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}dl=${encodeURIComponent(`${name}.mp3`)}`;
}

export function PlaylistEditor({ card }: { card: EditableCard }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const doSave = useServerFn(saveCard);
  const doDelete = useServerFn(deleteCard);
  const doUpload = useServerFn(uploadTrack);
  const doUploadCover = useServerFn(uploadCover);
  const fetchTracks = useServerFn(getPlaylistTracks);

  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [cover, setCover] = useState(card.cover);
  const [chapters, setChapters] = useState<EditableChapter[]>(card.chapters);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Resolved, streamable URLs so each track can also be downloaded.
  const { data: resolved } = useQuery({
    queryKey: ["playlist-tracks", card.cardId],
    queryFn: () => fetchTracks({ data: { playlistId: card.cardId } }),
    staleTime: 5 * 60 * 1000,
  });

  const urlByTitle = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of resolved?.tracks ?? []) {
      if (t.url && t.title && !map.has(t.title)) map.set(t.title, t.url);
    }
    return map;
  }, [resolved]);

  const downloadAll = async () => {
    const list = (resolved?.tracks ?? []).filter((t) => t.url);
    if (!list.length) {
      toast.error("No downloadable audio for this playlist yet");
      return;
    }
    toast.success(`Downloading ${list.length} track${list.length === 1 ? "" : "s"}…`);
    for (const [i, t] of list.entries()) {
      const a = document.createElement("a");
      a.href = downloadHref(t.url!, `${String(i + 1).padStart(2, "0")} ${t.title}`);
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
      await new Promise((r) => setTimeout(r, 700));
    }
  };

  const handleCover = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setCoverBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await doUploadCover({ data: fd });
      if (!res.success || !res.url) {
        toast.error(res.error ?? "Couldn't upload cover");
        return;
      }
      setCover(res.url);
      setDirty(true);
      toast.success("New cover ready — click Save to apply");
    } finally {
      setCoverBusy(false);
      if (coverRef.current) coverRef.current.value = "";
    }
  };



  const mutate = (next: EditableChapter[]) => {
    setChapters(next);
    setDirty(true);
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= chapters.length) return;
    const next = [...chapters];
    [next[i], next[j]] = [next[j], next[i]];
    mutate(next);
  };

  const removeChapter = (i: number) => mutate(chapters.filter((_, x) => x !== i));

  const renameChapter = (i: number, value: string) =>
    mutate(
      chapters.map((ch, x) =>
        x === i
          ? { ...ch, title: value, tracks: ch.tracks.map((t, ti) => (ti === 0 ? { ...t, title: value } : t)) }
          : ch,
      ),
    );

  const renameTrack = (ci: number, ti: number, value: string) =>
    mutate(
      chapters.map((ch, x) =>
        x === ci
          ? { ...ch, tracks: ch.tracks.map((t, y) => (y === ti ? { ...t, title: value } : t)) }
          : ch,
      ),
    );

  const removeTrack = (ci: number, ti: number) =>
    mutate(
      chapters
        .map((ch, x) => (x === ci ? { ...ch, tracks: ch.tracks.filter((_, y) => y !== ti) } : ch))
        .filter((ch) => ch.tracks.length > 0),
    );

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    const added: EditableChapter[] = [];
    for (const file of list) {
      setUploading(file.name);
      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await doUpload({ data: fd });
        if (!res.success || !res.track) {
          toast.error(`${file.name}: ${res.error ?? "upload failed"}`);
          continue;
        }
        added.push({
          key: "00",
          title: res.track.title,
          tracks: [res.track],
        });
      } catch (e) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      }
    }
    setUploading(null);
    if (fileRef.current) fileRef.current.value = "";
    if (added.length) {
      mutate([...chapters, ...added]);
      toast.success(`Added ${added.length} track${added.length === 1 ? "" : "s"} — remember to save`);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await doSave({
        data: { cardId: card.cardId, title, description, chapters },
      });
      if (!res.success) {
        toast.error(res.error ?? "Couldn't save playlist");
        return;
      }
      toast.success("Playlist saved to your Yoto account");
      setDirty(false);
      await qc.invalidateQueries({ queryKey: ["playlist-details", card.cardId] });
      await qc.invalidateQueries({ queryKey: ["card-edit", card.cardId] });
      await qc.invalidateQueries({ queryKey: ["playlists"] });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await doDelete({ data: { cardId: card.cardId } });
      if (!res.success) {
        toast.error(res.error ?? "Couldn't delete playlist");
        return;
      }
      toast.success("Playlist deleted");
      await qc.invalidateQueries({ queryKey: ["playlists"] });
      navigate({ to: "/playlists" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Edit playlist</CardTitle>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={deleting}>
                {deleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this playlist?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes “{title}” from your Yoto account. This can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pl-title">Title</Label>
            <Input
              id="pl-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pl-desc">Description</Label>
            <Textarea
              id="pl-desc"
              rows={2}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setDirty(true);
              }}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Tracks ({chapters.reduce((a, c) => a + c.tracks.length, 0)})
            </span>
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="audio/*"
                multiple
                className="hidden"
                onChange={(e) => void handleFiles(e.target.files)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={uploading !== null}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                {uploading ? `Uploading ${uploading}…` : "Upload audio"}
              </Button>
            </div>
          </div>

          {chapters.length === 0 && (
            <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No tracks yet — upload audio files to build this playlist.
            </p>
          )}

          <div className="space-y-2">
            {chapters.map((ch, ci) => {
              const chUrl = urlByTitle.get(ch.tracks[0]?.title ?? "") ?? urlByTitle.get(ch.title);
              return (
              <div key={`${ch.key}-${ci}`} className="rounded-2xl border border-border/70 p-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 text-xs tabular-nums text-muted-foreground">{ci + 1}.</span>
                  <IconPicker
                    value={ch.icon}
                    onChange={(ref) =>
                      mutate(
                        chapters.map((c, x) =>
                          x === ci
                            ? {
                                ...c,
                                icon: ref,
                                tracks: c.tracks.map((t, ti) =>
                                  ti === 0 ? { ...t, icon: ref } : t,
                                ),
                              }
                            : c,
                        ),
                      )
                    }
                  />
                  <Input
                    value={ch.title}
                    onChange={(e) => renameChapter(ci, e.target.value)}
                    className="h-9 flex-1"
                  />
                  <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                    {fmtDur(ch.tracks[0]?.duration)}
                  </span>
                  {chUrl && (
                    <Button size="icon" variant="ghost" className="size-8" asChild>
                      <a href={downloadHref(chUrl, ch.title)} download title="Download audio">
                        <Download className="size-4" />
                      </a>
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="size-8" onClick={() => move(ci, -1)} disabled={ci === 0}>
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    onClick={() => move(ci, 1)}
                    disabled={ci === chapters.length - 1}
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-8" onClick={() => removeChapter(ci)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                {ch.tracks.length > 1 && (
                  <div className="mt-2 space-y-1 pl-8">
                    {ch.tracks.map((t, ti) => {
                      const tUrl = urlByTitle.get(t.title);
                      return (
                      <div key={`${t.key}-${ti}`} className="flex items-center gap-2">
                        <IconPicker
                          value={t.icon}
                          onChange={(ref) =>
                            mutate(
                              chapters.map((c, x) =>
                                x === ci
                                  ? {
                                      ...c,
                                      tracks: c.tracks.map((tt, y) =>
                                        y === ti ? { ...tt, icon: ref } : tt,
                                      ),
                                    }
                                  : c,
                              ),
                            )
                          }
                        />
                        <Input
                          value={t.title}
                          onChange={(e) => renameTrack(ci, ti, e.target.value)}
                          className="h-8 flex-1 text-xs"
                        />
                        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                          {fmtDur(t.duration)}
                        </span>
                        {tUrl && (
                          <Button size="icon" variant="ghost" className="size-7" asChild>
                            <a href={downloadHref(tUrl, t.title)} download title="Download audio">
                              <Download className="size-3.5" />
                            </a>
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => removeTrack(ci, ti)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      );
                    })}
                  </div>
                )}

              </div>
              );
            })}

          </div>

          {dirty && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Plus className="size-3" /> Unsaved changes — click Save to push them to Yoto.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
