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

const DEFAULT_MODEL = "gemini-2.5-flash";

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
type GeminiSchema = Record<string, unknown>;

function selectedModel() {
  return process.env["GEMINI_MODEL"]?.trim() || DEFAULT_MODEL;
}

async function generateGemini(
  instructions: string,
  parts: GeminiPart[],
  responseSchema?: GeminiSchema,
): Promise<string> {
  const key = process.env["GOOGLE_GENERATIVE_AI_API_KEY"];
  if (!key) throw new Error("Gemini is not configured. Set GOOGLE_GENERATIVE_AI_API_KEY in the server environment.");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel())}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [{ role: "user", parts }],
        ...(responseSchema
          ? { generationConfig: { responseMimeType: "application/json", responseSchema } }
          : {}),
      }),
    },
  );
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  if (!response.ok)
    throw new Error(body.error?.message ?? `Gemini request failed (${response.status}).`);
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned no answer.");
  return text;
}

async function generateJson<T>(
  instructions: string,
  parts: GeminiPart[],
  schema: GeminiSchema,
  parse: (value: unknown) => T,
): Promise<T> {
  const text = await generateGemini(instructions, parts, schema);
  try {
    return parse(JSON.parse(text) as unknown);
  } catch (error) {
    if (error instanceof Error && error.message !== "Unexpected end of JSON input") throw error;
    throw new Error("Gemini returned invalid JSON.");
  }
}

const chapterRangesSchema: GeminiSchema = {
  type: "OBJECT",
  properties: {
    chapters: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          first: { type: "INTEGER" },
          last: { type: "INTEGER" },
        },
        required: ["title", "first", "last"],
      },
    },
  },
  required: ["chapters"],
};

export async function transcribeStored(userId: string, path: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const download = await supabaseAdmin.storage.from("studio-audio").download(path);
  if (download.error || !download.data) throw new Error("Saved audio could not be read.");
  if (download.data.size > 12 * 1024 * 1024) throw new Error("Audio segment is too large.");
  const bytes = await download.data.arrayBuffer();
  const duration = wavSeconds(bytes);
  if (duration > TRANSCRIPTION_SEGMENT_SECONDS)
    throw new Error("Audio segments must be at most five minutes.");

  return withCredits(
    userId,
    `transcribe:${path}`,
    transcriptionCost(duration),
    "transcribe",
    async () => {
      const transcript = await generateGemini(
        "Transcribe the supplied audio accurately and verbatim. Return only the spoken words, without commentary or labels.",
        [
          { text: "Transcribe this audio." },
          { inlineData: { mimeType: "audio/wav", data: Buffer.from(bytes).toString("base64") } },
        ],
      );
      if (!transcript.trim()) throw new Error("No speech was found. Your audio is saved.");
      return { transcript: transcript.trim(), duration };
    },
  );
}

export async function organizeAudio(userId: string, key: string, segments: AudioSegment[]) {
  return withCredits(userId, `organize:${key}`, AI_COSTS.organize, "organize", async () => {
    const output = await generateJson(
      "Group consecutive audio segments into coherent story chapters. Every segment must appear exactly once and in the original order. Boundaries are zero-based inclusive segment indexes. Do not invent missing audio. Return only JSON.",
      [{ text: JSON.stringify(segments.map((segment, index) => ({ index, transcript: segment.transcript }))) }],
      chapterRangesSchema,
      (value) =>
        z
          .object({
            chapters: z.array(
              z.object({ title: z.string(), first: z.number().int(), last: z.number().int() }),
            ),
          })
          .parse(value),
    );
    return validateChapterRanges(output.chapters, segments);
  });
}

export async function askAssistant(userId: string, key: string, prompt: string) {
  return withCredits(userId, `assistant:${key}`, AI_COSTS.assistant, "assistant", async () => {
    const text = await generateGemini(
      "You help people prepare audio stories and playlists for Yoto. Give concise practical answers. Never claim to change the account, audio, or player; you only answer questions.",
      [{ text: prompt }],
    );
    return { text };
  });
}

const pixelsSchema: GeminiSchema = {
  type: "OBJECT",
  properties: {
    palette: { type: "ARRAY", items: { type: "STRING" } },
    frames: { type: "ARRAY", items: { type: "ARRAY", items: { type: "STRING" } } },
  },
  required: ["palette", "frames"],
};

