import { useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  AUDIO_BITRATES,
  AUDIO_CODECS,
  CHANNELS,
  CONTAINERS,
  FRAMERATES,
  RESOLUTIONS,
  SAMPLE_RATES,
  SPEED_PRESETS,
  VIDEO_CODECS,
  buildArgs,
  crfRange,
  getContainer,
  normalizeSpec,
  type OutputSpec,
} from "@/lib/formats";
import { cn } from "@/lib/utils";

interface Props {
  spec: OutputSpec;
  onChange: (spec: OutputSpec) => void;
  workers: number;
  onWorkersChange: (n: number) => void;
  disabled?: boolean;
}

function Field({ label, children, hint }: { label: string; hint?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
        {hint && <span className="font-mono text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function FormatPanel({ spec, onChange, workers, onWorkersChange, disabled }: Props) {
  const container = getContainer(spec.container);
  const isVideo = container.kind === "video";
  const videoCodec = VIDEO_CODECS.find((c) => c.id === spec.videoCodec);
  const audioCodec = AUDIO_CODECS.find((c) => c.id === spec.audioCodec);
  const range = crfRange(spec.videoCodec);

  // keep codecs valid whenever the container changes
  useEffect(() => {
    const n = normalizeSpec(spec);
    if (n.videoCodec !== spec.videoCodec || n.audioCodec !== spec.audioCodec) onChange(n);
  }, [spec, onChange]);

  const set = (patch: Partial<OutputSpec>) => onChange(normalizeSpec({ ...spec, ...patch }));
  const cmd = buildArgs("input", "output", normalizeSpec(spec)).slice(4).join(" ");

  return (
    <div className={cn("space-y-5", disabled && "pointer-events-none opacity-60")}>
      <Field label="Output format">
        <div className="grid grid-cols-5 gap-1.5">
          {CONTAINERS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                const patch: Partial<OutputSpec> = { container: c.id };
                if (c.kind === "video" && !c.videoCodecs.includes(spec.videoCodec)) {
                  const v = c.videoCodecs[0] ?? "";
                  patch.videoCodec = v;
                  patch.crf = crfRange(v).default;
                }
                set(patch);
              }}
              className={cn(
                "rounded-md border px-2 py-2 font-mono text-xs transition-colors",
                spec.container === c.id
                  ? "border-primary bg-primary text-primary-foreground shadow-glow"
                  : "border-border bg-secondary text-secondary-foreground hover:border-primary/60",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {isVideo ? "Video container" : "Audio only — video streams are dropped"}
        </p>
      </Field>

      {isVideo && (
        <>
          <Field label="Video codec" hint={videoCodec?.note}>
            <Select value={spec.videoCodec} onValueChange={(v) => set({ videoCodec: v, crf: crfRange(v).default })}>
              <SelectTrigger className="w-full font-mono"><SelectValue /></SelectTrigger>
              <SelectContent>
                {container.videoCodecs.map((id) => {
                  const c = VIDEO_CODECS.find((x) => x.id === id)!;
                  return (
                    <SelectItem key={id} value={id}>
                      <span className="font-mono">{c.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{id}</span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </Field>

          {spec.videoCodec !== "copy" && (
            <>
              <Field label="Quality (CRF)" hint={`${spec.crf} — lower is better`}>
                <Slider
                  min={range.min}
                  max={range.max}
                  step={1}
                  value={[spec.crf]}
                  onValueChange={([v]) => set({ crf: v ?? range.default })}
                />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Speed">
                  <Select value={spec.speed} onValueChange={(v) => set({ speed: v })}>
                    <SelectTrigger className="w-full font-mono text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SPEED_PRESETS.map((p) => <SelectItem key={p} value={p} className="font-mono">{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Resolution">
                  <Select value={spec.resolution} onValueChange={(v) => set({ resolution: v })}>
                    <SelectTrigger className="w-full font-mono text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RESOLUTIONS.map((r) => <SelectItem key={r.id} value={r.id} className="font-mono">{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Frame rate">
                  <Select value={spec.fps} onValueChange={(v) => set({ fps: v })}>
                    <SelectTrigger className="w-full font-mono text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FRAMERATES.map((f) => <SelectItem key={f} value={f} className="font-mono">{f === "source" ? "Keep" : `${f} fps`}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </>
          )}
        </>
      )}

      <Field label="Audio codec" hint={audioCodec?.note}>
        <Select value={spec.audioCodec} onValueChange={(v) => set({ audioCodec: v })}>
          <SelectTrigger className="w-full font-mono"><SelectValue /></SelectTrigger>
          <SelectContent>
            {container.audioCodecs.map((id) => {
              const c = AUDIO_CODECS.find((x) => x.id === id)!;
              return (
                <SelectItem key={id} value={id}>
                  <span className="font-mono">{c.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{id}</span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </Field>

      {spec.audioCodec !== "copy" && (
        <div className="grid grid-cols-3 gap-3">
          {!audioCodec?.lossless && (
            <Field label="Bitrate">
              <Select value={spec.audioBitrate} onValueChange={(v) => set({ audioBitrate: v })}>
                <SelectTrigger className="w-full font-mono text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUDIO_BITRATES.map((b) => <SelectItem key={b} value={b} className="font-mono">{b} kbps</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Sample rate">
            <Select value={spec.sampleRate} onValueChange={(v) => set({ sampleRate: v })}>
              <SelectTrigger className="w-full font-mono text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SAMPLE_RATES.map((s) => <SelectItem key={s} value={s} className="font-mono">{s === "source" ? "Keep" : `${Number(s) / 1000} kHz`}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Channels">
            <Select value={spec.channels} onValueChange={(v) => set({ channels: v })}>
              <SelectTrigger className="w-full font-mono text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHANNELS.map((c) => <SelectItem key={c.id} value={c.id} className="font-mono">{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}

      <Field label="Parallel workers" hint={`${workers} at once`}>
        <Slider min={1} max={8} step={1} value={[workers]} onValueChange={([v]) => onWorkersChange(v ?? 2)} />
        <p className="text-[11px] text-muted-foreground">
          More workers = faster batches, but each uses RAM. 2–4 is the sweet spot on most machines.
        </p>
      </Field>

      <div className="rounded-md border border-border bg-background/60 p-3">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Exact command per file</p>
        <code className="block break-all font-mono text-[11px] leading-relaxed text-primary">ffmpeg -i input {cmd}</code>
      </div>
    </div>
  );
}
