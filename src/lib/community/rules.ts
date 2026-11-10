import type { AiChapter, PlanId } from "@/lib/ai-yoto/plans";
import { PLANS, mergeChapters } from "@/lib/ai-yoto/plans";
export interface SharedChapter {
  title: string;
  duration: number;
  path?: string;
  url?: string;
}
export function safeArchiveUrl(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    !["archive.org", "www.archive.org"].includes(u.hostname) ||
    !u.pathname.startsWith("/download/") ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  )
    throw new Error("Only public Internet Archive download links are supported.");
  u.hostname = "archive.org";
  return u.href;
}
export function validateSharedChapters(
  value: unknown,
  owner: string,
  playlist: string,
): SharedChapter[] {
  if (!Array.isArray(value) || !value.length || value.length > 500)
    throw new Error("This playlist has no supported chapters.");
  return value.map((c) => {
    if (
      !c ||
      typeof c.title !== "string" ||
      typeof c.duration !== "number" ||
      !Number.isFinite(c.duration) ||
      c.duration < 0
    )
      throw new Error("Invalid chapter.");
    if (
      typeof c.path === "string" &&
      c.path.startsWith(`${owner}/${playlist}/`) &&
      !c.path.includes("..")
    )
      return { title: c.title.slice(0, 120), duration: c.duration, path: c.path };
    if (typeof c.url === "string")
      return { title: c.title.slice(0, 120), duration: c.duration, url: safeArchiveUrl(c.url) };
    throw new Error("Private audio references cannot be shared.");
  });
}
export const TOOL_RANK = { number: 1, tidy: 2, group: 3 } as const;
export type PlaylistTool = keyof typeof TOOL_RANK;
export function transformChapters(
  plan: PlanId,
  tool: PlaylistTool,
  chapters: AiChapter[],
  minutes = 10,
): AiChapter[] {
  if (PLANS[plan].rank < TOOL_RANK[tool])
    throw new Error("This tool requires a higher membership plan.");
  if (tool === "number")
    return chapters.map((c, i) => ({
      ...c,
      title: `${i + 1}. ${c.title.replace(/^\d+[.)\-]\s*/, "")}`.slice(0, 120),
    }));
  if (tool === "tidy")
    return chapters.map((c) => ({
      ...c,
      title: c.title
        .replace(/\.[a-z0-9]{2,5}$/i, "")
        .replace(/[_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120),
    }));
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 120)
    throw new Error("Choose 1–120 minutes.");
  const groups: AiChapter[][] = [];
  let group: AiChapter[] = [],
    duration = 0;
  for (const chapter of chapters) {
    const seconds = Math.max(0, chapter.end - chapter.start);
    if (group.length && duration + seconds > minutes * 60) {
      groups.push(group);
      group = [];
      duration = 0;
    }
    group.push(chapter);
    duration += seconds;
  }
  if (group.length) groups.push(group);
  return groups.map((g) => {
    const first = g[0];
    if (!first) throw new Error("Empty group");
    return mergeChapters(g, first.title);
  });
}
