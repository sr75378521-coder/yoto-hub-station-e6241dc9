import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  checkIsAdmin,
  getAdminStats,
  listAdminUsers,
  grantAdminByEmail,
  adminDisconnectYoto,
  toggleAdminStatus,
  adminSetUserBanned,
  adminDeleteUser,
  adminSendPasswordReset,
  adminDisconnectAllYoto,
  adminPurgeStaleOAuthStates,
  getAdminHealth,
} from "@/lib/players.functions";
import {
  Loader2,
  Shield,
  ShieldAlert,
  User,
  Plug,
  Search,
  UserPlus,
  Ban,
  Trash2,
  KeyRound,
  Eraser,
  Activity,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin · Yoto Control Center" },
      { name: "description", content: "Manage users, admin access and Yoto connections." },
      { property: "og:title", content: "Admin · Yoto Control Center" },
      { property: "og:description", content: "Manage users and admin access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const queryClient = useQueryClient();
  const checkAdmin = useServerFn(checkIsAdmin);
  const fetchStats = useServerFn(getAdminStats);
  const fetchUsers = useServerFn(listAdminUsers);
  const grantByEmail = useServerFn(grantAdminByEmail);
  const disconnect = useServerFn(adminDisconnectYoto);
  const toggleAdmin = useServerFn(toggleAdminStatus);

  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [onlyAdmins, setOnlyAdmins] = useState(false);

  const { data: adminStatus, isLoading: checkingAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => checkAdmin(),
  });
  const enabled = !!adminStatus?.isAdmin;

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => fetchStats(),
    enabled,
  });

  const { data: usersData, isLoading: loadingUsers } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(),
    enabled,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  const toggleMutation = useMutation({
    mutationFn: (vars: { userId: string; isAdmin: boolean }) => toggleAdmin({ data: vars }),
    onSuccess: () => {
      refresh();
      toast.success("Permissions updated");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const grantMutation = useMutation({
    mutationFn: (v: { email: string }) => grantByEmail({ data: v }),
    onSuccess: (res) => {
      if (!res.success) return toast.error(res.error ?? "Couldn't grant access");
      setEmail("");
      refresh();
      toast.success("Admin access granted");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (v: { userId: string }) => disconnect({ data: v }),
    onSuccess: (res) => {
      if (!res.success) return toast.error(res.error ?? "Couldn't disconnect");
      refresh();
      toast.success("Yoto account disconnected");
    },
  });

  const users = useMemo(() => {
    const list = usersData?.users ?? [];
    const q = query.trim().toLowerCase();
    return list
      .filter((u) => (onlyAdmins ? u.is_admin : true))
      .filter((u) => (q ? (u.email ?? "").toLowerCase().includes(q) || u.id.includes(q) : true));
  }, [usersData, query, onlyAdmins]);

  if (checkingAdmin) {
    return (
      <AppShell title="Admin">
        <div className="flex items-center justify-center p-12">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  if (!enabled) {
    return (
      <AppShell title="Admin">
        <Card className="mx-auto max-w-md border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="size-5" /> Access denied
            </CardTitle>
            <CardDescription>You don't have administrator access to this page.</CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Admin">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <Stat label="Users" value={stats?.totalUsers} />
          <Stat label="Admins" value={stats?.admins} />
          <Stat label="Yoto connected" value={stats?.connectedYoto} />
          <Stat label="New (7 days)" value={stats?.newUsers7d} />
          <Stat label="Active (24h)" value={stats?.activeUsers24h} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Grant admin access by email</CardTitle>
            <CardDescription>
              The person must have signed in at least once before you can promote them.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button
              onClick={() => grantMutation.mutate({ email })}
              disabled={!email || grantMutation.isPending}
            >
              {grantMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
              Grant admin
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-3">
            <div>
              <CardTitle className="text-base">People</CardTitle>
              <CardDescription>
                Admins can download playlist files and manage everyone's access.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search by email"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch checked={onlyAdmins} onCheckedChange={setOnlyAdmins} /> Admins only
              </label>
            </div>
          </CardHeader>
          <CardContent>
            {loadingUsers ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading people…
              </div>
            ) : users.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No matching people.</p>
            ) : (
              <div className="divide-y divide-border">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="rounded-full bg-secondary p-2">
                        <User className="size-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{u.email ?? "Unknown"}</p>
                        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>Joined {new Date(u.created_at).toLocaleDateString()}</span>
                          <span>
                            ·{" "}
                            {u.last_sign_in_at
                              ? `Last seen ${new Date(u.last_sign_in_at).toLocaleDateString()}`
                              : "Never signed in"}
                          </span>
                          {u.yoto_connected && (
                            <Badge variant="secondary" className="text-[10px]">
                              Yoto linked
                            </Badge>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {u.yoto_connected && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => disconnectMutation.mutate({ userId: u.id })}
                          disabled={disconnectMutation.isPending}
                        >
                          <Plug className="size-4" /> Disconnect Yoto
                        </Button>
                      )}
                      <div className="flex items-center gap-2">
                        <Shield
                          className={`size-4 ${u.is_admin ? "text-primary" : "text-muted-foreground"}`}
                        />
                        <Switch
                          checked={u.is_admin}
                          onCheckedChange={(checked) =>
                            toggleMutation.mutate({ userId: u.id, isAdmin: checked })
                          }
                          disabled={toggleMutation.isPending}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value ?? "—"}</p>
      </CardContent>
    </Card>
  );
}
