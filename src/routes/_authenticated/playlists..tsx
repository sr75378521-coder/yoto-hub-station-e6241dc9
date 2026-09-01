import { createFileRoute, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useQuery, queryOptions } from "@tanstack/react-query";
import { ArrowLeft, Clock, Disc3, Download, Loader2, Music, Pencil, Eye, Lock } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getPlaylistDetails, getPlaylistTracks, checkIsAdmin } from "@/lib/players.functions";
import { getCardForEdit } from "@/lib/yoto/myo.functions";
import { PlaylistEditor } from "@/components/app/PlaylistEditor";
import { PlayOnDeviceButton } from "@/components/app/PlayOnDeviceButton";
import { LinkCardDialog } from "@/components/app/LinkCardDialog";
import { ReconnectYotoButton } from "@/components/app/ReconnectYotoButton";
import { supabase } from "@/integrations/supabase/client";

const detailsQuery = (fn: (a: { data: { playlistId: string } }) => Promise<any>, id: string) =>
  queryOptions({
    queryKey: ["playlist-details", id],
    queryFn: () => fn({ data: { playlistId: id } }),
  });

export const Route = createFileRoute("/_authenticated/playlists/")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search["mode"] === "edit" ? ("edit" as const) : ("view" as const),
  }),
  head: () => ({
    meta: [
      { title: "Playlist · Yoto Control Center" },
      { name: "description", content: "View and edit a Yoto MYO playlist." },
    ],
  }),
  component: PlaylistDetailPage,
});

function PlaylistDetailPage() {
  const { playlistId } = useParams({ from: "/_authenticated/playlists/" });
  const { mode } = useSearch({ from: "/_authenticated/playlists/" });
  const navigate = useNavigate();
  const fetchDetails = useServerFn(getPlaylistDetails);
  const { data } = useSuspenseQuery(detailsQuery(fetchDetails as any, playlistId));

  if (!data?.success) {
    return (
      <AppShell title="Playlist">
        <div className="mx-auto max-w-3xl space-y-4">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/playlists" })}>
            <ArrowLeft className="size-4" /> Back
          </Button>
          <Card><CardContent className="space-y-4 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Couldn't load this playlist{data?.error ? `: ${data.error}` : "."}
            </p>
            {String(data?.error ?? "").includes("scope") && (
              <p className="text-sm text-muted-foreground">
                Your Yoto connection is missing content permissions. Reconnect to grant them.
              </p>
            )}
            <div className="flex justify-center"><ReconnectYotoButton /></div>
          </CardContent></Card>
        </div>
      </AppShell>
    );
  }

  const p: any = data.playlist ?? {};
  const card = p.card ?? p;
  const meta = card.metadata ?? {};
  const chapters: any[] = card.content?.chapters ?? [];
  const cover =
    meta.cover?.imageL ?? meta.cover?.imageM ?? meta.cover?.imageS ?? "";
  const title = meta.title ?? card.title ?? "Untitled";
  const cardId = p.cardId ?? playlistId;

  return (
    <AppShell title={title}>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/playlists" })}>
            <ArrowLeft className="size-4" /> Back
          </Button>
          <LinkCardDialog contentId={cardId} />
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={mode === "edit" ? "outline" : "default"}
              onClick={() =>
                navigate({
                  to: "/playlists/",
                  params: { playlistId },
                  search: { mode: mode === "edit" ? "view" : "edit" },
                })
              }
            >
              {mode === "edit" ? (
                <>
                  <Eye className="size-4" /> View
                </>
              ) : (
                <>
                  <Pencil className="size-4" /> Edit
                </>
              )}
            </Button>
            <PlayOnDeviceButton cardId={cardId} label="Play" variant="outline" />
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {cover ? (
              <img src={cover} alt={title} className="size-32 rounded-lg object-cover sm:size-40" />
            ) : (
              <div className="flex size-32 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 sm:size-40">
                <Music className="size-16 text-primary/40" />
              </div>
            )}
            <div className="flex-1 space-y-2">
              <CardTitle className="text-xl sm:text-2xl">{title}</CardTitle>
              {meta.author && <CardDescription>By {meta.author}</CardDescription>}
              {meta.description && <p className="text-sm text-muted-foreground">{meta.description}</p>}
              <div className="flex flex-wrap items-center gap-4 pt-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1"><Disc3 className="size-3" />{chapters.length} chapter{chapters.length === 1 ? "" : "s"}</div>
                {meta.duration && (
                  <div className="flex items-center gap-1"><Clock className="size-3" />{Math.round((meta.duration ?? 0) / 60)}m</div>
                )}
              </div>
              <div className="pt-3">
                <PlayOnDeviceButton cardId={cardId} label="Play on…" />
              </div>
            </div>
          </CardHeader>
        </Card>

        <FilesCard playlistId={cardId} />

        {mode === "edit" && <EditorSection cardId={cardId} />}

      </div>
    </AppShell>
  );
}


