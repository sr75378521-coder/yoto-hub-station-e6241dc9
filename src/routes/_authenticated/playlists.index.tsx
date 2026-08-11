import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PlayOnDeviceButton } from "@/components/app/PlayOnDeviceButton";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { ConnectYotoCard } from "@/components/app/ConnectYotoCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
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
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  const bySource = data.playlists.filter((p) =>
    source === "all" ? true : p.source === source,
  );
  const filteredPlaylists = bySource.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const myoCount = data.playlists.filter((p) => p.source === "myo").length;
  const familyCount = data.playlists.filter((p) => p.source === "family").length;

  return (
    <AppShell title="Playlists">
      <div className="mx-auto max-w-6xl space-y-8">
        {!data.connected ? (
          <ConnectYotoCard />
        ) : (
          <>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {data.playlists.length} playlist{data.playlists.length === 1 ? "" : "s"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Create and edit MYO playlists to customize your Yoto experience.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetch()}
                    disabled={isFetching}
                  >
                    <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                  <CreatePlaylistDialog
                    onCreated={() => {
                      setNewPlaylistName("");
                      toast.success("Playlist created");
                      refetch();
                    }}
                  />
                </div>
              </div>

              {data.playlists.length > 0 && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="inline-flex items-center rounded-lg border border-border/70 bg-card/50 p-1">
                    {([
                      ["all", `All (${data.playlists.length})`],
                      ["myo", `Personal (${myoCount})`],
                      ["family", `Family (${familyCount})`],
                    ] as const).map(([key, text], i) => (
                      <div key={key} className="flex items-center">
                        {i > 0 && <div className="mx-1 h-5 w-px bg-border" />}
                        <button
                          type="button"
                          onClick={() => setSource(key)}
                          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                            source === key
                              ? "bg-primary text-primary-foreground"
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
                    className="pl-9"
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
              <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 p-10 text-center">
                <h3 className="text-base font-semibold">
                  No {source === "myo" ? "personal" : "family"} playlists
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Nothing here yet — try another filter.
                </p>
              </div>
            ) : data.playlists.length === 0 ? (
              <EmptyPlaylists />
            ) : filteredPlaylists.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 p-10 text-center">
                <h3 className="text-base font-semibold">No playlists found</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try adjusting your search query.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

  return (
    <Card className="group hover:shadow-md transition-all hover:border-primary/50">
      <CardHeader className="space-y-3">
        {playlist.artwork ? (
          <img
            src={playlist.artwork}
            alt={playlist.name}
            className="h-32 w-full rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-32 w-full items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5">
            <Music className="size-12 text-primary/40" />
          </div>
        )}
        <div>
          <CardTitle className="line-clamp-2">{playlist.name}</CardTitle>
          <CardDescription className="mt-1">
            {playlist.type === "myo_playlist" ? "MYO Playlist" : "Playlist"}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {playlist.trackCount !== undefined && (
              <div className="flex items-center gap-1">
                <Disc3 className="size-3" />
                {playlist.trackCount} track{playlist.trackCount === 1 ? "" : "s"}
              </div>
            )}
            {playlist.duration && (
              <div className="flex items-center gap-1">
                <Clock className="size-3" />
                {durationStr}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() =>
                navigate({
                  to: "/playlists/$playlistId",
                  params: { playlistId: playlist.playlistId },
                  search: { mode: "view" },
                })
              }
            >
              <Eye className="size-4" />
              View
            </Button>
            {playlist.isEditable && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() =>
                  navigate({
                    to: "/playlists/$playlistId",
                    params: { playlistId: playlist.playlistId },
                    search: { mode: "edit" },
                  })
                }
              >
                <Pencil className="size-4" />
                Edit
              </Button>
            )}
            <PlayOnDeviceButton
              cardId={playlist.playlistId}
              variant="default"
              className="flex-1"
            />
          </div>

        </div>
      </CardContent>
    </Card>
  );
}

function CreatePlaylistDialog({ onCreated }: { onCreated: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error("Please enter a playlist name");
      return;
    }
    setName("");
    setIsOpen(false);
    onCreated();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          New Playlist
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Playlist</DialogTitle>
          <DialogDescription>Create a new MYO playlist to customize your Yoto content.</DialogDescription>
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
            <Button onClick={handleCreate}>Create</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmptyPlaylists() {
  return (
    <Card className="border-dashed">
      <CardContent className="p-10 text-center">
        <Music className="mx-auto size-12 text-muted-foreground" />
        <h3 className="mt-4 text-base font-semibold">No playlists yet</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Create your first MYO playlist to start building custom content.
        </p>
        <Button className="mt-4">
          <Plus className="size-4" />
          Create Playlist
        </Button>
      </CardContent>
    </Card>
  );
}

export function PlaylistsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-64 rounded-lg" />
      ))}
    </div>
  );
}
