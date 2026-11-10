import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PlayOnDeviceButton } from "@/components/app/PlayOnDeviceButton";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { ConnectYotoCard } from "@/components/app/ConnectYotoCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createPlaylist } from "@/lib/yoto/myo.functions";
import { getPlaylistsData, type PlaylistData, type PlaylistSummary } from "@/lib/players.functions";
import { Music, Plus, RefreshCw, Search, Clock, Disc3, Eye, Pencil } from "lucide-react";

const playlistsQuery = (fn: () => Promise<PlaylistData>) =>
  queryOptions({
    queryKey: ["playlists"],
    queryFn: () => fn(),
    refetchInterval: 60_000,
  });

export const Route = createFileRoute("/_authenticated/playlists/")({
  head: () => ({
    meta: [
      { title: "Playlists · Yoto Control Center" },
      {
        name: "description",
        content: "Manage and create MYO playlists for your Yoto players.",
      },
    ],
  }),
  component: PlaylistsPage,
  errorComponent: ({ error, reset }) => (
    <div className="p-8">
      <h2 className="text-lg font-semibold">Couldn't load playlists</h2>
      <p className="mt-2 text-sm text-muted-foreground">{(error as Error).message}</p>
      <Button onClick={reset} className="mt-4">
        Try again
      </Button>
    </div>
  ),
});

