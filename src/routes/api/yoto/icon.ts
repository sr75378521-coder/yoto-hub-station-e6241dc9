import { createFileRoute } from "@tanstack/react-router";
import { verifyIconTicket } from "@/lib/crypto.server";
import { getValidAccessToken } from "@/lib/yoto/tokens.server";

// Yoto serves display-icon images from several different hosts depending on
// endpoint and environment (e.g. cdn.yoto.io, media.yotoplay.com, and
// media-secure*.aws.* / *.aws.fooropa.com style CDN hosts returned directly
// by the displayIcons API). The old, narrower list rejected most real icon
// URLs Yoto actually returns, which is why thumbnails were rendering broken.
const ALLOWED_HOST_SUFFIXES = [
  "yotoplay.com",
  "yoto.io",
  "cloudfront.net",
  "amazonaws.com",
  "aws.com",
  "fooropa.com",
  "cloudfront-net.com",
];

function isAllowedIconHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (ALLOWED_HOST_SUFFIXES.some((h) => host === h || host.endsWith(`.${h}`))) {
    return true;
  }
  // Belt-and-suspenders: any host with "yoto" in it (e.g. new/renamed CDN
  // subdomains) is safe to proxy — it's not an arbitrary open proxy since we
  // still require https and reject everything else below.
  return /(^|\.)yoto[a-z0-9-]*\./.test(host) || host.includes("yoto");
}

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

        // The <img> tag that requests this route can't send cookies or a
        // custom Authorization header, so we can't know which user is asking
        // via normal means. The ticket (minted server-side, alongside the
        // icon list, by a request that *was* authenticated) tells us.
        const ticketParam = params.get("t");
        const ticket = ticketParam ? verifyIconTicket(ticketParam) : null;

        const id = raw.startsWith("yoto:#") ? raw.slice(6) : raw;
        const candidates = /^https?:\/\//.test(id)
          ? [id]
          : [
              `https://cdn.yoto.io/icons/${encodeURIComponent(id)}`,
              `https://cdn.yoto.io/myo-icon/${encodeURIComponent(id)}.png`,
              `https://media.yotoplay.com/icons/${encodeURIComponent(id)}`,
            ];

        // Lazily resolved — only hit the token store if a candidate actually
        // needs a retry with auth.
        let bearerToken: string | null | undefined;
        const getBearerToken = async (): Promise<string | null> => {
          if (bearerToken !== undefined) return bearerToken;
          bearerToken = ticket ? await getValidAccessToken(ticket.userId) : null;
          return bearerToken;
        };

        for (const candidate of candidates) {
          let url: URL;
          try {
            url = new URL(candidate);
          } catch {
            continue;
          }
          if (url.protocol !== "https:" || !isAllowedIconHost(url.hostname)) {
            continue;
          }

          // Try un-authenticated first (works for public/presigned URLs, and
          // avoids sending credentials somewhere that doesn't expect them).
          // If that's rejected and we have a valid ticket, retry the same
          // URL with the user's Yoto Bearer token — the icon media host
          // turned out to require it, same as every other Yoto API call.
          for (const withAuth of [false, true]) {
            if (withAuth && !ticket) break;
            try {
              const headers: HeadersInit = {};
              if (withAuth) {
                const token = await getBearerToken();
                if (!token) break;
                headers["Authorization"] = `Bearer ${token}`;
              }
              const res = await fetch(url.toString(), { redirect: "follow", headers });
              if (!res.ok) continue;
              const out = new Headers();
              out.set("content-type", res.headers.get("content-type") ?? "image/png");
              // Auth-gated responses are per-user — don't let shared/edge
              // caches store them; anonymous ones are safe to cache.
              out.set("cache-control", withAuth ? "private, max-age=86400" : "public, max-age=86400");
              return new Response(res.body, { status: 200, headers: out });
            } catch {
              continue;
            }
          }
        }

        return new Response("icon not found", { status: 404 });
      },
    },
  },
});
