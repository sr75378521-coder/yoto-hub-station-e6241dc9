import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckSquare, ChevronDown, Download, Loader2, Mic, Search, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBytes } from "@/lib/download";
import type { EpisodeResult, PodcastResult } from "@/routes/api/public/podcast";
import { cn } from "@/lib/utils";
import { downloadBlob } from "@/lib/download";
import { Zip, ZipPassThrough } from "fflate";

const API = "/api/public/podcast";
const mediaUrl = (u: string) => `${API}?mode=media&url=${encodeURIComponent(u)}`;

async function searchPodcasts(q: string, limit: number): Promise<PodcastResult[]> {
  const url = `https://itunes.apple.com/search?media=podcast&entity=podcast&limit=${limit}&term=${encodeURIComponent(q)}`;
  let data: { results?: any[] } | null = null;
  try {
    const res = await fetch(url);
    if (res.ok) data = await res.json();
  } catch { /* fall back to server */ }
  if (!data) {
    const res = await fetch(`${API}?mode=search&q=${encodeURIComponent(q)}&limit=${limit}`);
    const d = (await res.json()) as { results?: PodcastResult[]; error?: string };
    if (d.error) throw new Error(d.error);
    return d.results ?? [];
  }
  return (data.results ?? []).filter((r) => r.feedUrl).map((r) => ({
    id: r.collectionId,
    title: r.collectionName ?? "Untitled",
    author: r.artistName ?? "",
    artwork: r.artworkUrl600 ?? r.artworkUrl100 ?? "",
    feedUrl: r.feedUrl,
    genre: r.primaryGenreName ?? "",
    episodeCount: r.trackCount ?? 0,
  }));
}

type DlState = { status: "pending" | "downloading" | "done" | "error"; progress: number; error?: string | undefined };

