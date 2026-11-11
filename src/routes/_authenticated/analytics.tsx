import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Activity, Loader2, ShieldAlert } from "lucide-react";
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

  return (
    <AppShell title="Analytics">
      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold"><Activity className="size-5 text-primary" /> Page visits</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed-in users and the pages they visited in the last 30 days. Available to admins only.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent visits</CardTitle>
            <CardDescription>{visits.data?.visits.length ?? 0} visits shown (up to 1,000).</CardDescription>
          </CardHeader>
          <CardContent>
            {visits.isLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading visits…</div>
            ) : visits.error ? (
              <p role="alert" className="py-4 text-sm text-destructive">Could not load page visits. Please try again.</p>
            ) : (visits.data?.visits.length ?? 0) === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No page visits recorded in the last 30 days.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b text-muted-foreground"><th className="px-3 py-2 font-medium">User</th><th className="px-3 py-2 font-medium">Page</th><th className="px-3 py-2 font-medium">Visited</th></tr></thead>
                  <tbody>
                    {visits.data?.visits.map((visit) => (
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
      </div>
    </AppShell>
  );
}