function PlaylistsPage() {
  const fetchPlaylists = useServerFn(getPlaylistsData);
  const { data, isFetching, refetch } = useSuspenseQuery(playlistsQuery(fetchPlaylists));
  const [searchQuery, setSearchQuery] = useState("");
  const [source, setSource] = useState<"all" | "myo" | "family">("all");

  const bySource = data.playlists.filter((p) => (source === "all" ? true : p.source === source));
  const filteredPlaylists = bySource.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const myoCount = data.playlists.filter((p) => p.source === "myo").length;
  const familyCount = data.playlists.filter((p) => p.source === "family").length;

  return (
    <AppShell title="Playlists">
      <div className="mx-auto max-w-6xl space-y-6">
        {!data.connected ? (
          <ConnectYotoCard />
        ) : (
          <>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">
                    {data.playlists.length} playlist{data.playlists.length === 1 ? "" : "s"}
                  </h2>
                  <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">
                    Create and edit MYO playlists to customize your Yoto experience.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => refetch()}
                    disabled={isFetching}
                  >
                    <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                  <CreatePlaylistDialog
                    onCreated={() => {
                      toast.success("Playlist created");
                      refetch();
                    }}
                  />
                </div>
              </div>

              {data.playlists.length > 0 && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="inline-flex items-center rounded-lg border border-border/70 bg-card/50 p-1">
                    {(
                      [
                        ["all", `All (${data.playlists.length})`],
                        ["myo", `Personal (${myoCount})`],
                        ["family", `Family (${familyCount})`],
                      ] as const
                    ).map(([key, text], i) => (
                      <div key={key} className="flex items-center">
                        {i > 0 && <div className="mx-1 h-4 w-px bg-border" />}
                        <button
                          type="button"
                          onClick={() => setSource(key)}
                          className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                            source === key
                              ? "bg-primary text-primary-foreground font-medium"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {text}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.playlists.length > 0 && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search playlists..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 pl-9 text-sm"
                  />
                </div>
              )}
            </div>

            {data.errorMessage ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                {data.errorMessage}
              </div>
            ) : null}

            {bySource.length === 0 && data.playlists.length > 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 p-8 text-center">
                <h3 className="text-sm font-semibold">
                  No {source === "myo" ? "personal" : "family"} playlists
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Nothing here yet — try another filter.
                </p>
              </div>
            ) : data.playlists.length === 0 ? (
              <EmptyPlaylists />
            ) : filteredPlaylists.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 p-8 text-center">
                <h3 className="text-sm font-semibold">No playlists found</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Try adjusting your search query.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {filteredPlaylists.map((playlist) => (
                  <PlaylistCard key={playlist.playlistId} playlist={playlist} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function PlaylistCard({ playlist }: { playlist: PlaylistSummary }) {
  const navigate = useNavigate();
  const hours = Math.floor((playlist.duration ?? 0) / 3600);
  const minutes = Math.floor(((playlist.duration ?? 0) % 3600) / 60);
  const durationStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  const openView = () => {
    navigate({
      to: "/playlists/$playlistId",
      params: { playlistId: playlist.playlistId },
      search: { mode: "view" },
    });
  };

  const openEdit = () => {
    navigate({
      to: "/playlists/$playlistId",
      params: { playlistId: playlist.playlistId },
      search: { mode: "edit" },
    });
  };

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-card text-card-foreground shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md">
      {/* Clickable Edge-to-edge artwork */}
      <div
        className="relative aspect-square w-full cursor-pointer overflow-hidden bg-muted/20"
        onClick={openView}
      >
        {playlist.artwork ? (
          <img
            src={playlist.artwork}
            alt={playlist.name}
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/15 via-primary/5 to-muted/20">
            <Music className="size-16 text-primary/30" />
          </div>
        )}

        <Badge
          variant="secondary"
          className="absolute top-2.5 right-2.5 border-0 bg-background/85 px-2.5 py-0.5 text-[11px] font-medium backdrop-blur-md shadow-xs text-foreground"
        >
          {playlist.type === "myo_playlist" || playlist.source === "myo" ? "MYO" : "Family"}
        </Badge>
      </div>

      {/* Info & action buttons */}
      <div className="flex flex-1 flex-col justify-between p-4 space-y-3">
        <div>
          <h3
            onClick={openView}
            className="line-clamp-1 cursor-pointer text-base font-semibold tracking-tight text-foreground transition-colors hover:text-primary"
            title={playlist.name}
          >
            {playlist.name}
          </h3>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            {playlist.trackCount !== undefined && (
              <div className="flex items-center gap-1">
                <Disc3 className="size-3.5" />
                <span>
                  {playlist.trackCount} track{playlist.trackCount === 1 ? "" : "s"}
                </span>
              </div>
            )}
            {playlist.duration ? (
              <div className="flex items-center gap-1">
                <Clock className="size-3.5" />
                <span>{durationStr}</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Clean, spacious action layout: Play on top, View + Edit side-by-side */}
        <div className="space-y-2 pt-1">
          <PlayOnDeviceButton
            cardId={playlist.playlistId}
            label="Play"
            variant="default"
            className="h-9 w-full text-xs font-semibold shadow-xs"
          />

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 flex-1 text-xs font-medium border-border/60 hover:bg-muted/60"
              onClick={openView}
            >
              <Eye className="size-3.5 mr-1.5" />
              View
            </Button>

            {playlist.isEditable && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 flex-1 text-xs font-medium border-border/60 hover:bg-muted/60"
                onClick={openEdit}
              >
                <Pencil className="size-3.5 mr-1.5" />
                Edit
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreatePlaylistDialog({ onCreated }: { onCreated: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const create = useServerFn(createPlaylist);
  const navigate = useNavigate();

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Please enter a playlist name");
      return;
    }
    setBusy(true);
    try {
      const res = await create({ data: { title: name.trim() } });
      if (!res.success || !res.cardId) throw new Error(res.error || "Couldn't create playlist");
      setName("");
      setIsOpen(false);
      onCreated();
      navigate({
        to: "/playlists/$playlistId",
        params: { playlistId: res.cardId },
        search: { mode: "edit" },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create playlist");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 text-xs">
          <Plus className="size-3.5 mr-1" />
          New Playlist
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Playlist</DialogTitle>
          <DialogDescription>
            Create a new MYO playlist to customize your Yoto content.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Playlist Name</label>
            <Input
              placeholder="My Awesome Playlist"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
              autoFocus
              className="mt-2"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={busy}>
              {busy ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmptyPlaylists() {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 p-10 text-center">
      <Music className="mx-auto size-12 text-muted-foreground" />
      <h3 className="mt-4 text-base font-semibold">No playlists yet</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Create your first MYO playlist to start building custom content.
      </p>
    </div>
  );
}

export function PlaylistsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-border/50 bg-card p-0 shadow-xs"
        >
          <Skeleton className="aspect-square w-full rounded-none" />
          <div className="p-4 space-y-3">
            <Skeleton className="h-5 w-3/4 rounded-md" />
            <Skeleton className="h-4 w-1/2 rounded-md" />
            <div className="space-y-2 pt-1">
              <Skeleton className="h-9 w-full rounded-md" />
              <div className="flex gap-2">
                <Skeleton className="h-8 flex-1 rounded-md" />
                <Skeleton className="h-8 flex-1 rounded-md" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
