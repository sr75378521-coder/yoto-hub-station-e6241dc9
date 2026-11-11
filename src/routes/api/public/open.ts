import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// 1x1 transparent GIF (43 bytes)
const TRANSPARENT_GIF = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0),
);

const tokenSchema = z.string().regex(/^[a-f0-9]{24,64}$/);

export const Route = createFileRoute("/api/public/open")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const rawToken = url.searchParams.get("t") ?? "";
        const parsed = tokenSchema.safeParse(rawToken);

        if (parsed.success) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin.rpc("record_email_open", { _token: parsed.data });
          } catch (err) {
            console.error("[OpenPixel] Failed to record open:", err);
          }
        }

        return new Response(TRANSPARENT_GIF, {
          status: 200,
          headers: {
            "Content-Type": "image/gif",
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
            Pragma: "no-cache",
            Expires: "0",
          },
        });
      },
    },
  },
});
