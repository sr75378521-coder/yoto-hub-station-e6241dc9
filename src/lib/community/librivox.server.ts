import { safeArchiveUrl, type SharedChapter } from './rules';
export interface Book { id: string; title: string; author: string; language: string; sourceUrl: string; cover?: string; downloads?: number; chapterCount?: number; chapters: SharedChapter[] }
function text(v: unknown) { return String(v ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim(); }
const IA_ID = /^[A-Za-z0-9._-]{1,100}$/;
const cover = (id: string) => `https://archive.org/services/img/${encodeURIComponent(id)}`;
function seconds(v: unknown) { const parts = String(v ?? '').split(':').map(Number); return parts.reduce((s,n) => s * 60 + (Number.isFinite(n) ? n : 0), 0); }

export async function fetchBooks(query: string, id?: string): Promise<Book[]> {
  const url = new URL('https://librivox.org/api/feed/audiobooks/');
  url.searchParams.set('format','json'); url.searchParams.set('extended','1'); url.searchParams.set('limit','20');
  if (id) url.searchParams.set('id',id); else if (query.trim()) url.searchParams.set('title', `^${query.trim()}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error('LibriVox is unavailable. Please try again.');
  const data = await res.json() as { books?: Record<string, any>[] };
  return (data.books ?? []).map(b => {
    const ia = String(b.url_iarchive ?? '').match(/archive\.org\/details\/([A-Za-z0-9._-]+)/)?.[1];
    const chapters = (b.sections ?? []).sort((a: any, c: any) => Number(a.section_number) - Number(c.section_number)).flatMap((s: any) => {
      try { return [{ title: text(s.title) || `Chapter ${s.section_number}`, duration: seconds(s.playtime), url: safeArchiveUrl(s.listen_url) }]; } catch { return []; }
    });
    return { id: String(b.id), title: text(b.title), author: (b.authors ?? []).map((a: any) => text(`${a.first_name ?? ''} ${a.last_name ?? ''}`)).join(', '), language: text(b.language), sourceUrl: `https://librivox.org/${String(b.url_librivox ?? '').replace(/^https?:\/\/librivox.org\//,'')}`, cover: ia ? cover(ia) : undefined, chapterCount: chapters.length, chapters };
  }).filter(b => b.chapters.length);
}

/** Most-downloaded LibriVox recordings on the Internet Archive, best first. */
export async function suggestedBooks(page: number): Promise<Book[]> {
  const url = new URL('https://archive.org/advancedsearch.php');
  url.searchParams.set('q','collection:librivoxaudio AND mediatype:audio');
  for (const f of ['identifier','title','creator','downloads','language']) url.searchParams.append('fl[]', f);
  url.searchParams.set('sort[]','downloads desc'); url.searchParams.set('rows','24'); url.searchParams.set('page',String(page)); url.searchParams.set('output','json');
  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error('Suggested books are unavailable right now.');
  const data = await res.json() as { response?: { docs?: Record<string, any>[] } };
  return (data.response?.docs ?? []).filter(d => IA_ID.test(String(d.identifier))).map(d => ({
    id: String(d.identifier), title: text(d.title).replace(/\s*\(version \d+\)$/i,''), author: text(Array.isArray(d.creator) ? d.creator.join(', ') : d.creator), language: text(Array.isArray(d.language) ? d.language[0] : d.language || 'English'),
    sourceUrl: `https://archive.org/details/${d.identifier}`, cover: cover(String(d.identifier)), downloads: Number(d.downloads) || 0, chapters: [],
  }));
}

async function archiveBook(id: string): Promise<Book | undefined> {
  if (!IA_ID.test(id)) return undefined;
  const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error('The book is unavailable right now.');
  const data = await res.json() as { metadata?: Record<string, any>; files?: Record<string, any>[] };
  if (!data.metadata) return undefined;
  const files = (data.files ?? []).filter(f => /_64kb\.mp3$/i.test(String(f.name)));
  const list = files.length ? files : (data.files ?? []).filter(f => /\.mp3$/i.test(String(f.name)));
  list.sort((a,b) => (Number(String(a.track ?? '').split('/')[0]) || 0) - (Number(String(b.track ?? '').split('/')[0]) || 0) || String(a.name).localeCompare(String(b.name)));
  const chapters = list.flatMap((f,i) => { try { return [{ title: text(f.title) || `Chapter ${i+1}`, duration: Math.round(String(f.length ?? '').includes(':') ? seconds(f.length) : Number(f.length) || 0), url: safeArchiveUrl(`https://archive.org/download/${id}/${String(f.name).split('/').map(encodeURIComponent).join('/')}`) }]; } catch { return []; } });
  const m = data.metadata;
  return { id, title: text(m.title).replace(/\s*\(version \d+\)$/i,''), author: text(Array.isArray(m.creator) ? m.creator.join(', ') : m.creator), language: text(m.language), sourceUrl: `https://archive.org/details/${id}`, cover: cover(id), chapterCount: chapters.length, chapters };
}

/** Numeric ids come from LibriVox search; other ids are Internet Archive items from suggestions. */
export async function getBook(id: string): Promise<Book | undefined> {
  return /^\d+$/.test(id) ? (await fetchBooks('', id))[0] : archiveBook(id);
}
