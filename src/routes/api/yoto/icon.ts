import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_HOST_SUFFIXES = ["yotoplay.com", "yoto.io", "cloudfront.net", "amazonaws.com"];

/**
 * Proxies Yoto display icons through our own origin. Yoto's media host can
 * reject hot-linked requests, which made saved icons render as broken images
 * inside the playlist editor.
 */
export const Route = createFileRoute("/api/yoto/icon")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        const raw = params.get("id");
        if (!raw) return new Response("missing id", { status: 400 });

        const id = raw.startsWith("yoto:#") ? raw.slice(6) : raw;
        let upstream: URL;
        try {
          upstream = /^https?:\/\//.test(id)
            ? new URL(id)
            : new URL(`https://media-secure.yotoplay.com/icons/${encodeURIComponent(id)}`);
        } catch {
          return new Response("bad id", { status: 400 });
        }
        if (
          upstream.protocol !== "https:" ||
          !ALLOWED_HOST_SUFFIXES.some(
            (h) => upstream.hostname === h || upstream.hostname.endsWith(`.${h}`),
          )
        ) {
          return new Response("host not allowed", { status: 400 });
        }

        let res: Response;
        try {
          res = await fetch(upstream.toString(), { redirect: "follow" });
        } catch {
          return new Response("upstream error", { status: 502 });
        }
        if (!res.ok) return new Response("not found", { status: 404 });
        const out = new Headers();
        out.set("content-type", res.headers.get("content-type") ?? "image/png");
        out.set("cache-control", "public, max-age=86400");
        return new Response(res.body, { status: 200, headers: out });

      },
    },
  },
});
