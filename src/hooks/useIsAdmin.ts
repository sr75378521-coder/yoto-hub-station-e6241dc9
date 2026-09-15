import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { checkIsAdmin } from "@/lib/players.functions";

/**
 * Returns whether the signed-in user is an admin.
 * Only calls the server once a session exists, so signed-out pages
 * (e.g. /auth) never hit the protected server function.
 */
export function useIsAdmin(): boolean {
  const checkAdmin = useServerFn(checkIsAdmin);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setHasSession(!!session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const { data } = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => checkAdmin(),
    enabled: hasSession,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return !!data?.isAdmin;
}
