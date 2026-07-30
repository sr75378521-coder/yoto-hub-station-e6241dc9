import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { ArrowLeft, Clock, Disc3, Music, Play } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getPlaylistDetails } from "@/lib/players.functions";
import { PlayOnDeviceButton } from "@/components/app/PlayOnDeviceButton";
import { ReconnectYotoButton } from "@/components/app/ReconnectYotoButton";

const detailsQuery = (fn: (a: { data: { playlistId: string } }) => Promise<any>, id: string) =>
  queryOptions({
    queryKey: ["playlist-details", id],
    queryFn: () => fn({ data: { playlistId: id } }),
  });

export const Route = createFileRoute("/_authenticated/playlists/$playlistId")({
  head: () => ({
    meta: [
      { title: "Playlist · Yoto Control Center" },
      { name: "description", content: "View and edit a Yoto MYO playlist." },
    ],
  }),
  component: PlaylistDetailPage,
});

function PlaylistDetailPage() {
  const { playlistId } = useParams({ from: "/_authenticated/playlists/$playlistId" });
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

  return (
    <AppShell title={title}>
      <div className="mx-auto max-w-4xl space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/playlists" })}>
          <ArrowLeft className="size-4" /> Back to playlists
        </Button>

        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {cover ? (
              <img src={cover} alt={title} className="size-40 rounded-lg object-cover" />
            ) : (
              <div className="flex size-40 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5">
                <Music className="size-16 text-primary/40" />
              </div>
            )}
            <div className="flex-1 space-y-2">
              <CardTitle className="text-2xl">{title}</CardTitle>
              {meta.author && <CardDescription>By {meta.author}</CardDescription>}
              {meta.description && <p className="text-sm text-muted-foreground">{meta.description}</p>}
              <div className="flex items-center gap-4 pt-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1"><Disc3 className="size-3" />{chapters.length} chapter{chapters.length === 1 ? "" : "s"}</div>
                {meta.duration && (
                  <div className="flex items-center gap-1"><Clock className="size-3" />{Math.round((meta.duration ?? 0) / 60)}m</div>
                )}
              </div>
              <div className="pt-3">
                <PlayOnDeviceButton cardId={p.cardId ?? playlistId} label="Play on…" />
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tracks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {chapters.length === 0 && (
              <p className="text-sm text-muted-foreground">No tracks in this playlist.</p>
            )}
            {chapters.map((ch: any, i: number) => (
              <div key={ch.key ?? i} className="space-y-2">
                <div className="text-sm font-medium">{ch.title ?? `Chapter ${i + 1}`}</div>
                <ul className="space-y-1 pl-4">
                  {(ch.tracks ?? []).map((t: any, ti: number) => (
                    <li key={t.key ?? ti} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Play className="size-3" />
                      <span>{t.title ?? `Track ${ti + 1}`}</span>
                      {t.duration && (
                        <span className="ml-auto text-xs">
                          {Math.floor(t.duration / 60)}:{String(Math.floor(t.duration % 60)).padStart(2, "0")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
