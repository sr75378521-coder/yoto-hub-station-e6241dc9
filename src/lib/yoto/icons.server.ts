/**
 * Server-only helpers for Yoto display icons (16x16 pixel art shown on the
 * player screen). Handles listing the user's icons, the public Yoto icon
 * gallery, and uploading new ones.
 */
import { yotoFetch, yotoGetJson } from "./api.server";

export interface YotoIcon {
  mediaId: string;
  title: string;
  url: string;
  /** Value stored on a card: `yoto:#<mediaId>` */
  ref: string;
  source: "mine" | "yoto";
}

export function iconDisplayUrl(ref?: string | null): string | undefined {
  if (!ref) return undefined;
  if (/^https?:\/\//.test(ref)) return ref;
  const id = ref.startsWith("yoto:#") ? ref.slice(6) : ref;
  if (!id) return undefined;
  return `https://media-secure.yotoplay.com/icons/${id}?width=64&height=64`;
}

function normalize(raw: any, source: "mine" | "yoto"): YotoIcon | null {
  const mediaId: string | undefined =
    raw?.mediaId ?? raw?.displayIconId ?? raw?.id ?? undefined;
  if (!mediaId) return null;
  const url: string =
    raw?.url ?? raw?.displayIconUrl ?? iconDisplayUrl(mediaId) ?? "";
  return {
    mediaId,
    title: raw?.title ?? raw?.name ?? "Icon",
    url,
    ref: `yoto:#${mediaId}`,
    source,
  };
}

function extract(res: any): any[] {
  if (Array.isArray(res)) return res;
  return (
    res?.displayIcons ??
    res?.icons ??
    res?.results ??
    res?.data ??
    []
  );
}

export async function listIconsRaw(userId: string): Promise<YotoIcon[]> {
  const [mine, yoto] = await Promise.allSettled([
    yotoGetJson<any>(userId, "/media/displayIcons/user/me"),
    yotoGetJson<any>(userId, "/media/displayIcons/user/yoto"),
  ]);

  const out: YotoIcon[] = [];
  const seen = new Set<string>();
  const push = (list: any[], source: "mine" | "yoto") => {
    for (const raw of list) {
      const icon = normalize(raw, source);
      if (icon && !seen.has(icon.mediaId)) {
        seen.add(icon.mediaId);
        out.push(icon);
      }
    }
  };

  if (mine.status === "fulfilled") push(extract(mine.value), "mine");
  if (yoto.status === "fulfilled") push(extract(yoto.value), "yoto");
  return out;
}

export async function uploadIconRaw(
  userId: string,
  file: { name: string; type: string; bytes: ArrayBuffer },
): Promise<YotoIcon> {
  const res = await yotoFetch(
    userId,
    `/media/displayIcons/user/me/upload?autoConvert=true&filename=${encodeURIComponent(file.name)}`,
    {
      method: "POST",
      headers: { "Content-Type": file.type || "image/png" },
      body: file.bytes,
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Yoto icon upload ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = text ? JSON.parse(text) : {};
  const icon = normalize(json?.displayIcon ?? json, "mine");
  if (!icon) throw new Error("Yoto did not return an icon id");
  return { ...icon, title: file.name.replace(/\.[^.]+$/, "") };
}
