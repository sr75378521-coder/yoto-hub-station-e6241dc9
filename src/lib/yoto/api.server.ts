/**
 * Server-side Yoto REST helper. Attaches bearer token, auto-refreshes on 401.
 */
import { YOTO_API_BASE } from "./config";
import { getValidAccessToken } from "./tokens.server";

export class YotoNotConnectedError extends Error {
  constructor() {
    super("Yoto account not connected");
    this.name = "YotoNotConnectedError";
  }
}

export async function yotoFetch(
  userId: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getValidAccessToken(userId);
  if (!token) throw new YotoNotConnectedError();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const url = path.startsWith("http") ? path : `${YOTO_API_BASE}${path}`;
  return fetch(url, { ...init, headers });
}

export async function yotoGetJson<T = unknown>(userId: string, path: string): Promise<T> {
  const res = await yotoFetch(userId, path);
  const text = await res.text();
  if (!res.ok) throw new Error(`Yoto API ${res.status} ${path}: ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export async function yotoPost<T = unknown>(
  userId: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await yotoFetch(userId, path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Yoto API ${res.status} ${path}: ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export async function yotoPut<T = unknown>(
  userId: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await yotoFetch(userId, path, {
    method: "PUT",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Yoto API ${res.status} ${path}: ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

/**
 * MYO / library cards must be "resolved" to get signed, playable track URLs.
 * `/card/resolve/{id}` returns real https mp3 urls; `/content/{id}` returns
 * `yoto:#<sha256>` placeholders that a browser cannot play.
 */
export async function resolveCardRaw(
  userId: string,
  cardId: string,
): Promise<Record<string, any>> {
  let resolved: Record<string, any> | null = null;
  try {
    resolved = await yotoGetJson<Record<string, any>>(userId, `/card/resolve/${cardId}`);
  } catch {
    resolved = null;
  }
  const hasChapters = (o: any) => {
    const c = o?.card ?? o;
    return Array.isArray(c?.content?.chapters) && c.content.chapters.length > 0;
  };
  if (resolved && hasChapters(resolved)) return resolved;

  try {
    const content = await yotoGetJson<Record<string, any>>(userId, `/content/${cardId}`);
    if (content) return content;
  } catch (e) {
    if (!resolved) throw e;
  }
  return resolved ?? {};
}
