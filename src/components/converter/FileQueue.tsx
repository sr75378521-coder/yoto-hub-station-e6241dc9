import { AlertCircle, Check, Download, FileAudio, FileVideo, Loader2, X } from "lucide-react";
import type { Job } from "@/lib/converter-engine";
import { cn } from "@/lib/utils";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

interface Props {
  jobs: Job[];
  running: boolean;
  onRemove: (id: string) => void;
}

export function FileQueue({ jobs, running, onRemove }: Props) {
  return (
    <ul className="divide-y divide-border">
      {jobs.map((job, i) => {
        const isAudio = job.file.type.startsWith("audio/");
        const Icon = isAudio ? FileAudio : FileVideo;
        const pct = Math.round(job.progress * 100);
        const secs = job.finishedAt && job.startedAt ? ((job.finishedAt - job.startedAt) / 1000).toFixed(1) : null;
        return (
          <li key={job.id} className="group relative grid grid-cols-[2rem_1fr_auto] items-center gap-3 px-4 py-3">
            <span className="font-mono text-[11px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm">{job.file.name}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                <span>{formatBytes(job.file.size)}</span>
                {job.status === "done" && job.outputSize !== undefined && (
                  <>
                    <span>→</span>
                    <span className="text-success">{formatBytes(job.outputSize)}</span>
                    <span className="truncate">{job.outputName}</span>
                    {secs && <span>· {secs}s</span>}
                  </>
                )}
                {job.status === "error" && <span className="truncate text-destructive">{job.error}</span>}
                {job.status === "cancelled" && <span>cancelled</span>}
                {job.status === "queued" && <span>queued</span>}
              </div>
              {job.status === "converting" && (
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bar-shimmer animate-shimmer transition-[width] duration-300"
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {job.status === "converting" && (
                <span className="flex items-center gap-1.5 font-mono text-xs text-primary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {pct}%
                </span>
              )}
              {job.status === "done" && job.outputBlob && (
                <button
                  type="button"
                  onClick={() => downloadBlob(job.outputBlob!, job.outputName ?? "output")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-success/40 bg-success/10 px-2.5 py-1 font-mono text-xs text-success transition-colors hover:bg-success/20"
                >
                  <Check className="h-3.5 w-3.5" /> <Download className="h-3.5 w-3.5" />
                </button>
              )}
              {job.status === "error" && <AlertCircle className="h-4 w-4 text-destructive" />}
              {!running && (
                <button
                  type="button"
                  aria-label={`Remove ${job.file.name}`}
                  onClick={() => onRemove(job.id)}
                  className={cn(
                    "rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