function normalizePixels(raw: { palette: string[]; frames: string[][] }, animated: boolean) {
  const palette = raw.palette
    .map((color) => color.replace(/^#/, "").toLowerCase())
    .filter((color) => /^[0-9a-f]{6}$/.test(color))
    .slice(0, 10);
  if (palette.length < 2) return null;
  const wantedFrames = animated ? 4 : 1;
  const frames = raw.frames
    .filter((frame) => Array.isArray(frame) && frame.length > 0)
    .slice(0, wantedFrames)
    .map((frame) => {
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
  while (frames.length < wantedFrames) frames.push(frames[frames.length - 1]!);
  return { palette, frames };
}

export async function makePixels(userId: string, key: string, prompt: string, animated: boolean) {
  return withCredits(
    userId,
    `icon:${key}`,
    animated ? AI_COSTS.animated : AI_COSTS.icon,
    animated ? "animated" : "icon",
    async () => {
      const instructions = `You are a pixel artist making a 16x16 icon for a Yoto kids audio player. ${animated ? "Make exactly 4 frames forming a smooth looping animation." : "Make exactly 1 frame."} Return a compact JSON object with a palette of 2-10 six-digit hex colors (without #) and frames containing rows of 16 digits. Each digit refers to a palette index. Make the icon recognizable and child-friendly.`;
      let lastError = "Gemini returned an invalid icon.";
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const raw = await generateJson(
            instructions,
            [{ text: `Icon of: ${prompt}` }],
            pixelsSchema,
            (value) =>
              z.object({ palette: z.array(z.string()), frames: z.array(z.array(z.string())) }).parse(value),
          );
          const fixed = normalizePixels(raw, animated);
          if (fixed) return fixed;
        } catch (error) {
          lastError = error instanceof Error ? error.message : lastError;
        }
      }
      throw new Error(lastError);
    },
  );
}

const chatEditSchema: GeminiSchema = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING" },
    playlistTitle: { type: "STRING", nullable: true },
    removed: { type: "ARRAY", items: { type: "INTEGER" } },
    plan: {
      type: "ARRAY",
      nullable: true,
      items: {
        type: "OBJECT",
        properties: {
          sources: { type: "ARRAY", items: { type: "INTEGER" } },
          title: { type: "STRING" },
        },
        required: ["sources", "title"],
      },
    },
    icons: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          index: { type: "INTEGER" },
          subject: { type: "STRING" },
          animated: { type: "BOOLEAN" },
        },
        required: ["index", "subject", "animated"],
      },
    },
  },
  required: ["reply", "playlistTitle", "removed", "plan", "icons"],
};

const chatEditOutput = z.object({
  reply: z.string().max(1500),
  playlistTitle: z.string().max(120).nullable(),
  removed: z.array(z.number().int().nonnegative()).max(200),
  plan: z
    .array(
      z.object({
        sources: z.array(z.number().int().nonnegative()).min(1).max(200),
        title: z.string().max(120),
      }),
    )
    .max(200)
    .nullable(),
  icons: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        subject: z.string().max(200),
        animated: z.boolean(),
      }),
    )
    .max(60),
});

export async function chatEdit(
  userId: string,
  key: string,
  history: { role: "user" | "assistant"; content: string }[],
  playlist: { title: string; chapters: { title: string; minutes: number; excerpt: string }[] },
) {
  return withCredits(userId, `chat:${key}`, AI_COSTS.assistant, "assistant", async () => {
    const conversation = history.map((message) => `${message.role}: ${message.content}`).join("\n");
    const output = await generateJson(
      "You are AI Yoto, an expert children's audio producer and Yoto playlist editor. The playlist JSON uses zero-based chapter indexes, durations and transcript excerpts. Understand requests such as renaming, numbering, reordering, consecutive merging, removing, cleaning titles, bedtime pacing, story-arc grouping and playlist naming. For a change, return plan as the COMPLETE new chapter list; each item lists source indexes and a title. Multiple sources may be merged only when they are neighbouring indexes in ascending order. Every original chapter must appear once unless explicitly removed; removed lists the zero-based indexes intentionally removed. Set plan and playlistTitle to null when no playlist edit is requested. For icons, return one icons item per requested chapter, using its current zero-based chapter index. reply must be brief and must never claim to have uploaded, saved or published anything. Return only JSON.",
      [{ text: `Current playlist: ${JSON.stringify(playlist)}\n\nConversation:\n${conversation}` }],
      chatEditSchema,
      (value) => chatEditOutput.parse(value),
    );
    output.icons = output.icons.filter(
      (icon) => icon.index < playlist.chapters.length && icon.subject.trim(),
    );
    if (output.plan) {
      const used = new Set<number>();
      for (const item of output.plan)
        for (const [index, source] of item.sources.entries())
          if (
            source >= playlist.chapters.length ||
            used.has(source) ||
            (index > 0 && source !== item.sources[index - 1]! + 1)
          )
            throw new Error("AI Yoto made an invalid edit. No credits were charged.");
          else used.add(source);
      const omitted = playlist.chapters.map((_, index) => index).filter((index) => !used.has(index));
      if (omitted.join() !== [...output.removed].sort((a, b) => a - b).join())
        throw new Error("AI Yoto tried to remove audio without permission. No credits were charged.");
    }
    return output;
  });
}
