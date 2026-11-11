import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Activity, Loader2, RotateCcw, ShieldAlert, TrendingUp, Users } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { checkIsAdmin } from "@/lib/players.functions";
import { getAdminPageVisits } from "@/lib/analytics.functions";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics · Yoto Control Center" }] }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const checkAdmin = useServerFn(checkIsAdmin);
  const getVisits = useServerFn(getAdminPageVisits);
  const { data: adminStatus, isLoading: checkingAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => checkAdmin(),
  });
  const isAdmin = !!adminStatus?.isAdmin;
  const visits = useQuery({
    queryKey: ["admin-page-visits"],
    queryFn: () => getVisits(),
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  if (checkingAdmin) {
    return (
      <AppShell title="Analytics">
        <div className="flex justify-center p-12"><Loader2 className="size-7 animate-spin text-primary" /></div>
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell title="Analytics">
        <Card className="mx-auto max-w-md border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive"><ShieldAlert className="size-5" /> Access denied</CardTitle>
            <CardDescription>You don't have administrator access to this page.</CardDescription>
          </CardHeader>
        </Card>
      </AppShell>
    );
  }

  const stats = visits.data?.stats;
  const visitRows = visits.data?.visits ?? [];

  return (
    <AppShell title="Analytics">
      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold"><Activity className="size-5 text-primary" /> Page visits</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed-in user activity over the last 30 days. Available to admins only.
          </p>
        </div>

        {visits.error && !visits.data ? (
          <Card><CardContent className="py-6">
            <p role="alert" className="text-sm text-destructive">Could not load analytics. Please try again.</p>
          </CardContent></Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Most visited pages</CardTitle>
                  <TrendingUp className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {stats?.popularPages.length ? (
                    <ol className="space-y-2">
                      {stats.popularPages.map((page) => (
                        <li key={page.pagePath} className="flex items-center justify-between gap-3 text-sm">
                          <span className="truncate font-mono text-xs" title={page.pagePath}>{page.pagePath}</span>
                          <span className="shrink-0 text-muted-foreground">{page.visits} visits</span>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="text-sm text-muted-foreground">No visits yet.</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Most active users</CardTitle>
                  <Users className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {stats?.activeUsers.length ? (
                    <ol className="space-y-2">
                      {stats.activeUsers.map((user) => (
                        <li key={user.userId} className="flex items-center justify-between gap-3 text-sm">
                          <span className="truncate">{user.email ?? "Account unavailable"}</span>
                          <span className="shrink-0 text-muted-foreground">{user.visits} visits</span>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="text-sm text-muted-foreground">No user activity yet.</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Returning users</CardTitle>
                  <RotateCcw className="size-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{stats?.returningUsers.length ?? 0}</p>
                  <CardDescription className="mt-1">Users with 2+ recorded visits</CardDescription>
                  {stats?.returningUsers.length ? (
                    <ol className="mt-3 space-y-2">
                      {stats.returningUsers.map((user) => (
                        <li key={user.userId} className="flex items-center justify-between gap-3 text-sm">
                          <span className="truncate">{user.email ?? "Account unavailable"}</span>
                          <span className="shrink-0 text-muted-foreground">{user.visits}</span>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="mt-3 text-sm text-muted-foreground">No repeat visits yet.</p>}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent visits</CardTitle>
                <CardDescription>
                  {stats?.totalVisits ?? 0} visits shown from the last 30 days (up to 1,000).
                  {visits.isFetching && !visits.isLoading ? " Updating…" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {visits.isLoading ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading visits…</div>
                ) : visits.error ? (
                  <p role="alert" className="py-4 text-sm text-destructive">Could not refresh page visits. Showing the last loaded data.</p>
                ) : visitRows.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">No page visits recorded in the last 30 days.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead><tr className="border-b text-muted-foreground"><th className="px-3 py-2 font-medium">User</th><th className="px-3 py-2 font-medium">Page</th><th className="px-3 py-2 font-medium">Visited</th></tr></thead>
                      <tbody>
                        {visitRows.map((visit) => (
                          <tr key={visit.id} className="border-b last:border-0">
                            <td className="px-3 py-3">{visit.email ?? "Account unavailable"}</td>
                            <td className="px-3 py-3 font-mono text-xs">{visit.page_path}</td>
                            <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{new Date(visit.visited_at).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
