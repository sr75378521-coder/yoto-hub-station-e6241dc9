import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_HOST_SUFFIXES = ["yotoplay.com", "yoto.io", "cloudfront.net", "amazonaws.com"];

/**
 * Streams Yoto audio through our own origin so the browser <audio> element can
 * play signed media URLs without cross-origin / redirect issues. Range headers
 * are passed through so seeking works.
 */
export const Route = createFileRoute("/api/yoto/audio")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const target = new URL(request.url).searchParams.get("u");
        if (!target) return new Response("missing u", { status: 400 });

        let upstream: URL;
        try {
          upstream = new URL(target);
        } catch {
          return new Response("bad url", { status: 400 });
        }
        if (
          upstream.protocol !== "https:" ||
          !ALLOWED_HOST_SUFFIXES.some(
            (h) => upstream.hostname === h || upstream.hostname.endsWith(`.${h}`),
          )
        ) {
          return new Response("host not allowed", { status: 400 });
        }

        const headers = new Headers();
        const range = request.headers.get("range");
        if (range) headers.set("Range", range);

        const res = await fetch(upstream.toString(), { headers, redirect: "follow" });
        const out = new Headers();
        for (const k of [
          "content-type",
          "content-length",
          "content-range",
          "accept-ranges",
          "etag",
          "last-modified",
        ]) {
          const v = res.headers.get(k);
          if (v) out.set(k, v);
        }
        if (!out.has("content-type")) out.set("content-type", "audio/mpeg");
        if (!out.has("accept-ranges")) out.set("accept-ranges", "bytes");
        out.set("cache-control", "private, max-age=3600");

        return new Response(res.body, { status: res.status, headers: out });
      },
    },
  },
});
