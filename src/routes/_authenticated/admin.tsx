import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { listProfiles, toggleAdminStatus, checkIsAdmin } from "@/lib/players.functions";
import { Loader2, Shield, User, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    // Basic client-side check if possible, but the server function will enforce it
  },
  component: AdminPage,
});

function AdminPage() {
  const queryClient = useQueryClient();
  const fetchProfiles = useServerFn(listProfiles);
  const checkAdmin = useServerFn(checkIsAdmin);
  const toggleAdmin = useServerFn(toggleAdminStatus);

  const { data: adminStatus, isLoading: checkingAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => checkAdmin(),
  });

  const { data: profilesData, isLoading: loadingProfiles } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: () => fetchProfiles(),
    enabled: !!adminStatus?.isAdmin,
  });

  const toggleMutation = useMutation({
    mutationFn: (vars: { userId: string; isAdmin: boolean }) => toggleAdmin({ data: vars }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      toast.success("Permissions updated");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update permissions");
    },
  });

  if (checkingAdmin) {
    return (
      <AppShell title="Admin">
        <div className="flex items-center justify-center p-12">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  if (!adminStatus?.isAdmin) {
    return (
      <AppShell title="Admin">
        <Card className="mx-auto max-w-md border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="size-5" />
              Access Denied
            </CardTitle>
            <CardDescription>
              You do not have administrative privileges to access this page.
            </CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  const profiles = profilesData?.profiles || [];

  return (
    <AppShell title="User Management">
      <div className="mx-auto max-w-4xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Global Administrators</CardTitle>
            <CardDescription>
              Manage users who can download audio and access administrative tools.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingProfiles ? (
              <div className="flex items-center gap-2 py-4">
                <Loader2 className="size-4 animate-spin" /> Loading users...
              </div>
            ) : (
              <div className="divide-y divide-border">
                {profiles.map((profile: any) => (
                  <div key={profile.id} className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-secondary p-2">
                        <User className="size-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">{profile.email || "Unknown User"}</p>
                        <p className="text-xs text-muted-foreground font-mono">{profile.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Shield className={`size-4 ${profile.is_admin ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="text-sm font-medium">Admin</span>
                      </div>
                      <Switch
                        checked={profile.is_admin}
                        onCheckedChange={(checked) =>
                          toggleMutation.mutate({ userId: profile.id, isAdmin: checked })
                        }
                        disabled={toggleMutation.isPending}
                      />
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
