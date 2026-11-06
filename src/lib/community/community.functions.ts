import { createServerFn } from '@tanstack/react-start';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { Json } from '@/integrations/supabase/types';
import type { AiChapter } from '@/lib/ai-yoto/plans';
import { validateSharedChapters, transformChapters, type SharedChapter } from './rules';
const idSchema = z.object({ id: z.string().uuid() });
export const browsePublic = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const result = await context.supabase.from('public_playlists').select('*').order('created_at',{ ascending: false }).limit(200);
  if (result.error) throw result.error; return result.data;
});
export const publicOptions = () => queryOptions({ queryKey: ['public-playlists'], queryFn: () => browsePublic() });
export const searchBooks = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ query: z.string().max(100) })).handler(async ({ data }) => {
  const { fetchBooks } = await import('./librivox.server'); return fetchBooks(data.query);
});
export const suggestBooks = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ page: z.number().int().min(1).max(50) })).handler(async ({ data }) => {
  const { suggestedBooks } = await import('./librivox.server'); return suggestedBooks(data.page);
});
/** Publish one of the user's own Yoto playlists by copying its audio into the community sharing area. */
export const shareYotoPlaylist = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ cardId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), description: z.string().max(2000), rightsConfirmed: z.literal(true) })).handler(async ({ data, context }) => {
  const { resolveCardRaw } = await import('@/lib/yoto/api.server');
  const raw = await resolveCardRaw(context.userId, data.cardId); const card = raw?.card ?? raw;
  const list = (card?.content?.chapters ?? []) as Record<string, any>[];
  if (!list.length) throw new Error('This Yoto playlist has no audio we can read.');
  if (list.length > 100) throw new Error('Playlists over 100 chapters cannot be published.');
  const id = crypto.randomUUID(); const chapters: SharedChapter[] = []; let n = 0;
  for (const [i,c] of list.entries()) for (const [j,t] of ((c.tracks ?? []) as Record<string, any>[]).entries()) {
    const src = String(t.trackUrl ?? '');
    if (!/^https:\/\//.test(src)) continue; // only resolved, playable links; never store Yoto hashes
    const res = await fetch(src, { signal: AbortSignal.timeout(60000) }); if (!res.ok) throw new Error(`Couldn't download "${c.title ?? 'a chapter'}" from Yoto.`);
    const bytes = await res.arrayBuffer(); if (bytes.byteLength > 50 * 1024 * 1024) throw new Error(`"${c.title ?? 'A chapter'}" is over 50 MB and can't be shared.`);
    const type = res.headers.get('content-type') || 'audio/mpeg'; const ext = /aac|mp4|m4a/.test(type) ? 'm4a' : /ogg|opus/.test(type) ? 'ogg' : 'mp3';
    const target = `${context.userId}/${id}/${i}-${j}.${ext}`;
    const up = await context.supabase.storage.from('community-audio').upload(target, bytes, { contentType: type }); if (up.error) throw up.error;
    const title = String(t.title || c.title || `Chapter ${i+1}`); chapters.push({ title: ((c.tracks?.length ?? 0) > 1 && t.title === c.title) ? `${title} · ${j+1}` : title, duration: Number(t.duration ?? c.duration ?? 0) || 0, path: target }); n++;
  }
  if (!n) throw new Error('Yoto did not provide downloadable audio for this playlist.');
  const safe = validateSharedChapters(chapters, context.userId, id);
  const saved = await context.supabase.from('public_playlists').insert({ id, user_id: context.userId, title: String(card?.title ?? card?.metadata?.title ?? 'Yoto playlist').slice(0,200), description: data.description, author: String(card?.metadata?.author ?? '').slice(0,200) || undefined, chapters: safe as unknown as Json }).select('id').single();
  if (saved.error) throw saved.error; return saved.data;
});
export const importBook = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/), publish: z.boolean(), rightsConfirmed: z.literal(true) })).handler(async ({ data, context }) => {
  const { getBook } = await import('./librivox.server'); const book = await getBook(data.id);
  if (!book) throw new Error('The book is no longer available.');
  const chapters: AiChapter[] = book.chapters.map((c,i) => ({ title: c.title, start: 0, end: c.duration, transcript: '', paths: [], tracks: [{ key: String(i+1), title: c.title, trackUrl: c.url ?? '', duration: c.duration, format: 'mp3' }] }));
  if (!data.publish) { const saved = await context.supabase.from('ai_yoto_drafts').insert({ user_id: context.userId, title: book.title, chapters: chapters as unknown as Json }).select('id').single(); if (saved.error) throw saved.error; return { id: saved.data.id }; }
  const result = await context.supabase.from('public_playlists').insert({ user_id: context.userId, title: book.title, description: `LibriVox audiobook · ${book.author}. Read by LibriVox volunteers.`, author: book.author, source: 'librivox', source_url: book.sourceUrl, chapters: book.chapters as unknown as Json }).select('id').single();
  if (result.error) throw result.error; return { id: result.data.id };
});
export const shareDraft = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: z.string().uuid(), description: z.string().max(2000), rightsConfirmed: z.literal(true) })).handler(async ({ data, context }) => {
  const result = await context.supabase.from('ai_yoto_drafts').select('title,chapters').eq('id',data.id).eq('user_id',context.userId).single(); if (result.error) throw result.error;
  const id = crypto.randomUUID(); const chapters: SharedChapter[] = [];
  const stored = result.data.chapters as unknown as AiChapter[];
  // Copy only owner-readable audio into a separate sharing area, never expose studio paths or Yoto hashes.
  for (const [i,c] of stored.entries()) {
    if (c.paths.length) {
      for (const [j,path] of c.paths.entries()) {
        if (!path.startsWith(`${context.userId}/`) || path.includes('..')) throw new Error('Invalid source audio.');
        const file = await context.supabase.storage.from('studio-audio').download(path); if (file.error || !file.data) throw new Error('Source audio is unavailable.');
        const target = `${context.userId}/${id}/${i}-${j}.wav`;
        const upload = await context.supabase.storage.from('community-audio').upload(target,file.data,{ contentType: file.data.type }); if (upload.error) throw upload.error;
        chapters.push({ title: c.paths.length > 1 ? `${c.title} · ${j+1}` : c.title, duration: (c.end-c.start)/c.paths.length, path: target });
      }
    } else if (c.tracks?.length) {
      for (const track of c.tracks) chapters.push({ title: c.title, duration: track.duration ?? 0, url: track.trackUrl });
    }
  }
  const safe = validateSharedChapters(chapters,context.userId,id);
  const saved = await context.supabase.from('public_playlists').insert({ id, user_id: context.userId, title: result.data.title, description: data.description, chapters: safe as unknown as Json }).select('id').single(); if (saved.error) throw saved.error; return saved.data;
});
export const setVisibility = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(idSchema.extend({ public: z.boolean() })).handler(async ({ data, context }) => {
  const result = await context.supabase.from('public_playlists').update({ is_public: data.public, updated_at: new Date().toISOString() }).eq('id',data.id).eq('user_id',context.userId).select('id').single(); if (result.error) throw result.error; return result.data;
});
export const addToLibrary = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(idSchema).handler(async ({ data, context }) => {
  const existing = await context.supabase.from('ai_yoto_drafts').select('id').eq('user_id',context.userId).eq('source_public_id',data.id).maybeSingle(); if (existing.error) throw existing.error; if (existing.data) return existing.data;
  const source = await context.supabase.from('public_playlists').select('*').eq('id',data.id).eq('is_public',true).single(); if (source.error) throw new Error('This playlist is no longer public.');
  const shared = validateSharedChapters(source.data.chapters,source.data.user_id,source.data.id); const draftId = crypto.randomUUID(); const chapters: AiChapter[] = [];
  for (const [i,c] of shared.entries()) {
    let path: string | undefined;
    if (c.path) {
      const downloaded = await context.supabase.storage.from('community-audio').download(c.path); if (downloaded.error || !downloaded.data) throw new Error('Shared audio is unavailable.');
      path = `${context.userId}/ai-yoto/${draftId}/${i}.wav`;
      const upload = await context.supabase.storage.from('studio-audio').upload(path,downloaded.data,{ contentType: downloaded.data.type }); if (upload.error) throw upload.error;
    }
    chapters.push({ title: c.title, start: 0, end: c.duration, transcript: '', paths: path ? [path] : [], ...(c.url ? { tracks: [{ key: String(i+1), title: c.title, trackUrl: c.url, duration: c.duration, format: 'mp3' }] } : {}) });
  }
  const result = await context.supabase.from('ai_yoto_drafts').insert({ id: draftId, user_id: context.userId, title: source.data.title, source_public_id: data.id, chapters: chapters as unknown as Json }).select('id').single();
  if (result.error?.code === '23505') { const copy = await context.supabase.from('ai_yoto_drafts').select('id').eq('source_public_id',data.id).eq('user_id',context.userId).single(); if (copy.error) throw copy.error; return copy.data; }
  if (result.error) throw result.error; return result.data;
});
export const playlistTool = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: z.string().uuid(), tool: z.enum(['number','tidy','group']), minutes: z.number().min(1).max(120).default(10) })).handler(async ({ data, context }) => {
  const { getMembership } = await import('@/lib/ai-yoto/billing.server'); const member = await getMembership(context.userId);
  const draft = await context.supabase.from('ai_yoto_drafts').select('chapters').eq('id',data.id).eq('user_id',context.userId).single(); if (draft.error) throw draft.error;
  return transformChapters(member.plan,data.tool,draft.data.chapters as unknown as AiChapter[],data.minutes);
});
/** One click: build a ready-made Yoto playlist from a public playlist or a LibriVox book, and keep a library copy. */
export const addToYoto = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.union([z.object({ publicId: z.string().uuid() }), z.object({ bookId: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/), rightsConfirmed: z.literal(true) })])).handler(async ({ data, context }) => {
  const { yotoPost } = await import('@/lib/yoto/api.server'); const { uploadAudioToYoto } = await import('@/lib/yoto/myo.server');
  const { getValidAccessToken } = await import('@/lib/yoto/tokens.server');
  if (!(await getValidAccessToken(context.userId))) throw new Error('Connect your Yoto account first (Settings → Yoto).');
  let title: string, author = '', description = '', shared: SharedChapter[];
  if ('bookId' in data) {
    const { getBook } = await import('./librivox.server'); const book = await getBook(data.bookId);
    if (!book) throw new Error('The book is no longer available.');
    title = book.title; author = book.author; description = `LibriVox audiobook · ${book.author}. Read by LibriVox volunteers.`; shared = book.chapters;
  } else {
    const source = await context.supabase.from('public_playlists').select('*').eq('id', data.publicId).eq('is_public', true).single(); if (source.error) throw new Error('This playlist is no longer public.');
    title = source.data.title; author = source.data.author ?? ''; description = source.data.description ?? ''; shared = validateSharedChapters(source.data.chapters, source.data.user_id, source.data.id);
  }
  if (!shared.length || shared.length > 100) throw new Error('Yoto playlists can have 1–100 chapters.');
  let total = 0; const chapters: { key: string; title: string; overlayLabel: string; tracks: Record<string, unknown>[] }[] = [];
  for (const [i, c] of shared.entries()) {
    let track: Record<string, unknown>;
    if (c.url) track = { trackUrl: c.url, type: 'stream', format: 'mp3', duration: c.duration };
    else if (c.path) {
      const file = await context.supabase.storage.from('community-audio').download(c.path); if (file.error || !file.data) throw new Error('Shared audio is unavailable.');
      const up = await uploadAudioToYoto(context.userId, { name: `${i + 1}.wav`, type: 'audio/wav', bytes: await file.data.arrayBuffer() });
      track = { trackUrl: `yoto:#${up.sha256}`, type: 'audio', format: up.format ?? 'aac', duration: up.duration ?? c.duration, fileSize: up.fileSize, channels: up.channels ?? 'mono' };
    } else continue;
    total += Number(track.duration ?? 0); const key = String(i + 1).padStart(2, '0');
    chapters.push({ key, title: c.title, overlayLabel: String(i + 1), tracks: [{ key: '01', title: c.title, overlayLabel: String(i + 1), ...track }] });
  }
  const res = await yotoPost<Record<string, any>>(context.userId, '/content', { title, content: { chapters }, metadata: { title, author, description, media: { duration: total } } });
  const cardId = res?.cardId ?? res?.card?.cardId; if (!cardId) throw new Error('Yoto did not confirm the playlist.');
  const draftChapters: AiChapter[] = chapters.map(c => ({ title: c.title, start: 0, end: Number(c.tracks[0]!.duration ?? 0), transcript: '', paths: [], tracks: [{ ...(c.tracks[0] as any), key: c.key }] }));
  await context.supabase.from('ai_yoto_drafts').insert({ user_id: context.userId, title, chapters: draftChapters as unknown as Json, yoto_card_id: cardId, ...('publicId' in data ? { source_public_id: data.publicId } : {}) });
  return { cardId, chapters: chapters.length };
});
