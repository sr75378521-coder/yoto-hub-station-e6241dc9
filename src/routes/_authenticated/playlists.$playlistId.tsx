import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useQuery, queryOptions } from "@tanstack/react-query";
import { ArrowLeft, Clock, Disc3, Download, Loader2, Music } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getPlaylistDetails, getPlaylistTracks } from "@/lib/players.functions";
import { getCardForEdit } from "@/lib/yoto/myo.functions";
import { PlaylistEditor } from "@/components/app/PlaylistEditor";
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

        <FilesCard playlistId={p.cardId ?? playlistId} />

        <LinkCardSection cardId={p.cardId ?? playlistId} />

        <EditorSection cardId={p.cardId ?? playlistId} />

      </div>
    </AppShell>
  );
}

function FilesCard({ playlistId }: { playlistId: string }) {
  const fetchTracks = useServerFn(getPlaylistTracks);
  const { data, isLoading } = useQuery({
    queryKey: ["playlist-tracks", playlistId],
    queryFn: () => fetchTracks({ data: { playlistId } }),
    staleTime: 5 * 60 * 1000,
  });

  const tracks = (data?.tracks ?? []).filter((t) => t.url);
  const dl = (url: string, name: string) =>
    `${url}${url.includes("?") ? "&" : "?"}dl=${encodeURIComponent(`${name}.mp3`)}`;

  const downloadAll = async () => {
    for (const [i, t] of tracks.entries()) {
      const a = document.createElement("a");
      a.href = dl(t.url!, `${String(i + 1).padStart(2, "0")} ${t.title}`);
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
      await new Promise((r) => setTimeout(r, 700));
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Files ({tracks.length})</CardTitle>
        {tracks.length > 0 && (
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
              <Button size="icon" variant="ghost" className="size-8" asChild>
                <a href={dl(t.url!, `${String(i + 1).padStart(2, "0")} ${t.title}`)} download>
                  <Download className="size-4" />
                </a>
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}


function LinkCardSection({ cardId }: { cardId: string }) {
  const doLink = useServerFn(linkPhysicalCard);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const link = async () => {
    if (!code.trim()) return toast.error("Enter the card's code");
    setBusy(true);
    try {
      const res = await doLink({ data: { contentId: cardId, cardId: code.trim() } });
      if (!res.success) toast.error(res.error ?? "Couldn't link that card");
      else toast.success("Card linked to this playlist");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't link that card");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Link a physical card</CardTitle>
        <CardDescription>
          Enter the code from a blank Make Your Own card to point it at this playlist.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Card code (e.g. abc123)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="sm:max-w-xs"
        />
        <Button onClick={() => void link()} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <LinkIcon className="size-4" />}
          Link card
        </Button>
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

