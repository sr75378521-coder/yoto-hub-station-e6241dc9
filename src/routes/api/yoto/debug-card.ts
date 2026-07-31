import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { yotoGetJson } from "@/lib/yoto/api.server";

export const Route = createFileRoute("/api/yoto/debug-card")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        const path = url.searchParams.get("path");
        const token = request.headers.get("authorization")?.replace("Bearer ", "");
        if (!token) return new Response("no token", { status: 401 });
        const sb = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false } },
        );
        const { data: u } = await sb.auth.getUser(token);
        if (!u?.user) return new Response("bad token", { status: 401 });
        try {
          const res = await yotoGetJson<unknown>(u.user.id, path ?? `/content/${id}`);
          return Response.json(res);
        } catch (e) {
          return Response.json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
