import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { ConnectYotoCard } from "@/components/app/ConnectYotoCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getFamilyData,
  getPlaylistsData,
  type FamilyData,
  type FamilyPlaylist,
} from "@/lib/players.functions";
import {
  cancelFamilyInvite,
  createFamilyGroup,
  getFamilyGroups,
  inviteFamilyMember,
  removeFamilyMember,
  shareFamilyPlaylist,
  unshareFamilyPlaylist,
  updateFamilyMember,
  type FamilyGroup,
} from "@/lib/family.functions";
import {
  Mail,
  Shield,
  RefreshCw,
  Music,
  Clock,
  Disc3,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

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
        content:
          "Create your Control Center family, invite members and choose which Yoto playlists they can listen to or edit.",
      },
      { property: "og:title", content: "Family · Yoto Control Center" },
      {
        property: "og:description",
        content:
          "Create your Control Center family, invite members and choose which Yoto playlists they can listen to or edit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
      <div className="mx-auto max-w-6xl space-y-10">
        <ControlCenterFamily />

        <div className="border-t pt-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Your Yoto family</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Straight from your Yoto account — members and shared library.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {!data.connected ? (
            <ConnectYotoCard />
          ) : (
            <div className="space-y-8">
              {data.errorMessage ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
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

              <div>
                <h3 className="mb-4 text-lg font-semibold">
                  {data.familyPlaylists.length} family playlist
                  {data.familyPlaylists.length === 1 ? "" : "s"}
                </h3>
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
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

/* ------------------------- Control Center family ------------------------- */

function ControlCenterFamily() {
  const fetchGroups = useServerFn(getFamilyGroups);
  const doCreate = useServerFn(createFamilyGroup);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["family-groups"],
    queryFn: () => fetchGroups(),
  });

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await doCreate({ data: { name } });
      if (!res.success) {
        toast.error(res.error ?? "Couldn't create family");
        return;
      }
      toast.success(`"${name}" family created — you're the admin`);
      setName("");
      await qc.invalidateQueries({ queryKey: ["family-groups"] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Users className="size-6 text-primary" /> Control Center family
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite people with a Yoto Control Center account, share your playlists with them and
          decide who's allowed to edit.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : (
        <>
          {(data?.groups ?? []).map((group) => (
            <FamilyGroupCard key={group.id} group={group} />
          ))}

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">Create a family</CardTitle>
              <CardDescription>
                You can belong to several families — you're the admin of any family you create.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="min-w-52 flex-1 space-y-1.5">
                <Label htmlFor="fam-name">Family name</Label>
                <Input
                  id="fam-name"
                  placeholder="The Smiths"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <Button onClick={() => void create()} disabled={busy || !name.trim()}>
                <Plus className="size-4" /> Create family
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function FamilyGroupCard({ group }: { group: FamilyGroup }) {
  const qc = useQueryClient();
  const doInvite = useServerFn(inviteFamilyMember);
  const doCancel = useServerFn(cancelFamilyInvite);
  const doUpdate = useServerFn(updateFamilyMember);
  const doRemove = useServerFn(removeFamilyMember);
  const doShare = useServerFn(shareFamilyPlaylist);
  const doUnshare = useServerFn(unshareFamilyPlaylist);
  const fetchPlaylists = useServerFn(getPlaylistsData);

  const isAdmin = group.myRole === "admin";
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [canEdit, setCanEdit] = useState(false);
  const [pick, setPick] = useState("");

  const { data: playlistData } = useQuery({
    queryKey: ["playlists"],
    queryFn: () => fetchPlaylists(),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["family-groups"] });
  const run = async (p: Promise<{ success: boolean; error?: string }>, ok: string) => {
    const res = await p;
    if (!res.success) {
      toast.error(res.error ?? "Something went wrong");
      return;
    }
    toast.success(ok);
    await refresh();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-lg">{group.name}</CardTitle>
          <CardDescription>
            {group.members.length} member{group.members.length === 1 ? "" : "s"} ·{" "}
            {group.playlists.length} shared playlist{group.playlists.length === 1 ? "" : "s"}
          </CardDescription>
        </div>
        <Badge variant={isAdmin ? "default" : "outline"} className="capitalize">
          <Shield className="mr-1 size-3" /> {group.myRole}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Members */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Members</p>
          {group.members.map((m) => (
            <div
              key={m.userId}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 p-3"
            >
              <Avatar className="size-9">
                <AvatarFallback className="bg-primary/10">
                  {(m.email ?? "U").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-40 flex-1">
                <p className="text-sm font-medium">{m.displayName ?? m.email ?? "Member"}</p>
                <p className="text-xs text-muted-foreground">{m.email ?? "—"}</p>
              </div>
              {isAdmin && m.userId !== group.ownerId ? (
                <>
                  <Select
                    value={m.role}
                    onValueChange={(v) =>
                      void run(
                        doUpdate({
                          data: {
                            familyId: group.id,
                            userId: m.userId,
                            role: v as "admin" | "member",
                            canEdit: m.canEdit,
                          },
                        }),
                        "Role updated",
                      )
                    }
                  >
                    <SelectTrigger className="h-9 w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={m.canEdit}
                      onCheckedChange={(v) =>
                        void run(
                          doUpdate({
                            data: {
                              familyId: group.id,
                              userId: m.userId,
                              role: m.role,
                              canEdit: v,
                            },
                          }),
                          v ? "Editing allowed" : "Editing restricted",
                        )
                      }
                    />
                    Can edit
                  </label>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    onClick={() =>
                      void run(
                        doRemove({ data: { familyId: group.id, userId: m.userId } }),
                        "Member removed",
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              ) : (
                <Badge variant="outline" className="capitalize">
                  {m.role}
                  {m.canEdit ? " · can edit" : " · listen only"}
                </Badge>
              )}
            </div>
          ))}
        </div>

        {/* Invites */}
        {isAdmin && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Invite someone</p>
            <div className="flex flex-wrap items-end gap-2">
              <Input
                placeholder="their@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-w-52 flex-1"
              />
              <Select value={role} onValueChange={(v) => setRole(v as "admin" | "member")}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={canEdit} onCheckedChange={setCanEdit} />
                Can edit
              </label>
              <Button
                onClick={() => {
                  void run(
                    doInvite({ data: { familyId: group.id, email, role, canEdit } }),
                    `Invited ${email}`,
                  ).then(() => setEmail(""));
                }}
                disabled={!email.trim()}
              >
                <UserPlus className="size-4" /> Invite
              </Button>
            </div>
            {group.invites.length > 0 && (
              <div className="space-y-1 pt-1">
                {group.invites.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center gap-2 rounded-xl bg-secondary/50 px-3 py-2 text-sm"
                  >
                    <Mail className="size-3.5 text-muted-foreground" />
                    <span className="flex-1">{inv.email}</span>
                    <Badge variant="outline" className="capitalize">
                      pending · {inv.role}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      onClick={() =>
                        void run(doCancel({ data: { inviteId: inv.id } }), "Invite cancelled")
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              They'll see this family as soon as they sign in to Yoto Control Center with that
              email.
            </p>
          </div>
        )}

        {/* Shared playlists */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Shared playlists</p>
          {group.playlists.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nothing shared yet.
            </p>
          ) : (
            <div className="space-y-1">
              {group.playlists.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-2xl border border-border/70 p-2.5"
                >
                  {p.artwork ? (
                    <img src={p.artwork} alt="" className="size-10 rounded-lg object-cover" />
                  ) : (
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                      <Music className="size-4 text-primary/60" />
                    </div>
                  )}
                  <Link
                    to="/playlists/$playlistId"
                    params={{ playlistId: p.cardId }}
                    className="flex-1 text-sm font-medium hover:underline"
                  >
                    {p.title}
                  </Link>
                  <Badge variant="outline">{p.canEdit ? "Can edit" : "Listen only"}</Badge>
                  {isAdmin && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => void run(doUnshare({ data: { id: p.id } }), "Playlist unshared")}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {isAdmin && (
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <Select value={pick} onValueChange={setPick}>
                <SelectTrigger className="min-w-52 flex-1">
                  <SelectValue placeholder="Choose a playlist to share…" />
                </SelectTrigger>
                <SelectContent>
                  {(playlistData?.playlists ?? []).map((pl) => (
                    <SelectItem key={pl.playlistId} value={pl.playlistId}>
                      {pl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={canEdit} onCheckedChange={setCanEdit} />
                Members can edit
              </label>
              <Button
                disabled={!pick}
                onClick={() => {
                  const pl = (playlistData?.playlists ?? []).find((x) => x.playlistId === pick);
                  void run(
                    doShare({
                      data: {
                        familyId: group.id,
                        cardId: pick,
                        title: pl?.name ?? "Playlist",
                        artwork: pl?.artwork ?? "",
                        canEdit,
                      },
                    }),
                    "Playlist shared with your family",
                  ).then(() => setPick(""));
                }}
              >
                <Plus className="size-4" /> Share
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------------------- Yoto family ------------------------------ */

function FamilyMemberCard({ member }: { member: any }) {
  const initials =
    `${member.firstName?.[0] ?? ""}${member.lastName?.[0] ?? ""}`.toUpperCase() || "U";
  const fullName = `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim();

  return (
    <Card className="transition-shadow hover:shadow-md">
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
          <Badge variant="outline" className="capitalize">
            <Shield className="mr-1 size-3" />
            {member.role || "Member"}
          </Badge>
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
    <Card className="group transition-all hover:border-primary/50 hover:shadow-md">
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
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {playlist.trackCount !== undefined && (
            <div className="flex items-center gap-1">
              <Disc3 className="size-3" />
              {playlist.trackCount} track{playlist.trackCount === 1 ? "" : "s"}
            </div>
          )}
          {playlist.duration ? (
            <div className="flex items-center gap-1">
              <Clock className="size-3" />
              {durationStr}
            </div>
          ) : null}
        </div>
        <Button asChild size="sm" variant="outline" className="w-full">
          <Link to="/playlists/$playlistId" params={{ playlistId: playlist.playlistId }}>
            <Music className="size-4" /> Open & download files
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyFamily() {
  return (
    <Card className="border-dashed">
      <CardContent className="p-10 text-center">
        <h3 className="text-base font-semibold">No Yoto family members yet</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Add family members in the Yoto app, or invite them to your Control Center family above.
        </p>
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
