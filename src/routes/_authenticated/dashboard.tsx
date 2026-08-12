import { useEffect } from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { PlayerCard } from "@/components/app/PlayerCard";
import { ConnectYotoCard } from "@/components/app/ConnectYotoCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDashboardData, disconnectYoto } from "@/lib/players.functions";
import { useYotoRealtime } from "@/hooks/useYotoRealtime";
import { RefreshCw, Unplug, Radio, RadioTower } from "lucide-react";

const dashboardQuery = (fn: () => Promise<import("@/lib/players.functions").DashboardData>) =>
  queryOptions({
    queryKey: ["dashboard"],
    queryFn: () => fn(),
    refetchInterval: 30_000,
  });

const searchSchema = z.object({
  yoto: z.enum(["connected"]).optional(),
  yoto_error: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Players · Yoto Control Center" },
      {
        name: "description",
        content: "See and control every Yoto player linked to your account.",
      },
      { property: "og:title", content: "Yoto Control Center" },
      {
        property: "og:description",
        content: "A modern dashboard for every Yoto player, playlist and MYO card.",
      },
    ],
  }),
  validateSearch: searchSchema,
  component: DashboardPage,
  errorComponent: ({ error, reset }) => (
    <div className="p-8">
      <h2 className="text-lg font-semibold">Couldn't load players</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <Button onClick={reset} className="mt-4">
        Try again
      </Button>
    </div>
  ),
});

function DashboardPage() {
  const fetchDashboard = useServerFn(getDashboardData);
  const disconnectFn = useServerFn(disconnectYoto);
  const search = useSearch({ from: "/_authenticated/dashboard" });
  const queryClient = useQueryClient();

  const { data, isFetching, refetch } = useSuspenseQuery(dashboardQuery(fetchDashboard));

  useEffect(() => {
    if (search.yoto === "connected") toast.success("Yoto account connected");
    if (search.yoto_error) toast.error(`Yoto: ${search.yoto_error}`);
  }, [search.yoto, search.yoto_error]);

  const disconnect = useMutation({
    mutationFn: () => disconnectFn(),
    onSuccess: () => {
      toast.success("Disconnected");
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const deviceIds = data.players.map((p) => p.deviceId);
  const { status: realtimeStatus } = useYotoRealtime({
    enabled: data.connected && deviceIds.length > 0,
    deviceIds,
  });


  return (
    <AppShell title="Players">
      <div className="mx-auto max-w-6xl space-y-8">
        {!data.connected ? (
          <ConnectYotoCard />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  {data.players.length} player{data.players.length === 1 ? "" : "s"}
                </h2>
                <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <RealtimeBadge status={realtimeStatus} />
                  {realtimeStatus === "mqtt"
                    ? "Streaming live updates over MQTT."
                    : "Connecting to your players…"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                  <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => disconnect.mutate()}
                  disabled={disconnect.isPending}
                >
                  <Unplug className="size-4" />
                  Disconnect
                </Button>
              </div>
            </div>

            {data.errorMessage ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                {data.errorMessage}
              </div>
            ) : null}

            {data.players.length === 0 ? (
              <EmptyPlayers />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.players.map((p) => (
                  <PlayerCard key={p.deviceId} player={p} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function RealtimeBadge({ status }: { status: "connecting" | "mqtt" | "offline" }) {
  const map = {
    mqtt: { label: "Live", variant: "default" as const, icon: RadioTower },
    connecting: { label: "Connecting", variant: "secondary" as const, icon: Radio },
    offline: { label: "Offline", variant: "outline" as const, icon: Radio },
  };
  const { label, variant, icon: Icon } = map[status];
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}

function EmptyPlayers() {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 p-10 text-center">
      <h3 className="text-base font-semibold">No players yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        We couldn't find any Yoto players on your account. Once one appears here you'll be able to
        control it.
      </p>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-48 rounded-xl" />
      ))}
    </div>
  );
}
