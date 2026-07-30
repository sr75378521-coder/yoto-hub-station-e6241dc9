import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export async function startYotoOAuth() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in again");
  window.location.href = `/api/yoto/authorize?access_token=${encodeURIComponent(token)}`;
}

export function ReconnectYotoButton({ label = "Reconnect Yoto" }: { label?: string }) {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="sm"
      onClick={async () => {
        setLoading(true);
        try {
          await startYotoOAuth();
        } catch (e) {
          setLoading(false);
          toast.error(e instanceof Error ? e.message : "Failed to start OAuth");
        }
      }}
      disabled={loading}
    >
      <RefreshCw className="size-4" /> {loading ? "Redirecting…" : label}
    </Button>
  );
}
