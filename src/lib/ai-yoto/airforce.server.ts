import { Buffer } from "node:buffer";
import { z } from "zod";
import { withCredits } from "./credits.server";
import {
  AI_COSTS,
  TRANSCRIPTION_SEGMENT_SECONDS,
  transcriptionCost,
  validateChapterRanges,
  type AudioSegment,
} from "./plans";
import { wavSeconds } from "./stream";

const DEFAULT_MODEL = "deepseek-v3";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function airforceConfig() {
  const apiKey = process.env["AIRFORCE_API_KEY"];
  if (!apiKey) throw new Error("Airforce AI is not configured. Set AIRFORCE_API_KEY in the server environment.");
  return {
    apiKey,
    model: process.env["AIRFORCE_MODEL"]?.trim() || DEFAULT_MODEL,
    baseUrl: (process.env["AIRFORCE_BASE_URL"]?.trim() || "https://api.airforce/v1").replace(/\/$/, ""),
  };
}

async function generateAirforce(messages: ChatMessage[], json = false): Promise<string> {
  const config = airforceConfig();
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string } | string;
    choices?: { message?: { content?: string | { text?: string }[] | null } }[];
  };
  if (!response.ok) {
    const detail = typeof body.error === "string" ? body.error : body.error?.message;
    throw new Error(detail ?? `Airforce API request failed (${response.status}).`);
  }
  const content = body.choices?.[0]?.message?.content;
  const text = Array.isArray(content) ? content.map((part) => part.text ?? "").join("") : content;
  if (!text?.trim()) throw new Error("Airforce returned no answer.");
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

async function generateJson<T>(
  instructions: string,
  prompt: string,
  parse: (value: unknown) => T,
): Promise<T> {
  const text = await generateAirforce(
    [
      { role: "system", content: `${instructions}\nReturn a valid JSON object only.` },
      { role: "user", content: prompt },
    ],
    true,
  );
  try {
    return parse(JSON.parse(text) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Airforce returned invalid JSON.");
    throw error;
  }
}

/**
 * Airforce's DeepSeek V3 chat-completions model is text-only. Audio transcription
 * remains on Gemini and requires GOOGLE_GENERATIVE_AI_API_KEY; do not send audio
 * to DeepSeek V3 or claim it supports audio input.
 */
export async function transcribeStored(userId: string, path: string) {
  const geminiKey = process.env["GOOGLE_GENERATIVE_AI_API_KEY"];
  if (!geminiKey)
    throw new Error(
      "Audio transcription needs GOOGLE_GENERATIVE_AI_API_KEY because DeepSeek V3 does not accept audio input.",
    );
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const download = await supabaseAdmin.storage.from("studio-audio").download(path);
  if (download.error || !download.data) throw new Error("Saved audio could not be read.");
  if (download.data.size > 12 * 1024 * 1024) throw new Error("Audio segment is too large.");
  const bytes = await download.data.arrayBuffer();
  const duration = wavSeconds(bytes);
  if (duration > TRANSCRIPTION_SEGMENT_SECONDS)
    throw new Error("Audio segments must be at most five minutes.");

  return withCredits(userId, `transcribe:${path}`, transcriptionCost(duration), "transcribe", async () => {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(process.env["GEMINI_MODEL"]?.trim() || "gemini-2.5-flash")}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": geminiKey },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: "Transcribe this audio accurately and verbatim. Return only the spoken words, without commentary or labels." },
                { inlineData: { mimeType: "audio/wav", data: Buffer.from(bytes).toString("base64") } },
              ],
            },
          ],
        }),
      },
    );
    const result = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    if (!response.ok)
      throw new Error(result.error?.message ?? `Gemini transcription failed (${response.status}).`);
    const transcript = result.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!transcript) throw new Error("No speech was found. Your audio is saved.");
    return { transcript, duration };
  });
}

export async function organizeAudio(userId: string, key: string, segments: AudioSegment[]) {
  return withCredits(userId, `organize:${key}`, AI_COSTS.organize, "organize", async () => {
    const output = await generateJson(
      "Group consecutive audio segments into coherent story chapters. Every segment must appear exactly once and in the original order. Boundaries are zero-based inclusive segment indexes. Do not invent missing audio. Return an object with a chapters array; each item has title, first, and last.",
      JSON.stringify(segments.map((segment, index) => ({ index, transcript: segment.transcript }))),
      (value) =>
        z.object({
          chapters: z.array(z.object({ title: z.string(), first: z.number().int(), last: z.number().int() })),
        }).parse(value),
    );
    return validateChapterRanges(output.chapters, segments);
  });
}

export async function askAssistant(userId: string, key: string, prompt: string) {
  return withCredits(userId, `assistant:${key}`, AI_COSTS.assistant, "assistant", async () => ({
    text: await generateAirforce([
      {
        role: "system",
        content: "You help people prepare audio stories and playlists for Yoto. Give concise practical answers. Never claim to change the account, audio, or player; you only answer questions.",
      },
      { role: "user", content: prompt },
    ]),
  }));
}