function FilesCard({ playlistId }: { playlistId: string }) {
  const fetchTracks = useServerFn(getPlaylistTracks);
  const checkAdmin = useServerFn(checkIsAdmin);
  
  const { data: adminStatus } = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => checkAdmin(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["playlist-tracks", playlistId],
    queryFn: () => fetchTracks({ data: { playlistId } }),
    staleTime: 5 * 60 * 1000,
  });

  const tracks = (data?.tracks ?? []).filter((t) => t.url);
  const isAdmin = !!adminStatus?.isAdmin;

  const downloadAll = async () => {
    if (!isAdmin) return;
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    
    for (const [i, t] of tracks.entries()) {
      const url = t.url!;
      const name = `${String(i + 1).padStart(2, "0")} ${t.title}`;
      const dlUrl = `${url}${url.includes("?") ? "&" : "?"}dl=${encodeURIComponent(`${name}.mp3`)}`;
      
      // We must fetch with Authorization header for the API to allow it
      const response = await fetch(dlUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `${name}.mp3`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(blobUrl);
      }
      
      await new Promise((r) => setTimeout(r, 700));
    }
  };

  const getDownloadUrl = (url: string, name: string) => {
    return `${url}${url.includes("?") ? "&" : "?"}dl=${encodeURIComponent(`${name}.mp3`)}`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          Files ({tracks.length})
          {!isAdmin && <Lock className="size-3 text-muted-foreground" title="Admin only" />}
        </CardTitle>
        {tracks.length > 0 && isAdmin && (
          <Button size="sm" variant="outline" onClick={() => void downloadAll()}>
            <Download className="size-4" /> Download all
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading files…
          </div>
        ) : tracks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No downloadable audio files for this playlist.
          </p>
        ) : (
          tracks.map((t, i) => (
            <div
              key={t.key}
              className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-secondary/60"
            >
              <span className="w-6 text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {t.duration
                  ? `${Math.floor(t.duration / 60)}:${String(Math.floor(t.duration % 60)).padStart(2, "0")}`
                  : ""}
              </span>
              <Button 
                size="icon" 
                variant="ghost" 
                className="size-8" 
                disabled={!isAdmin}
                onClick={async () => {
                   if (!isAdmin) return;
                   const { data: session } = await supabase.auth.getSession();
                   const token = session.session?.access_token;
                   const name = `${String(i + 1).padStart(2, "0")} ${t.title}`;
                   const response = await fetch(getDownloadUrl(t.url!, name), {
                     headers: { 'Authorization': `Bearer ${token}` }
                   });
                   if (response.ok) {
                     const blob = await response.blob();
                     const blobUrl = window.URL.createObjectURL(blob);
                     const a = document.createElement("a");
                     a.href = blobUrl;
                     a.download = `${name}.mp3`;
                     a.click();
                     window.URL.revokeObjectURL(blobUrl);
                   }
                }}
              >
                <Download className="size-4" />
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}



function EditorSection({ cardId }: { cardId: string }) {

  const fetchCard = useServerFn(getCardForEdit);
  const { data, isLoading } = useQuery({
    queryKey: ["card-edit", cardId],
    queryFn: () => fetchCard({ data: { cardId } }),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading editor…
        </CardContent>
      </Card>
    );
  }

  if (!data?.success || !data.card) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Editing isn't available for this playlist{data?.error ? `: ${data.error}` : "."}
        </CardContent>
      </Card>
    );
  }

  return <PlaylistEditor key={cardId} card={data.card} />;
}
