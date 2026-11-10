import { createParser } from "eventsource-parser";

export async function readTranscript(response: Response): Promise<string> {
  if (!response.body) throw new Error("Transcription returned no audio result.");
  let text = "",
    done = false,
    failure = "";
  const parser = createParser({
    onEvent(event) {
      if (event.data === "[DONE]") return;
      const data = JSON.parse(event.data);
      if (data.type === "transcript.text.delta") text += data.delta ?? "";
      if (data.type === "transcript.text.done") {
        text = data.text ?? text;
        done = true;
      }
      if (data.type === "error" || data.error)
        failure = data.error?.message ?? data.message ?? "Transcription failed.";
    },
  });
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      parser.feed(decoder.decode(chunk.value, { stream: true }));
    }
    parser.feed(decoder.decode());
  } finally {
    reader.releaseLock();
  }
  if (failure) throw new Error(failure);
  if (!done || !text.trim())
    throw new Error("Transcription did not finish or no speech was found. Your audio is saved.");
  return text.trim();
}

export function wavSeconds(bytes: ArrayBuffer) {
  const view = new DataView(bytes);
  const tag = (offset: number) => String.fromCharCode(...new Uint8Array(bytes, offset, 4));
  if (bytes.byteLength < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE")
    throw new Error("A complete WAV recording is required.");
  let rate = 0,
    size = 0;
  for (let offset = 12; offset + 8 <= bytes.byteLength;) {
    const length = view.getUint32(offset + 4, true),
      type = tag(offset);
    if (offset + 8 + length > bytes.byteLength) throw new Error("Incomplete WAV recording.");
    if (type === "fmt " && length >= 16) {
      if (view.getUint16(offset + 8, true) !== 1) throw new Error("PCM WAV is required.");
      rate = view.getUint32(offset + 16, true);
    }
    if (type === "data") size += length;
    offset += 8 + length + (length % 2);
  }
  if (!rate || !size) throw new Error("Empty WAV recording.");
  return size / rate;
}
