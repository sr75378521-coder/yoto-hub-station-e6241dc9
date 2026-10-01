import { zipSync } from "fflate";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").trim() || "file";

async function fetchBytes(url: string): Promise<Uint8Array> {
  try {
    const r = await fetch(url);
    if (r.ok) return new Uint8Array(await r.arrayBuffer());
  } catch {
    /* fall through to proxy */
  }
  const r = await fetch(`/api/public/podcast?mode=media&url=${encodeURIComponent(url)}`);
  if (!r.ok) throw new Error("Could not download a file");
  return new Uint8Array(await r.arrayBuffer());
}

/** Download a list of tracks and save them as one ZIP file. */
export async function downloadTracksAsZip(
  zipName: string,
  tracks: { url: string; title: string }[],
  onProgress?: (done: number, total: number) => void,
) {
  const files: Record<string, Uint8Array> = {};
  let done = 0;
  await Promise.all(
    tracks.map(async (t, i) => {
      const bytes = await fetchBytes(t.url);
      files[`${String(i + 1).padStart(2, "0")} ${safeName(t.title)}.mp3`] = bytes;
      onProgress?.(++done, tracks.length);
    }),
  );
  const zipped = zipSync(files, { level: 0 });
  downloadBlob(new Blob([zipped as BlobPart], { type: "application/zip" }), `${safeName(zipName)}.zip`);
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Build and download an RSS (podcast) feed file for a playlist. */
export function downloadPlaylistRss(
  title: string,
  tracks: { url: string; title: string; duration?: number }[],
  opts: { description?: string; cover?: string; author?: string } = {},
) {
  const now = Date.now();
  const items = tracks
    .map(
      (t, i) => `    <item>
      <title>${esc(t.title)}</title>
      <guid isPermaLink="false">${i + 1}-${esc(t.url)}</guid>
      <pubDate>${new Date(now - (tracks.length - i) * 60000).toUTCString()}</pubDate>
      <enclosure url="${esc(t.url)}" type="audio/mpeg" length="0"/>
      <itunes:episode>${i + 1}</itunes:episode>${t.duration ? `\n      <itunes:duration>${Math.round(t.duration)}</itunes:duration>` : ""}
    </item>`,
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>${esc(title)}</title>
    <description>${esc(opts.description ?? title)}</description>
    <itunes:author>${esc(opts.author ?? "Yoto Control Center")}</itunes:author>${opts.cover ? `\n    <itunes:image href="${esc(opts.cover)}"/>` : ""}
${items}
  </channel>
</rss>`;
  downloadBlob(new Blob([xml], { type: "application/rss+xml" }), `${safeName(title)}.rss.xml`);
}
