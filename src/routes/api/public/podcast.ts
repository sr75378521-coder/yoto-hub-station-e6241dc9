import { createFileRoute } from "@tanstack/react-router";

export interface PodcastResult {
  id: number;
  title: string;
  author: string;
  artwork: string;
  feedUrl: string;
  genre: string;
  episodeCount: number;
}

export interface EpisodeResult {
  guid: string;
  title: string;
  date: string;
  duration: string;
  size: number;
  url: string;
  type: string;
  episode: number;
  season: number;
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function bad(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), { status, headers: JSON_HEADERS });
}

function safeUrl(raw: string | null): URL | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1] ?? "") : "";
}

function attr(block: string, tagName: string, name: string): string {
  const el = block.match(new RegExp(`<${tagName}\\b[^>]*>`, "i"));
  if (!el) return "";
  const m = el[0]!.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return m ? decode(m[1] ?? "") : "";
}

async function search(q: string, limit: number) {
  const url = `https://itunes.apple.com/search?media=podcast&entity=podcast&limit=${limit}&term=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "user-agent": "Batchcodec/1.0" } });
  if (!res.ok) return bad("Podcast search is unavailable right now.", 502);
  const data = (await res.json()) as { results?: any[] };
  const results: PodcastResult[] = (data.results ?? [])
    .filter((r) => r.feedUrl)
    .map((r) => ({
      id: r.collectionId,
      title: r.collectionName ?? "Untitled",
      author: r.artistName ?? "",
      artwork: r.artworkUrl600 ?? r.artworkUrl100 ?? "",
      feedUrl: r.feedUrl,
      genre: r.primaryGenreName ?? "",
      episodeCount: r.trackCount ?? 0,
    }));
  return new Response(JSON.stringify({ results }), { headers: JSON_HEADERS });
}

async function feed(feedUrl: URL) {
  const res = await fetch(feedUrl.toString(), {
    headers: { "user-agent": "Mozilla/5.0 (compatible; Batchcodec/1.0)", accept: "application/rss+xml, application/xml, text/xml, */*" },
  });
  if (!res.ok) return bad("Could not load that podcast feed.", 502);
  const xml = await res.text();
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const showTitle = decode((xml.match(/<channel[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1] ?? "Podcast");

  const episodes: EpisodeResult[] = [];
  for (const [i, block] of items.entries()) {
    const url = attr(block, "enclosure", "url");
    if (!url) continue;
    episodes.push({
      guid: tag(block, "guid") || `${i}`,
      title: tag(block, "title") || `Episode ${i + 1}`,
      date: tag(block, "pubDate"),
      duration: tag(block, "itunes:duration"),
      size: Number(attr(block, "enclosure", "length")) || 0,
      url,
      type: attr(block, "enclosure", "type") || "audio/mpeg",
      episode: Number(tag(block, "itunes:episode")) || 0,
      season: Number(tag(block, "itunes:season")) || 0,
    });
    if (episodes.length >= 500) break;
  }
  return new Response(JSON.stringify({ showTitle, episodes }), { headers: JSON_HEADERS });
}

async function media(mediaUrl: URL, request: Request) {
  const range = request.headers.get("range");
  const upstream = await fetch(mediaUrl.toString(), {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; Batchcodec/1.0)",
      ...(range ? { range } : {}),
    },
    redirect: "follow",
  });
  if (!upstream.ok && upstream.status !== 206) return bad("Could not download that episode.", 502);
  const headers = new Headers();
  for (const k of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const v = upstream.headers.get(k);
    if (v) headers.set(k, v);
  }
  headers.set("cache-control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers });
}

export const Route = createFileRoute("/api/public/podcast")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("mode");

        if (mode === "search") {
          const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
          if (!q) return bad("Type something to search for.");
          const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 24));
          return search(q, limit);
        }

        if (mode === "feed") {
          const target = safeUrl(url.searchParams.get("url"));
          if (!target) return bad("That feed address isn't valid.");
          return feed(target);
        }

        if (mode === "media") {
          const target = safeUrl(url.searchParams.get("url"));
          if (!target) return bad("That episode address isn't valid.");
          return media(target, request);
        }

        return bad("Unknown request.");
      },
    },
  },
});
