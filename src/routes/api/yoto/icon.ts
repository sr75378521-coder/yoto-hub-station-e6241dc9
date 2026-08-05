import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_HOST_SUFFIXES = ["yotoplay.com", "yoto.io", "cloudfront.net", "amazonaws.com"];

/**
 * Proxies Yoto display icons through our own origin. Yoto serves icons from a
 * few different hosts/paths depending on whether they are stock or user
 * uploads, so we try the known candidates and stream back the first hit.
 */
export const Route = createFileRoute("/api/yoto/icon")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        const raw = params.get("id");
        if (!raw) return new Response("missing id", { status: 400 });

        const id = raw.startsWith("yoto:#") ? raw.slice(6) : raw;
        const candidates = /^https?:\/\//.test(id)
          ? [id]
          : [
              `https://cdn.yoto.io/icons/${encodeURIComponent(id)}`,
              `https://cdn.yoto.io/myo-icon/${encodeURIComponent(id)}.png`,
              `https://media.yotoplay.com/icons/${encodeURIComponent(id)}`,
            ];

        for (const candidate of candidates) {
          let url: URL;
          try {
            url = new URL(candidate);
          } catch {
            continue;
          }
          if (
            url.protocol !== "https:" ||
            !ALLOWED_HOST_SUFFIXES.some(
              (h) => url.hostname === h || url.hostname.endsWith(`.${h}`),
            )
          ) {
            continue;
          }
          try {
            const res = await fetch(url.toString(), { redirect: "follow" });
            if (!res.ok) continue;
            const out = new Headers();
            out.set("content-type", res.headers.get("content-type") ?? "image/png");
            out.set("cache-control", "public, max-age=86400");
            return new Response(res.body, { status: 200, headers: out });
          } catch {
            continue;
          }
        }

        return new Response("icon not found", { status: 404 });
      },
    },
  },
});