function normalizePixels(raw: { palette: string[]; frames: string[][] }, animated: boolean) {
  const palette = raw.palette
    .map((color) => color.replace(/^#/, "").toLowerCase())
    .filter((color) => /^[0-9a-f]{6}$/.test(color))
    .slice(0, 10);
  if (palette.length < 2) return null;
  const frameCount = animated ? 4 : 1;
  const frames = raw.frames.slice(0, frameCount).map((frame) => {
    const rows = frame.slice(0, 16).map((row) =>
      [...String(row).replace(/[^0-9]/g, "")]
        .map((digit) => (Number(digit) < palette.length ? digit : "0"))
        .join("")
        .padEnd(16, "0")
        .slice(0, 16),
    );
    while (rows.length < 16) rows.push("0".repeat(16));
    return rows;
  });
  if (!frames.length || frames.every((frame) => frame.every((row) => /^0+$/.test(row)))) return null;
  while (frames.length < frameCount) frames.push(frames[frames.length - 1]!);
  return { palette, frames };
}

export async function makePixels(userId: string, key: string, prompt: string, animated: boolean) {
  return withCredits(
    userId,
    `icon:${key}`,
    animated ? AI_COSTS.animated : AI_COSTS.icon,
    animated ? "animated" : "icon",
    async () => {
      const instructions = `You are a pixel artist making a 16x16 icon for a Yoto kids audio player. ${animated ? "Return exactly 4 frames for a smooth looping animation." : "Return exactly 1 frame."} Return a JSON object with palette (2-10 six-digit hex colors without #) and frames (arrays of 16 strings, each a row of 16 digits). Each digit refers to a palette index.`;
      let lastError = "Airforce returned an invalid pixel icon.";
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const raw = await generateJson(
            instructions,
            `Make an icon of: ${prompt}`,
            (value) => z.object({ palette: z.array(z.string()), frames: z.array(z.array(z.string())) }).parse(value),
          );
          const normalized = normalizePixels(raw, animated);
          if (normalized) return normalized;
        } catch (error) {
          lastError = error instanceof Error ? error.message : lastError;
        }
      }
      throw new Error(lastError);
    },
  );
}

const chatEditOutput = z.object({
  reply: z.string().max(1500),
  playlistTitle: z.string().max(120).nullable(),
  removed: z.array(z.number().int().nonnegative()).max(200),
  plan: z.array(z.object({
    sources: z.array(z.number().int().nonnegative()).min(1).max(200),
    title: z.string().max(120),
  })).max(200).nullable(),
  icons: z.array(z.object({
    index: z.number().int().nonnegative(),
    subject: z.string().max(200),
    animated: z.boolean(),
  })).max(60),
});

export async function chatEdit(
  userId: string,
  key: string,
  history: { role: "user" | "assistant"; content: string }[],
  playlist: { title: string; chapters: { title: string; minutes: number; excerpt: string }[] },
) {
  return withCredits(userId, `chat:${key}`, AI_COSTS.assistant, "assistant", async () => {
    const instructions = "You are AI Yoto, an expert children's audio producer and Yoto playlist editor. Playlist chapters use zero-based indexes, durations, and transcript excerpts. Understand renaming, numbering, reordering, consecutive merging, removing, title cleanup, bedtime pacing, story grouping, and playlist naming. For a requested edit, return plan as the COMPLETE new chapter list with each item containing sources and title. Merge only neighbouring sources in ascending order. Every original chapter must be included exactly once unless explicitly removed; removed lists the zero-based indexes intentionally removed. Set plan and playlistTitle null if there is no playlist edit. For icon requests, return one icons item per requested chapter, using its current zero-based index. Return JSON with reply, playlistTitle, removed, plan, icons. Keep reply brief and never claim to have uploaded or saved anything.";
    const output = await generateJson(
      instructions,
      `Current playlist: ${JSON.stringify(playlist)}\n\nConversation:\n${history.map((message) => `${message.role}: ${message.content}`).join("\n")}`,
      (value) => chatEditOutput.parse(value),
    );
    output.icons = output.icons.filter((icon) => icon.index < playlist.chapters.length && icon.subject.trim());
    if (output.plan) {
      const used = new Set<number>();
      for (const item of output.plan)
        for (const [index, source] of item.sources.entries()) {
          if (
            source >= playlist.chapters.length ||
            used.has(source) ||
            (index > 0 && source !== item.sources[index - 1]! + 1)
          ) throw new Error("AI Yoto made an invalid edit. No credits were charged.");
          used.add(source);
        }
      const omitted = playlist.chapters.map((_, index) => index).filter((index) => !used.has(index));
      if (omitted.join() !== [...output.removed].sort((a, b) => a - b).join())
        throw new Error("AI Yoto tried to remove audio without permission. No credits were charged.");
    }
    return output;
  });
}
