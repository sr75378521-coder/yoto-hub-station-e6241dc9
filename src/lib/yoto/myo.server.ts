/**
 * Server-only helpers for MYO (Make Your Own) playlist editing:
 * audio upload + transcode polling against the Yoto media API.
 */
import { yotoFetch, yotoGetJson } from "./api.server";

export interface UploadedAudio {
  sha256: string;
  duration?: number;
  fileSize?: number;
  channels?: string;
  format?: string;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface UploadUrlResponse {
  upload?: { uploadUrl?: string; uploadId?: string };
}

interface TranscodeResponse {
  transcode?: {
    transcodedSha256?: string;
    transcodedInfo?: {
      duration?: number;
      fileSize?: number;
      channels?: string;
      format?: string;
    };
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function uploadAudioToYoto(
  userId: string,
  file: { name: string; type: string; bytes: ArrayBuffer },
): Promise<UploadedAudio> {
  const hash = await sha256Hex(file.bytes);

  const urlRes = await yotoGetJson<UploadUrlResponse>(
    userId,
    `/media/transcode/audio/uploadUrl?sha256=${hash}&filename=${encodeURIComponent(file.name)}`,
  );
  const uploadId = urlRes.upload?.uploadId;
  if (!uploadId) throw new Error("Yoto did not return an upload id");

  // When uploadUrl is absent the file was already uploaded before (dedupe by sha).
  if (urlRes.upload?.uploadUrl) {
    const put = await fetch(urlRes.upload.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "audio/mpeg" },
      body: file.bytes,
    });
    if (!put.ok) {
      throw new Error(`Upload failed (${put.status}): ${(await put.text()).slice(0, 200)}`);
    }
  }

  // Poll until Yoto has transcoded the file.
  for (let i = 0; i < 40; i++) {
    const res = await yotoGetJson<TranscodeResponse>(
      userId,
      `/media/upload/${uploadId}/transcoded?loudnorm=false`,
    );
    const sha = res.transcode?.transcodedSha256;
    if (sha) {
      const info = res.transcode?.transcodedInfo ?? {};
      return {
        sha256: sha,
        duration: info.duration,
        fileSize: info.fileSize,
        channels: info.channels,
        format: info.format,
      };
    }
    await sleep(2000);
  }
  throw new Error("Timed out waiting for Yoto to process the audio");
}

export async function deleteCardRaw(userId: string, cardId: string): Promise<void> {
  const res = await yotoFetch(userId, `/content/${cardId}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`Yoto API ${res.status} delete: ${(await res.text()).slice(0, 200)}`);
  }
}
