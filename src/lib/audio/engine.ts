/**
 * Browser-side audio editing engine (Audacity-style essentials + effects).
 * Everything runs on OfflineAudioContext / raw Float32 buffers — no server.
 */

export type Ctx = AudioContext;

function AudioCtor(): typeof AudioContext {
  return window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
}

let shared: AudioContext | null = null;
export function audioCtx(): AudioContext {
  if (!shared) shared = new (AudioCtor())();
  return shared;
}

export async function decodeAudio(data: ArrayBuffer): Promise<AudioBuffer> {
  return await audioCtx().decodeAudioData(data.slice(0));
}

export async function decodeFile(file: File): Promise<AudioBuffer> {
  return decodeAudio(await file.arrayBuffer());
}

export async function decodeUrl(url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't fetch audio (${res.status})`);
  return decodeAudio(await res.arrayBuffer());
}

function empty(channels: number, length: number, rate: number): AudioBuffer {
  const OC =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  return new OC(channels, Math.max(1, length), rate).createBuffer(
    channels,
    Math.max(1, length),
    rate,
  );
}

export function sliceBuffer(buf: AudioBuffer, start: number, end: number): AudioBuffer {
  const s = Math.max(0, Math.floor(start * buf.sampleRate));
  const e = Math.min(buf.length, Math.floor(end * buf.sampleRate));
  const len = Math.max(1, e - s);
  const out = empty(buf.numberOfChannels, len, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    out.getChannelData(c).set(buf.getChannelData(c).subarray(s, e));
  }
  return out;
}

/** Remove a middle region (cut) and join the remainder. */
export function cutRegion(buf: AudioBuffer, start: number, end: number): AudioBuffer {
  const head = sliceBuffer(buf, 0, start);
  const tail = sliceBuffer(buf, end, buf.duration);
  return concat([head, tail], 0);
}

export function applyGain(buf: AudioBuffer, db: number): AudioBuffer {
  const k = Math.pow(10, db / 20);
  const out = empty(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < src.length; i++) dst[i] = Math.max(-1, Math.min(1, src[i]! * k));
  }
  return out;
}

export function normalize(buf: AudioBuffer, targetDb = -1): AudioBuffer {
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]!));
  }
  if (peak === 0) return buf;
  const target = Math.pow(10, targetDb / 20);
  return applyGain(buf, 20 * Math.log10(target / peak));
}

export function fade(buf: AudioBuffer, inSec: number, outSec: number): AudioBuffer {
  const out = empty(buf.numberOfChannels, buf.length, buf.sampleRate);
  const fi = Math.floor(inSec * buf.sampleRate);
  const fo = Math.floor(outSec * buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < src.length; i++) {
      let g = 1;
      if (fi > 0 && i < fi) g *= i / fi;
      if (fo > 0 && i > src.length - fo) g *= Math.max(0, (src.length - i) / fo);
      dst[i] = src[i]! * g;
    }
  }
  return out;
}

export function reverse(buf: AudioBuffer): AudioBuffer {
  const out = empty(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < src.length; i++) dst[i] = src[src.length - 1 - i]!;
  }
  return out;
}

export function toMono(buf: AudioBuffer): AudioBuffer {
  if (buf.numberOfChannels === 1) return buf;
  const out = empty(1, buf.length, buf.sampleRate);
  const dst = out.getChannelData(0);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c);
    for (let i = 0; i < src.length; i++) dst[i] = (dst[i] ?? 0) + src[i]! / buf.numberOfChannels;
  }
  return out;
}

/** Strip leading/trailing near-silence. */
export function trimSilence(buf: AudioBuffer, thresholdDb = -50): AudioBuffer {
  const th = Math.pow(10, thresholdDb / 20);
  const d = buf.getChannelData(0);
  let s = 0;
  let e = d.length - 1;
  while (s < d.length && Math.abs(d[s]!) < th) s++;
  while (e > s && Math.abs(d[e]!) < th) e--;
  return sliceBuffer(buf, s / buf.sampleRate, (e + 1) / buf.sampleRate);
}

