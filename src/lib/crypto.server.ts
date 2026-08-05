/**
 * AES-256-GCM helpers for encrypting Yoto tokens at rest.
 * Server-only. The key is derived from YOTO_TOKEN_ENC_KEY (hex or base64).
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash, createHmac } from "node:crypto";

function key(): Buffer {
  const raw = process.env.YOTO_TOKEN_ENC_KEY;
  if (!raw) throw new Error("YOTO_TOKEN_ENC_KEY is not set");
  // Normalize to a 32-byte key via SHA-256 so any secret length works.
  return createHash("sha256").update(raw).digest();
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptToken(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/**
 * Short-lived, signed ticket that lets the (unauthenticated, cookie-less)
 * `/api/yoto/icon` <img>-tag proxy route know which user's Yoto access token
 * to use, without ever putting the raw access token in a URL. Reuses the
 * same at-rest encryption key so no extra secret needs to be configured.
 */
export function signIconTicket(userId: string, expiresAtMs: number): string {
  const payload = `${userId}.${expiresAtMs}`;
  const sig = createHmac("sha256", key()).update(payload).digest("base64url");
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sig}`;
}

export function verifyIconTicket(ticket: string): { userId: string } | null {
  const parts = ticket.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", key()).update(payload).digest("base64url");
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;

  const dot = payload.lastIndexOf(".");
  if (dot === -1) return null;
  const userId = payload.slice(0, dot);
  const exp = Number(payload.slice(dot + 1));
  if (!userId || !Number.isFinite(exp) || Date.now() > exp) return null;
  return { userId };
}
