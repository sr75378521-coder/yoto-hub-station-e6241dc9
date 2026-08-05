import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app/AppShell";
import { ConnectYotoCard } from "@/components/app/ConnectYotoCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getFamilyData, type FamilyData, type FamilyPlaylist } from "@/lib/players.functions";
import { Mail, Shield, RefreshCw, Music, Clock, Disc3 } from "lucide-react";

const familyQuery = (fn: () => Promise<FamilyData>) =>
  queryOptions({
    queryKey: ["family"],
    queryFn: () => fn(),
    refetchInterval: 60_000,
  });

export const Route = createFileRoute("/_authenticated/family")({
  head: () => ({
    meta: [
      { title: "Family · Yoto Control Center" },
      {
        name: "description",
        content: "Manage your Yoto family members and their permissions.",
      },
    ],
  }),
  component: FamilyPage,
  errorComponent: ({ error, reset }) => (
    <div className="p-8">
      <h2 className="text-lg font-semibold">Couldn't load family</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <Button onClick={reset} className="mt-4">
        Try again
      </Button>
    </div>
  ),
});

function FamilyPage() {
  const fetchFamily = useServerFn(getFamilyData);
  const { data, isFetching, refetch } = useSuspenseQuery(familyQuery(fetchFamily));

  return (
    <AppShell title="Family">
      <div className="mx-auto max-w-6xl space-y-8">
        {!data.connected ? (
          <ConnectYotoCard />
        ) : (
          <>
            {/* Family Members Section */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {data.members.length} family member{data.members.length === 1 ? "" : "s"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Manage your family group and member permissions.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  disabled={isFetching}
                >
                  <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>

              {data.errorMessage ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive mb-6">
                  {data.errorMessage}
                </div>
              ) : null}

              {data.members.length === 0 ? (
                <EmptyFamily />
              ) : (
                <div className="grid gap-4">
                  {data.members.map((member) => (
                    <FamilyMemberCard key={member.userId} member={member} />
                  ))}
                </div>
              )}
            </div>

            {/* Family Playlists Section */}
            <div className="border-t pt-8">
              <div className="mb-6">
                <h2 className="text-2xl font-semibold tracking-tight">
                  {data.familyPlaylists.length} family playlist{data.familyPlaylists.length === 1 ? "" : "s"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Playlists shared across your family accounts.
                </p>
              </div>

              {data.familyPlaylists.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 p-10 text-center">
                  <Music className="mx-auto size-8 text-muted-foreground/50" />
                  <h3 className="mt-4 text-base font-semibold">No family playlists yet</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Create playlists in the Playlists tab to share with your family.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {data.familyPlaylists.map((playlist) => (
                    <FamilyPlaylistCard key={playlist.playlistId} playlist={playlist} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function FamilyMemberCard({ member }: { member: any }) {
  const initials = `${member.firstName?.[0] ?? ""}${member.lastName?.[0] ?? ""}`.toUpperCase() || "U";
  const fullName = `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim();

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarImage src={member.profileImage} alt={fullName} />
              <AvatarFallback className="bg-primary/10">{initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <p className="font-medium leading-none">{fullName || "Family Member"}</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="size-3" />
                {member.email || "No email"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize">
              <Shield className="size-3 mr-1" />
              {member.role || "Member"}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FamilyPlaylistCard({ playlist }: { playlist: FamilyPlaylist }) {
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
          <CardDescription className="mt-1">Family Playlist</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}

function EmptyFamily() {
  return (
    <Card className="border-dashed">
      <CardContent className="p-10 text-center">
        <h3 className="text-base font-semibold">No family members yet</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Invite family members to share control of your Yoto players.
        </p>
        <Button className="mt-4">Invite Family Member</Button>
      </CardContent>
    </Card>
  );
}

export function FamilySkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-20 rounded-lg" />
      ))}
    </div>
  );
}
