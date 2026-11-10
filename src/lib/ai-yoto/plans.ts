export const PLANS = {
  free: { name: "Free", price: 0, credits: 5, priceId: "", rank: 0 },
  basic: {
    name: "Basic",
    price: 2,
    credits: 50,
    priceId: "price_1Ua57JRtwjF7vcCEpvrq5QY2",
    rank: 1,
  },
  pro: { name: "Pro", price: 5, credits: 150, priceId: "price_1Ua57JRtwjF7vcCEajrwDN31", rank: 2 },
  pro_max: {
    name: "Pro Max",
    price: 10,
    credits: 350,
    priceId: "price_1Ua57KRtwjF7vcCErxUA0pHq",
    rank: 3,
  },
} as const;
export type PlanId = keyof typeof PLANS;
export const AI_COSTS = { assistant: 1, organize: 1, icon: 2, animated: 4 } as const;
export const TRANSCRIPTION_SEGMENT_SECONDS = 300;
export function transcriptionCost(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("Invalid audio duration");
  return Math.ceil(seconds / TRANSCRIPTION_SEGMENT_SECONDS);
}
export function canUseAction(plan: PlanId, action: string) {
  if (action === "icon") return PLANS[plan].rank >= 2;
  if (action === "animated") return PLANS[plan].rank >= 3;
  return true;
}
export function planFromPrice(priceId: string): PlanId {
  return (
    (Object.keys(PLANS) as PlanId[]).find(
      (id) => PLANS[id].priceId === priceId && priceId !== "",
    ) ?? "free"
  );
}
export interface AudioSegment {
  start: number;
  end: number;
  path: string;
  transcript: string;
}
export interface AiChapter {
  title: string;
  start: number;
  end: number;
  transcript: string;
  paths: string[];
  segments?: AudioSegment[];
  icon?: string;
  iconUrl?: string;
  tracks?: import("@/lib/yoto/myo.functions").EditableTrack[];
}
/** Preserve exact timing for new clips and the original one-minute legacy clips. */
export function chapterSegments(chapter: AiChapter): AudioSegment[] {
  return (
    chapter.segments ??
    chapter.paths.map((path, index) => ({
      path,
      start: chapter.start + index * 60,
      end: Math.min(chapter.end, chapter.start + (index + 1) * 60),
      transcript:
        chapter.paths.length === 1 ? chapter.transcript : `${chapter.title}: ${chapter.transcript}`,
    }))
  );
}
export function remainingTranscriptionCost(seconds: number, completed: readonly AiChapter[]) {
  const count = Math.ceil(seconds / TRANSCRIPTION_SEGMENT_SECONDS);
  let cost = 0;
  for (let i = 0; i < count; i++) {
    if (completed[i]?.transcript.trim()) continue;
    cost += transcriptionCost(
      Math.min(TRANSCRIPTION_SEGMENT_SECONDS, seconds - i * TRANSCRIPTION_SEGMENT_SECONDS),
    );
  }
  return cost;
}
export function validateChapterRanges(
  ranges: { title: string; first: number; last: number }[],
  segments: AudioSegment[],
): AiChapter[] {
  let next = 0;
  const chapters = ranges.map((r) => {
    if (
      !Number.isInteger(r.first) ||
      !Number.isInteger(r.last) ||
      r.first !== next ||
      r.last < r.first ||
      r.last >= segments.length
    )
      throw new Error("AI returned incomplete chapter boundaries. Your audio is still saved.");
    const parts = segments.slice(r.first, r.last + 1);
    const first = parts[0],
      last = parts.at(-1);
    if (!first || !last) throw new Error("Empty chapter");
    next = r.last + 1;
    return {
      title: r.title.slice(0, 120),
      start: first.start,
      end: last.end,
      transcript: parts.map((p) => p.transcript).join(" "),
      paths: parts.map((p) => p.path),
      segments: parts,
    };
  });
  if (next !== segments.length)
    throw new Error("AI did not include the full audio. Your audio is still saved.");
  return chapters;
}
export interface ChapterPlan {
  sources: number[];
  title: string;
}
/** Apply an AI/user edit plan: reorder, consecutive merge, rename or explicitly remove chapters. */
export function applyChapterPlan(
  chapters: AiChapter[],
  plan: ChapterPlan[],
  removed: number[] = [],
): AiChapter[] {
  const used = new Set<number>();
  if (!plan.length) throw new Error("The edit would remove every chapter.");
  const result = plan.map((p) => {
    if (!p.sources.length) throw new Error("A chapter in the edit had no audio.");
    if (p.sources.some((s, i) => i > 0 && s !== p.sources[i - 1]! + 1))
      throw new Error("Only neighbouring chapters can be merged. Nothing was changed.");
    const parts = p.sources.map((i) => {
      if (!Number.isInteger(i) || i < 0 || i >= chapters.length || used.has(i))
        throw new Error("The AI edit referenced audio that does not exist. Nothing was changed.");
      used.add(i);
      return chapters[i]!;
    });
    return mergeChapters(parts, p.title.trim().slice(0, 120) || parts[0]!.title);
  });
  const omitted = chapters.map((_, i) => i).filter((i) => !used.has(i));
  if (
    omitted.some((i) => !removed.includes(i)) ||
    removed.some((i) => used.has(i) || !omitted.includes(i))
  )
    throw new Error("The AI edit would drop audio you did not ask to remove. Nothing was changed.");
  return result;
}
export function mergeChapters(parts: AiChapter[], title: string): AiChapter {
  const first = parts[0]!;
  const allTracks = parts.every((c) => c.tracks?.length);
  return {
    title,
    start: first.start,
    end: parts.at(-1)!.end,
    transcript: parts
      .map((c) => c.transcript)
      .filter(Boolean)
      .join("\n"),
    paths: parts.flatMap((c) => c.paths),
    icon: first.icon,
    iconUrl: first.iconUrl,
    segments: parts.flatMap(chapterSegments),
    tracks: allTracks
      ? parts.flatMap((c) => c.tracks!)
      : parts.some((c) => c.tracks?.length)
        ? undefined
        : first.tracks,
  };
}
