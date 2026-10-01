export type MediaKind = "video" | "audio";

export interface Container {
  id: string;
  label: string;
  ext: string;
  mime: string;
  kind: MediaKind;
  videoCodecs: string[]; // ids from VIDEO_CODECS
  audioCodecs: string[]; // ids from AUDIO_CODECS
}

export interface Codec {
  id: string; // ffmpeg encoder name
  label: string;
  note: string;
  lossless?: boolean;
}

export const VIDEO_CODECS: Codec[] = [
  { id: "libx264", label: "H.264 / AVC", note: "Most compatible" },
  { id: "libx265", label: "H.265 / HEVC", note: "~40% smaller than H.264" },
  { id: "libvpx-vp9", label: "VP9", note: "Open, great for web" },
  { id: "libvpx", label: "VP8", note: "Legacy WebM" },
  { id: "copy", label: "Copy (no re-encode)", note: "Instant, keeps original stream" },
];

export const AUDIO_CODECS: Codec[] = [
  { id: "aac", label: "AAC", note: "Standard for MP4/M4A" },
  { id: "libmp3lame", label: "MP3", note: "Plays everywhere" },
  { id: "libopus", label: "Opus", note: "Best quality per bit" },
  { id: "libvorbis", label: "Vorbis", note: "Open, OGG" },
  { id: "flac", label: "FLAC", note: "Lossless, compressed", lossless: true },
  { id: "pcm_s16le", label: "PCM 16-bit", note: "Uncompressed WAV", lossless: true },
  { id: "pcm_s24le", label: "PCM 24-bit", note: "Studio WAV", lossless: true },
  { id: "copy", label: "Copy (no re-encode)", note: "Instant, keeps original stream" },
];

export const CONTAINERS: Container[] = [
  { id: "mp4", label: "MP4", ext: "mp4", mime: "video/mp4", kind: "video", videoCodecs: ["libx264", "libx265", "copy"], audioCodecs: ["aac", "libmp3lame", "libopus", "copy"] },
  { id: "mkv", label: "MKV", ext: "mkv", mime: "video/x-matroska", kind: "video", videoCodecs: ["libx264", "libx265", "libvpx-vp9", "libvpx", "copy"], audioCodecs: ["aac", "libmp3lame", "libopus", "libvorbis", "flac", "pcm_s16le", "copy"] },
  { id: "webm", label: "WebM", ext: "webm", mime: "video/webm", kind: "video", videoCodecs: ["libvpx-vp9", "libvpx"], audioCodecs: ["libopus", "libvorbis"] },
  { id: "mov", label: "MOV", ext: "mov", mime: "video/quicktime", kind: "video", videoCodecs: ["libx264", "libx265", "copy"], audioCodecs: ["aac", "pcm_s16le", "pcm_s24le", "copy"] },
  { id: "mp3", label: "MP3", ext: "mp3", mime: "audio/mpeg", kind: "audio", videoCodecs: [], audioCodecs: ["libmp3lame"] },
  { id: "m4a", label: "M4A", ext: "m4a", mime: "audio/mp4", kind: "audio", videoCodecs: [], audioCodecs: ["aac"] },
  { id: "opus", label: "Opus", ext: "opus", mime: "audio/ogg", kind: "audio", videoCodecs: [], audioCodecs: ["libopus"] },
  { id: "ogg", label: "OGG", ext: "ogg", mime: "audio/ogg", kind: "audio", videoCodecs: [], audioCodecs: ["libvorbis", "libopus", "flac"] },
  { id: "flac", label: "FLAC", ext: "flac", mime: "audio/flac", kind: "audio", videoCodecs: [], audioCodecs: ["flac"] },
  { id: "wav", label: "WAV", ext: "wav", mime: "audio/wav", kind: "audio", videoCodecs: [], audioCodecs: ["pcm_s16le", "pcm_s24le"] },
];

export const RESOLUTIONS = [
  { id: "source", label: "Keep original" },
  { id: "2160", label: "4K (2160p)" },
  { id: "1440", label: "1440p" },
  { id: "1080", label: "1080p" },
  { id: "720", label: "720p" },
  { id: "480", label: "480p" },
  { id: "360", label: "360p" },
];

export const FRAMERATES = ["source", "24", "25", "30", "50", "60"];
export const SPEED_PRESETS = ["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow"];
export const AUDIO_BITRATES = ["64", "96", "128", "160", "192", "256", "320"];
export const SAMPLE_RATES = ["source", "22050", "44100", "48000", "96000"];
export const CHANNELS = [
  { id: "source", label: "Keep original" },
  { id: "1", label: "Mono" },
  { id: "2", label: "Stereo" },
];

export interface OutputSpec {
  container: string;
  videoCodec: string;
  audioCodec: string;
  crf: number; // 0-51 for x264/x265, 0-63 for vpx
  speed: string;
  resolution: string;
  fps: string;
  audioBitrate: string; // kbps
  sampleRate: string;
  channels: string;
}

