import { createOpenAI } from '@ai-sdk/openai';
import { Output, streamText } from 'ai';
import { z } from 'zod';
import { createLovableAiGatewayRunIdFetch } from './run-id.server.ts';
import { withCredits } from './credits.server';
import { AI_COSTS, transcriptionCost, validateChapterRanges, type AudioSegment } from './plans';
import { wavSeconds, readTranscript } from './stream';
import { transcribe } from './transcribe.server';

function provider() {
  const key = process.env['LOVABLE_API_KEY'];
  if (!key) throw new Error('AI is not configured.');
  const correlation = createLovableAiGatewayRunIdFetch();
  return createOpenAI({ apiKey: key, baseURL: 'https://ai.gateway.lovable.dev/v1', headers: { 'Lovable-API-Key': key, 'X-Lovable-AIG-SDK': 'vercel-ai-sdk' }, fetch: async (input, init) => {
    // Preserve request correlation while enforcing terminal gateway failures.
    const response = await correlation.fetch(input, init);
    if (response.ok) return response;
    return checkedGatewayFetchResponse(response);
  } });
}
async function checkedGatewayFetchResponse(response: Response): Promise<never> {
  const body = await response.clone().json().catch(() => ({}));
  const message = body.message ?? body.error?.message ?? `AI request failed (${response.status}).`;
  if ([402, 403].includes(response.status)) {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const saved = await supabaseAdmin.from('ai_gateway_blocks').upsert({ id: 'workspace', status: response.status, message, updated_at: new Date().toISOString() });
    if (saved.error) throw saved.error;
  }
  throw new Error(message);
}
const options = { openai: { forceReasoning: true, reasoningEffort: 'low', reasoningSummary: 'auto', store: false, include: ['reasoning.encrypted_content'] } };
export async function transcribeStored(userId: string, path: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const download = await supabaseAdmin.storage.from('studio-audio').download(path);
  if (download.error || !download.data) throw new Error('Saved audio could not be read.');
  if (download.data.size > 4 * 1024 * 1024) throw new Error('Audio segment is too large.');
  const bytes = await download.data.arrayBuffer();
  const duration = wavSeconds(bytes);
  if (duration > 65) throw new Error('Audio segments must be at most one minute.');
  return withCredits(userId, `transcribe:${path}`, transcriptionCost(duration), 'transcribe', async () => {
    const apiKey = process.env['LOVABLE_API_KEY'];
    if (!apiKey) throw new Error('AI is not configured.');
    const response = await transcribe({ baseURL: 'https://ai.gateway.lovable.dev', apiKey, model: 'openai/gpt-transcribe', maxFileBytes: 4 * 1024 * 1024, audioOnly: true }, new File([bytes], 'audio.wav', { type: 'audio/wav' }));
    if (!response.ok) return checkedGatewayFetchResponse(response);
    return { transcript: await readTranscript(response), duration };
  });
}
export async function organizeAudio(userId: string, key: string, segments: AudioSegment[]) {
  return withCredits(userId, `organize:${key}`, AI_COSTS.organize, 'organize', async () => {
    const schema = z.object({ chapters: z.array(z.object({ title: z.string(), first: z.number(), last: z.number() }).strict()) }).strict();
    const result = streamText({ model: provider().responses('openai/gpt-6-astra'), maxRetries: 0, providerOptions: options, output: Output.object({ schema }), instructions: 'Group consecutive audio segments into coherent story chapters. Every segment must appear exactly once in order. Boundaries are zero-based inclusive segment indexes. Do not invent missing audio. Use short descriptive chapter titles.', messages: [{ role: 'user', content: JSON.stringify(segments.map((s, i) => ({ index: i, transcript: s.transcript }))) }] });
    const output = await result.output;
    return validateChapterRanges(output.chapters, segments);
  });
}
export async function askAssistant(userId: string, key: string, prompt: string) {
  return withCredits(userId, `assistant:${key}`, AI_COSTS.assistant, 'assistant', async () => {
    const result = streamText({ model: provider().responses('openai/gpt-6-astra'), maxRetries: 0, providerOptions: options, instructions: 'You help people prepare audio stories and playlists for Yoto. Give concise practical answers. Never claim to change the account, audio, or player; you only answer questions.', messages: [{ role: 'user', content: prompt }] });
    const text = await result.text;
    if (!text.trim()) throw new Error('AI returned no answer.');
    return { text };
  });
}
export async function makePixels(userId: string, key: string, prompt: string, animated: boolean) {
  return withCredits(userId, `icon:${key}`, animated ? AI_COSTS.animated : AI_COSTS.icon, animated ? 'animated' : 'icon', async () => {
    const schema = z.object({ palette: z.array(z.string()), frames: z.array(z.array(z.string())) });
    const instructions = `You are a pixel artist making a 16x16 icon for a Yoto kids audio player. ${animated ? 'Make exactly 4 frames forming a smooth looping animation (e.g. blinking, bobbing, flickering, twinkling); keep the subject in the same place and change only a few pixels per frame.' : 'Make exactly 1 frame.'} palette: 2 to 10 hex colors like "ffcc00" (no #), palette[0] must be "000000" (background). Each frame: exactly 16 strings, each exactly 16 characters, each character a digit 0-9 indexing the palette. Draw a bold, recognisable subject filling most of the grid with a 1-pixel dark outline, bright saturated colors, no text, black background.`;
    let lastError = 'AI returned an invalid icon. No credits were charged.';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = streamText({ model: provider().responses('openai/gpt-6-astra'), maxRetries: 0, providerOptions: options, output: Output.object({ schema }), instructions, messages: [{ role: 'user', content: `Icon of: ${prompt}` }] });
        const fixed = normalizePixels(await result.output, animated);
        if (fixed) return fixed;
      } catch (e) { lastError = e instanceof Error && /credit|payment|rate/i.test(e.message) ? e.message : lastError; }
    }
    throw new Error(lastError);
  });
}
/** Repairs small AI mistakes (# prefixes, short/long rows, wrong frame count) instead of discarding the icon. */
export function normalizePixels(raw: { palette: string[]; frames: string[][] }, animated: boolean) {
  const palette = raw.palette.map(c => c.replace(/^#/, '').toLowerCase()).filter(c => /^[0-9a-f]{6}$/.test(c)).slice(0, 10);
  if (palette.length < 2) return null;
  const want = animated ? 4 : 1;
  const frames = raw.frames.filter(f => Array.isArray(f) && f.length).slice(0, want).map(f => {
    const rows = f.slice(0, 16).map(r => [...String(r).replace(/[^0-9]/g, '')].map(c => Number(c) < palette.length ? c : '0').join('').padEnd(16, '0').slice(0, 16));
    while (rows.length < 16) rows.push('0'.repeat(16));
    return rows;
  });
  if (!frames.length || frames.every(f => f.every(r => /^0+$/.test(r)))) return null;
  while (frames.length < want) frames.push(frames[frames.length - 1]!);
  return { palette, frames };
}
export async function chatEdit(userId: string, key: string, history: { role: 'user' | 'assistant'; content: string }[], playlist: { title: string; chapters: { title: string; minutes: number; excerpt: string }[] }) {
  return withCredits(userId, `chat:${key}`, AI_COSTS.assistant, 'assistant', async () => {
    const schema = z.object({ reply: z.string().max(1500), playlistTitle: z.string().max(120).nullable(), removed: z.array(z.number().int().nonnegative()).max(200), plan: z.array(z.object({ sources: z.array(z.number().int().nonnegative()).min(1).max(200), title: z.string().max(120) }).strict()).max(200).nullable(), icons: z.array(z.object({ index: z.number().int().nonnegative(), subject: z.string().max(200), animated: z.boolean() }).strict()).max(60) }).strict();
    const result = streamText({ model: provider().responses('openai/gpt-6-astra'), maxRetries: 0, providerOptions: { openai: { ...options.openai, reasoningEffort: 'medium' } }, output: Output.object({ schema }),
      instructions: `You are AI Yoto, an expert children's audio producer and Yoto playlist editor. The playlist JSON uses zero-based chapter indexes, durations and transcript excerpts.
Be precise, creative and safe. Understand natural requests such as renaming, numbering, reordering, consecutive merging, removing, cleaning titles, bedtime pacing, story-arc grouping and playlist naming. Use the transcript excerpts to make specific, charming titles under 45 characters; avoid spoilers and repetitive words.
For a change, return "plan" as the COMPLETE new chapter list. Each item lists source indexes and a title. Multiple sources may be merged only when they are neighbouring indexes in ascending order. Use every source exactly once unless the user explicitly asked to remove it; list explicitly removed indexes in "removed", otherwise return []. Never remove because a chapter is short or similar. Set playlistTitle only when asked to name or rename the playlist. If no change is requested or the request is ambiguous, ask one short clarifying question, set plan null and removed [].
You CAN make real 16x16 pixel-art chapter icons (still or animated). When the user asks for icons, fill "icons" with one item per requested chapter: the zero-based CURRENT chapter index, a short concrete visual subject that is easy to draw in 16x16 pixels (e.g. "red dragon head", "glowing moon over hill"), and animated true only if they asked for animated/moving icons. "all chapters" means every index. Otherwise return icons []. Icon requests alone need no plan (set plan null). Never say you cannot make icons; the app draws them after your reply.
"reply" must be brief and list the main changes. Never claim to have uploaded, saved or published anything.`,
      messages: [{ role: 'user', content: `Current playlist: ${JSON.stringify(playlist)}` }, ...history] });
    const output = await result.output;
    output.icons = output.icons.filter(i => i.index < playlist.chapters.length && i.subject.trim());
    if (output.plan) {
      const used = new Set<number>();
      for (const item of output.plan) for (const [i, s] of item.sources.entries()) if (s >= playlist.chapters.length || used.has(s) || (i > 0 && s !== item.sources[i - 1]! + 1)) throw new Error('AI Yoto made an invalid edit. No credits were charged.'); else used.add(s);
      const omitted = playlist.chapters.map((_, i) => i).filter(i => !used.has(i));
      if (omitted.join() !== [...output.removed].sort((a, b) => a - b).join()) throw new Error('AI Yoto tried to remove audio without permission. No credits were charged.');
    }
    return output;
  });
}
