import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { TermsGate } from "@/components/app/TermsGate";
import { trackPageVisit } from "@/lib/analytics.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  return (
    <TermsGate>
      <PageVisitTracker userId={user.id} />
      <Outlet />
    </TermsGate>
  );
}

function PageVisitTracker({ userId }: { userId: string }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const recordVisit = useServerFn(trackPageVisit);

  useEffect(() => {
    // Do not store query strings, which may contain tokens or other sensitive values.
    void recordVisit({ data: { pagePath: pathname } }).catch((error: unknown) => {
      console.error("Could not record analytics page visit", error);
    });
  }, [pathname, recordVisit, userId]);

  return null;
}