export const DEFAULT_SPEC: OutputSpec = {
  container: "mp4",
  videoCodec: "libx264",
  audioCodec: "aac",
  crf: 23,
  speed: "veryfast",
  resolution: "source",
  fps: "source",
  audioBitrate: "192",
  sampleRate: "source",
  channels: "source",
};

export function getContainer(id: string): Container {
  return CONTAINERS.find((c) => c.id === id) ?? (CONTAINERS[0] as Container);
}

/** Make sure codecs are valid for the chosen container. */
export function normalizeSpec(spec: OutputSpec): OutputSpec {
  const c = getContainer(spec.container);
  const videoCodec =
    c.kind === "video" ? (c.videoCodecs.includes(spec.videoCodec) ? spec.videoCodec : (c.videoCodecs[0] ?? "")) : "";
  const audioCodec = c.audioCodecs.includes(spec.audioCodec) ? spec.audioCodec : (c.audioCodecs[0] ?? "aac");
  return { ...spec, videoCodec, audioCodec };
}

export function outputFileName(inputName: string, spec: OutputSpec): string {
  const c = getContainer(spec.container);
  const base = inputName.replace(/\.[^.]+$/, "");
  return `${base}.${c.ext}`;
}

export function crfRange(videoCodec: string): { min: number; max: number; default: number } {
  if (videoCodec.startsWith("libvpx")) return { min: 0, max: 63, default: 31 };
  if (videoCodec === "libx265") return { min: 0, max: 51, default: 28 };
  return { min: 0, max: 51, default: 23 };
}

/** Build the exact ffmpeg argument list for one file. */
export function buildArgs(input: string, output: string, spec: OutputSpec): string[] {
  const c = getContainer(spec.container);
  const args: string[] = ["-hide_banner", "-y", "-i", input];

  if (c.kind === "video") {
    // optional maps: audio-only inputs still convert into a video container
    args.push("-map", "0:v:0?", "-map", "0:a:0?", "-sn", "-dn", "-threads", "4");
    args.push("-c:v", spec.videoCodec);

    if (spec.videoCodec !== "copy") {
      const filters: string[] = [];
      if (spec.resolution !== "source") {
        // keep aspect ratio, even dimensions
        filters.push(`scale=-2:'min(${spec.resolution},ih)'`);
      }
      if (filters.length) args.push("-vf", filters.join(","));
      if (spec.fps !== "source") args.push("-r", spec.fps);

      if (spec.videoCodec === "libx264" || spec.videoCodec === "libx265") {
        args.push("-preset", spec.speed, "-crf", String(spec.crf), "-pix_fmt", "yuv420p");
        if (spec.videoCodec === "libx265") {
          args.push("-x265-params", "log-level=error");
          if (c.id === "mp4" || c.id === "mov") args.push("-tag:v", "hvc1");
        }
      } else if (spec.videoCodec.startsWith("libvpx")) {
        const cpu = ["ultrafast", "superfast", "veryfast"].includes(spec.speed) ? "5" : ["faster", "fast"].includes(spec.speed) ? "3" : "1";
        args.push("-crf", String(spec.crf), "-b:v", "0", "-deadline", "realtime", "-cpu-used", cpu, "-row-mt", "1");
        if (spec.videoCodec === "libvpx-vp9") args.push("-pix_fmt", "yuv420p");
      }
    }
    if (c.id === "mp4" || c.id === "mov") args.push("-movflags", "+faststart");
  } else {
    args.push("-vn", "-sn", "-dn", "-map", "0:a:0", "-threads", "4");
  }

  args.push("-c:a", spec.audioCodec);
  if (spec.audioCodec !== "copy") {
    const codec = AUDIO_CODECS.find((a) => a.id === spec.audioCodec);
    if (!codec?.lossless) args.push("-b:a", `${spec.audioBitrate}k`);
    if (spec.sampleRate !== "source") args.push("-ar", spec.sampleRate);
    else if (spec.audioCodec === "libopus") args.push("-ar", "48000"); // opus only supports 48k
    if (spec.channels !== "source") args.push("-ac", spec.channels);
  }

  args.push(output);
  return args;
}

export function describeSpec(spec: OutputSpec): string {
  const c = getContainer(spec.container);
  const v = VIDEO_CODECS.find((x) => x.id === spec.videoCodec);
  const a = AUDIO_CODECS.find((x) => x.id === spec.audioCodec);
  const parts = [c.label];
  if (c.kind === "video" && v) parts.push(v.label);
  if (a) parts.push(a.label);
  return parts.join(" · ");
}

export const ACCEPTED_INPUT =
  ".mp4,.mkv,.webm,.mov,.avi,.flv,.wmv,.m4v,.mpg,.mpeg,.ts,.3gp,.mp3,.m4a,.aac,.wav,.flac,.ogg,.opus,.wma,.aiff,.aif,.mka,video/*,audio/*";