/** Change tempo+pitch together (playback-rate style, like Audacity's Change Speed). */
export async function changeSpeed(buf: AudioBuffer, rate: number): Promise<AudioBuffer> {
  if (Math.abs(rate - 1) < 0.001) return buf;
  return renderWith(buf, Math.ceil(buf.length / rate), (ctx, src) => {
    src.playbackRate.value = rate;
    src.connect(ctx.destination);
  });
}

export interface EqSettings {
  low: number;
  mid: number;
  high: number;
}

export async function equalize(buf: AudioBuffer, eq: EqSettings): Promise<AudioBuffer> {
  if (!eq.low && !eq.mid && !eq.high) return buf;
  return renderWith(buf, buf.length, (ctx, src) => {
    const low = ctx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 250;
    low.gain.value = eq.low;
    const mid = ctx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 1200;
    mid.Q.value = 0.9;
    mid.gain.value = eq.mid;
    const high = ctx.createBiquadFilter();
    high.type = "highshelf";
    high.frequency.value = 4500;
    high.gain.value = eq.high;
    src.connect(low).connect(mid).connect(high).connect(ctx.destination);
  });
}

async function renderWith(
  buf: AudioBuffer,
  length: number,
  wire: (ctx: OfflineAudioContext, src: AudioBufferSourceNode) => void,
): Promise<AudioBuffer> {
  const OC =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  const ctx = new OC(buf.numberOfChannels, length, buf.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  wire(ctx, src);
  src.start();
  return await ctx.startRendering();
}

/** Join buffers end to end, optionally crossfading `xfade` seconds between them. */
export function concat(buffers: AudioBuffer[], xfade = 0): AudioBuffer {
  const list = buffers.filter((b) => b && b.length > 0);
  if (list.length === 0) return empty(2, 1, 44100);
  if (list.length === 1) return list[0]!;
  const rate = list[0]!.sampleRate;
  const channels = Math.max(...list.map((b) => b.numberOfChannels));
  const x = Math.floor(xfade * rate);
  const total = list.reduce((a, b) => a + b.length, 0) - x * (list.length - 1);
  const out = empty(channels, Math.max(1, total), rate);

  let offset = 0;
  list.forEach((b, bi) => {
    for (let c = 0; c < channels; c++) {
      const src = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
      const dst = out.getChannelData(c);
      for (let i = 0; i < src.length; i++) {
        const pos = offset + i;
        if (pos >= dst.length) break;
        let g = 1;
        if (x > 0 && bi > 0 && i < x) g = i / x;
        if (x > 0 && bi < list.length - 1 && i > src.length - x) g = (src.length - i) / x;
        dst[pos] = Math.max(-1, Math.min(1, (dst[pos] ?? 0) + src[i]! * g));
      }
    }
    offset += b.length - x;
  });
  return out;
}

export function peaks(buf: AudioBuffer, buckets = 120): number[] {
  const d = buf.getChannelData(0);
  const size = Math.floor(d.length / buckets) || 1;
  const out: number[] = [];
  for (let i = 0; i < buckets; i++) {
    let max = 0;
    for (let j = 0; j < size; j += 8) max = Math.max(max, Math.abs(d[i * size + j] ?? 0));
    out.push(max);
  }
  return out;
}

export function encodeWav(buf: AudioBuffer): Blob {
  const channels = buf.numberOfChannels;
  const length = buf.length * channels * 2 + 44;
  const arr = new ArrayBuffer(length);
  const view = new DataView(arr);
  const write = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, length - 8, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buf.sampleRate, true);
  view.setUint32(28, buf.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, length - 44, true);

  let off = 44;
  const data = Array.from({ length: channels }, (_, c) => buf.getChannelData(c));
  for (let i = 0; i < buf.length; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, data[c]![i]!));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([arr], { type: "audio/wav" });
}

export const fmtTime = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
