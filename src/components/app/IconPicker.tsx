import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { listIcons, uploadIcon, type YotoIcon } from "@/lib/yoto/icons.functions";
import { IconDesignerButton } from "@/components/app/IconDesigner";


export function iconSrc(ref?: string | null, ticket?: string | null): string | undefined {
  if (!ref) return undefined;
  const id = ref.startsWith("yoto:#") ? ref.slice(6) : ref;
  if (!id) return undefined;
  // Always go through our proxy — Yoto's media host blocks hot-linked icons
  // and, for account/library icons, requires the user's Yoto access token.
  // The ticket lets the (cookie-less) <img> request prove which user it's
  // for so the proxy can attach that token.
  const t = ticket ? `&t=${encodeURIComponent(ticket)}` : "";
  return `/api/yoto/icon?id=${encodeURIComponent(id)}${t}`;
}


export function useYotoIcons() {
  const fetchIcons = useServerFn(listIcons);
  return useQuery({
    queryKey: ["yoto-icons"],
    queryFn: () => fetchIcons(),
    staleTime: 5 * 60 * 1000,
  });
}

export function IconUploadButton({ onUploaded }: { onUploaded?: (icon: YotoIcon) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const doUpload = useServerFn(uploadIcon);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const handle = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await doUpload({ data: fd });
        if (!res.success || !res.icon) {
          toast.error(`${file.name}: ${res.error ?? "upload failed"}`);
          continue;
        }
        toast.success(`Added "${res.icon.title}" to your icons`);
        onUploaded?.(res.icon);
      }
      await qc.invalidateQueries({ queryKey: ["yoto-icons"] });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/gif,image/jpeg"
        multiple
        className="hidden"
        onChange={(e) => void handle(e.target.files)}
      />
      <Button size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        Upload icon
      </Button>
    </>
  );
}

/** Swaps a broken icon <img> for a placeholder glyph when the asset 403/404s. */
function handleIconImgError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (img.dataset.fallback === "1") return; // already showing the placeholder
  img.dataset.fallback = "1";
  img.src = ICON_PLACEHOLDER_SRC;
}

// Small inline pixel-art "?" placeholder — no network request, so it can never
// itself 403/404.
const ICON_PLACEHOLDER_SRC =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
      `<rect width="16" height="16" rx="3" fill="#c9c9d1"/>` +
      `<text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="10" fill="#6b6b76">?</text>` +
      `</svg>`,
  );

export function IconGrid({
  icons,
  selected,
  onPick,
}: {
  icons: YotoIcon[];
  selected?: string;
  onPick: (icon: YotoIcon) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
      {icons.map((icon) => (
        <button
          key={icon.mediaId}
          type="button"
          title={icon.title}
          onClick={() => onPick(icon)}
          className={`flex aspect-square items-center justify-center rounded-xl border-2 bg-secondary/60 p-1.5 transition hover:scale-105 ${
            selected === icon.ref ? "border-primary" : "border-transparent"
          }`}
        >
          <img
            src={iconSrc(icon.url || icon.ref, icon.ticket)}
            alt={icon.title}
            className="size-full pixel-icon object-contain"
            loading="lazy"
            onError={handleIconImgError}
          />
        </button>
      ))}
    </div>
  );
}

export function IconPicker({
  value,
  onChange,
  label = "Choose icon",
}: {
  value?: string;
  onChange: (ref: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data, isLoading } = useYotoIcons();

  const icons = useMemo(() => {
    const all = data?.icons ?? [];
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((i) => i.title.toLowerCase().includes(needle)) : all;
  }, [data, q]);

  // Prefer the URL Yoto returned for this icon, falling back to the proxy.
  const known = (data?.icons ?? []).find((i) => i.ref === value || i.mediaId === value);
  const src = iconSrc(known?.url || value, known?.ticket);


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          title={label}
          className="flex size-9 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-border bg-secondary/60 transition hover:border-primary"
        >
          {src ? (
            <img
              src={src}
              alt=""
              className="size-6 pixel-icon object-contain"
              onError={handleIconImgError}
            />
          ) : (
            <Sparkles className="size-4 text-primary/70" />
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pick an icon</DialogTitle>
          <DialogDescription>
            Shown on your Yoto player's screen while this track plays.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search icons…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <IconDesignerButton onCreated={(icon) => onChange(icon.ref)} />
          <IconUploadButton onUploaded={(icon) => onChange(icon.ref)} />
        </div>

        <div className="max-h-[50vh] overflow-y-auto pr-1">
          {isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading icons…
            </div>
          ) : icons.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No icons found{data?.error ? `: ${data.error}` : "."}
            </p>
          ) : (
            <IconGrid
              icons={icons}
              selected={value}
              onPick={(icon) => {
                onChange(icon.ref);
                setOpen(false);
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