function prettyDuration(raw: string): string {
  if (!raw) return "";
  if (raw.includes(":")) return raw;
  const total = Number(raw);
  if (!Number.isFinite(total) || total <= 0) return "";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function safeName(title: string, url: string): string {
  const extMatch = url.split("?")[0]?.match(/\.(mp3|m4a|aac|ogg|opus|wav|flac|mp4|m4v)$/i);
  const ext = extMatch ? extMatch[0] : ".mp3";
  const base = title.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "episode";
  return `${base}${ext}`;
}

const SUGGESTED = [
  "Real Survival Stories Noiser",
  "MrBallen's Strange, Dark & Mysterious Stories",
  "Darknet Diaries",
  "Wow in the World",
  "Brains On!",
  "Who Smarted?",
  "Yoto",
];

function matchEpisode(ep: EpisodeResult, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  const num = t.match(/^(?:(?:ep(?:isode)?|no|number)\.?\s*#?\s*|#)?(\d+)$/);
  if (num) {
    const n = Number(num[1]);
    if (ep.episode === n) return true;
    const title = ep.title.toLowerCase();
    return new RegExp(`(?:^|[^\\d])0*${n}(?:[^\\d]|$)`).test(title);
  }
  const title = ep.title.toLowerCase();
  return t.split(/\s+/).every((w) => title.includes(w) || (/^\d+$/.test(w) && ep.episode === Number(w)));
}

export function PodcastImport({ onImport, disabled, alwaysOpen }: { onImport: (files: File[]) => void; disabled?: boolean | undefined; alwaysOpen?: boolean | undefined }) {
  const [openState, setOpen] = useState(false);
  const open = alwaysOpen || openState;
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<PodcastResult[]>([]);
  const [show, setShow] = useState<PodcastResult | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeResult[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [states, setStates] = useState<Record<string, DlState>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const [featured, setFeatured] = useState<PodcastResult[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const lists = await Promise.all(
        SUGGESTED.map(async (term) => {
          try {
            const isYoto = term === "Yoto";
            const r = await searchPodcasts(term, isYoto ? 30 : 3);
            const hidden = (p: PodcastResult) => /paulo\s*e\s*100/i.test(p.title) || /podcast\s*yotos?/i.test(p.title);
            return isYoto ? r.filter((p) => (/yoto/i.test(p.author) || /yoto/i.test(p.title)) && !hidden(p)) : r.slice(0, 1).filter((p) => !hidden(p));
          } catch {
            return [];
          }
        }),
      );
      const seen = new Set<number>();
      const flat = lists.flat().filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
      if (alive) setFeatured(flat);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const openShow = useCallback(async (p: PodcastResult) => {
    setShow(p);
    setEpisodes([]);
    setSelected(new Set());
    setStates({});
    setFilter("");
    setLoadingFeed(true);
    setError(null);
    try {
      const res = await fetch(`${API}?mode=feed&url=${encodeURIComponent(p.feedUrl)}`);
      const data = (await res.json()) as { episodes?: EpisodeResult[]; error?: string };
      if (data.error) throw new Error(data.error);
      setEpisodes(data.episodes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load episodes");
    } finally {
      setLoadingFeed(false);
    }
  }, []);

  const runSearch = useCallback(
    async (term: string) => {
      const t = term.trim();
      if (!t) return;
      if (/^https?:\/\//i.test(t)) {
        setResults([]);
        await openShow({ id: 0, title: "Custom feed", author: t, artwork: "", feedUrl: t, genre: "", episodeCount: 0 });
        return;
      }
      setSearching(true);
      setError(null);
      try {
        setResults(await searchPodcasts(t, 30));
        setShow(null);
        setEpisodes([]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        setSearching(false);
      }
    },
    [openShow],
  );

  const toggle = (guid: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(guid)) next.delete(guid);
      else next.add(guid);
      return next;
    });

  const visible = useMemo(() => episodes.filter((e) => matchEpisode(e, filter)), [episodes, filter]);
  const allSelected = visible.length > 0 && visible.every((e) => selected.has(e.guid));
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const e of visible) allSelected ? next.delete(e.guid) : next.add(e.guid);
      return next;
    });
  const chosen = useMemo(() => episodes.filter((e) => selected.has(e.guid)), [episodes, selected]);

  const fetchEpisode = async (ep: EpisodeResult): Promise<Blob> => {
    // Try the podcast host directly (fastest); fall back to our relay if the host blocks it.
    let res: Response | null = null;
    try {
      const r = await fetch(ep.url, { mode: "cors" });
      if (r.ok) res = r;
    } catch { /* blocked, use relay */ }
    if (!res) res = await fetch(mediaUrl(ep.url));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const total = Number(res.headers.get("content-length")) || ep.size || 0;
    if (!res.body) return res.blob();
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    let last = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        const now = performance.now();
        if (total && now - last > 150) {
          last = now;
          setStates((s) => ({ ...s, [ep.guid]: { status: "downloading", progress: Math.min(1, received / total) } }));
        }
      }
    }
    return new Blob(chunks as BlobPart[], { type: ep.type || "audio/mpeg" });
  };

  const importSelected = async (mode: "queue" | "download" = "queue") => {
    if (!chosen.length) return;
    const used = new Set<string>();
    const names = chosen.map((ep) => {
      const name = safeName(ep.title, ep.url);
      let n = name;
      const dot = name.lastIndexOf(".");
      for (let k = 2; used.has(n); k++) n = `${name.slice(0, dot)} (${k})${name.slice(dot)}`;
      used.add(n);
      return n;
    });
    const show_ = (show?.title ?? "podcast").replace(/[\\/:*?"<>|]+/g, "-");
    const zipName = `${show_} (${chosen.length} episode${chosen.length === 1 ? "" : "s"}).zip`;

    // Stream the ZIP straight to disk when the browser supports it (handles huge batches
    // without running out of memory); otherwise collect it in memory.
    let writable: { write: (d: Uint8Array) => Promise<void>; close: () => Promise<void> } | null = null;
    if (mode === "download" && "showSaveFilePicker" in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({ suggestedName: zipName, types: [{ description: "ZIP", accept: { "application/zip": [".zip"] } }] });
        writable = await handle.createWritable();
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    const parts: Uint8Array[] = [];
    let writeChain = Promise.resolve();
    let zipDone!: () => void;
    const zipFinished = new Promise<void>((r) => (zipDone = r));
    const zipper = new Zip((err, chunk, final) => {
      if (err) return;
      if (writable) { const w = writable; writeChain = writeChain.then(() => w.write(chunk)); }
      else parts.push(chunk);
      if (final) zipDone();
    });
    let added = 0;

    cancelRef.current = false;
    setRunning(true);
    setStates(Object.fromEntries(chosen.map((e) => [e.guid, { status: "pending", progress: 0 } as DlState])));
    let next = 0;
    const worker = async () => {
      while (!cancelRef.current && next < chosen.length) {
        const i = next++;
        const ep = chosen[i]!;
        setStates((s) => ({ ...s, [ep.guid]: { status: "downloading", progress: 0 } }));
        try {
          const blob = await fetchEpisode(ep);
          if (mode === "queue") onImport([new File([blob], names[i]!, { type: blob.type || "audio/mpeg" })]);
          else {
            const entry = new ZipPassThrough(names[i]!);
            zipper.add(entry);
            entry.push(new Uint8Array(await blob.arrayBuffer()), true);
            added++;
          }
          setStates((s) => ({ ...s, [ep.guid]: { status: "done", progress: 1 } }));
        } catch (e) {
          setStates((s) => ({ ...s, [ep.guid]: { status: "error", progress: 0, error: e instanceof Error ? e.message : "failed" } }));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(12, chosen.length) }, worker));
    if (mode === "download") {
      zipper.end();
      await zipFinished;
      if (writable) {
        await writeChain;
        await writable.close();
      } else if (added) {
        downloadBlob(new Blob(parts as BlobPart[], { type: "application/zip" }), zipName);
      }
    }
    setRunning(false);
  };

  const doneCount = Object.values(states).filter((s) => s.status === "done").length;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {!alwaysOpen && <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-secondary/50"
      >
        <span className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider">
          <Mic className="h-4 w-4 text-primary" /> Add podcast episodes
        </span>
        <span className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          type any show · download or convert in bulk
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </span>
      </button>}

      {open && (
        <div className={cn(!alwaysOpen && "border-t border-border")}>
          <div className="p-4">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                runSearch(query);
              }}
            >
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type any podcast name…"
                className="h-10"
              />
              <Button type="submit" disabled={searching || !query.trim()}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search
              </Button>
            </form>
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
            {results.length === 0 && !show && (
              <div className="mt-4">
                <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Suggested shows</p>
                {featured.length === 0 ? (
                  <div className="flex items-center gap-2 py-6 font-mono text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> loading suggestions…
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                    {featured.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => openShow(p)}
                        className="group overflow-hidden rounded-xl border border-border bg-background/40 text-left transition-all hover:border-primary/60 hover:shadow-glow"
                      >
                        {p.artwork ? (
                          <img src={p.artwork} alt={p.title} loading="lazy" className="aspect-square w-full object-cover transition-transform group-hover:scale-105" />
                        ) : (
                          <div className="flex aspect-square w-full items-center justify-center bg-secondary"><Mic className="h-6 w-6 text-muted-foreground" /></div>
                        )}
                        <div className="p-2">
                          <p className="line-clamp-2 text-xs font-medium leading-snug">{p.title}</p>
                          <p className="truncate font-mono text-[10px] text-muted-foreground">{p.author}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {(results.length > 0 || show) && (
              <button type="button" onClick={() => { setResults([]); setShow(null); setEpisodes([]); setQuery(""); }} className="mt-3 font-mono text-[11px] text-muted-foreground hover:text-primary">
                ← back to suggested shows
              </button>
            )}
          </div>

          {results.length > 0 && (
            <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openShow(p)}
                  className={cn(
                    "flex gap-3 rounded-xl border bg-background/40 p-3 text-left transition-all hover:border-primary/60",
                    show?.id === p.id ? "border-primary shadow-glow" : "border-border",
                  )}
                >
                  {p.artwork && <img src={p.artwork} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.title}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">{p.author}</p>
                    <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                      {p.genre}
                      {p.episodeCount ? ` · ${p.episodeCount} eps` : ""}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {show && (
            <div className="border-t border-border">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3">
                  {show.artwork && <img src={show.artwork} alt="" className="h-9 w-9 rounded-md object-cover" />}
                  <div>
                    <p className="text-sm font-medium">{show.title}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {loadingFeed ? "loading episodes…" : `${episodes.length} episodes`}
                      {selected.size > 0 ? ` · ${selected.size} selected` : ""}
                      {doneCount > 0 ? ` · ${doneCount} added` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button size="sm" variant="ghost" onClick={toggleAll} disabled={!visible.length || running}>
                    {allSelected ? <Square className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
                    {allSelected ? "Clear" : filter ? `Select ${visible.length}` : "Select all"}
                  </Button>
                  {running ? (
                    <Button size="sm" variant="destructive" onClick={() => (cancelRef.current = true)}>
                      <X className="h-3.5 w-3.5" /> Stop
                    </Button>
                  ) : (
                    <Button size="sm" className="shadow-glow" disabled={!selected.size || disabled} onClick={() => importSelected("queue")}>
                      <Download className="h-3.5 w-3.5" /> Add {selected.size || ""} to queue
                    </Button>
                  )}
                  {!running && (
                    <Button size="sm" variant="outline" disabled={!selected.size} onClick={() => importSelected("download")}>
                      <Download className="h-3.5 w-3.5" /> Download {selected.size || ""}
                    </Button>
                  )}
                </div>
              </div>

              {!loadingFeed && episodes.length > 0 && (
                <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder='Find episodes — e.g. "episode 21", "#105", or a word in the title'
                    className="h-8 border-0 bg-transparent px-0 focus-visible:ring-0"
                  />
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {visible.length} / {episodes.length}
                  </span>
                  {filter && (
                    <button type="button" aria-label="Clear filter" onClick={() => setFilter("")} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
              {loadingFeed ? (
                <div className="flex items-center justify-center gap-2 py-10 font-mono text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> loading feed…
                </div>
              ) : (
                <ul className="max-h-[45vh] divide-y divide-border overflow-y-auto border-t border-border">
                  {visible.length === 0 && <li className="px-4 py-8 text-center font-mono text-xs text-muted-foreground">no episodes match "{filter}"</li>}
                  {visible.map((ep, i) => {
                    const st = states[ep.guid];
                    return (
                      <li key={ep.guid + i} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(ep.guid)}
                          disabled={running}
                          onChange={() => toggle(ep.guid)}
                          aria-label={`Select ${ep.title}`}
                          className="h-4 w-4 accent-[hsl(var(--primary))]"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm">{ep.episode > 0 && <span className="mr-1.5 font-mono text-[11px] text-primary">{ep.season > 0 ? `S${ep.season} ` : ""}E{ep.episode}</span>}{ep.title}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
                            {ep.date && <span>{new Date(ep.date).toLocaleDateString()}</span>}
                            {prettyDuration(ep.duration) && <span>· {prettyDuration(ep.duration)}</span>}
                            {ep.size > 0 && <span>· {formatBytes(ep.size)}</span>}
                            {st?.status === "error" && <span className="text-destructive">· {st.error}</span>}
                          </div>
                          {st?.status === "downloading" && (
                            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
                              <div
                                className="bar-shimmer animate-shimmer h-full rounded-full transition-[width] duration-300"
                                style={{ width: `${Math.max(2, st.progress * 100)}%` }}
                              />
                            </div>
                          )}
                        </div>
                        <div className="font-mono text-xs">
                          {st?.status === "downloading" && (
                            <span className="flex items-center gap-1.5 text-primary">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {Math.round(st.progress * 100)}%
                            </span>
                          )}
                          {st?.status === "done" && <span className="text-success">added</span>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
