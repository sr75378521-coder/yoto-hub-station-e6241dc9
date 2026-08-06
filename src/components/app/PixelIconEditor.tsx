import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  Brush,
  Eraser,
  Image as ImageIcon,
  Loader2,
  Pipette,
  Play,
  Plus,
  Save,
  Square,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { uploadIcon } from "@/lib/yoto/icons.functions";

const SIZE = 16;
const CELLS = SIZE * SIZE;
const EMPTY = "";

const PALETTE = [
  "#ffffff", "#c9ced6", "#8a929e", "#4b5563", "#1f2937", "#000000",
  "#ff4d4f", "#ff7a45", "#ffc53d", "#ffe58f", "#95de64", "#52c41a",
  "#13c2c2", "#40a9ff", "#2f54eb", "#9254de", "#f759ab", "#a0522d",
];

type Frame = string[];

const blankFrame = (): Frame => Array<string>(CELLS).fill(EMPTY);

function frameToPngDataUrl(frame: Frame, scale = 1): string {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE * scale;
  canvas.height = SIZE * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  frame.forEach((color, i) => {
    if (!color) return;
    ctx.fillStyle = color;
    ctx.fillRect((i % SIZE) * scale, Math.floor(i / SIZE) * scale, scale, scale);
  });
  return canvas.toDataURL("image/png");
}

async function imageFileToFrame(file: File): Promise<Frame> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read that image"));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
    const frame = blankFrame();
    for (let i = 0; i < CELLS; i++) {
      const [r, g, b, a] = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3]];
      frame[i] =
        a < 40
          ? EMPTY
          : `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    }
    return frame;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PixelIconEditor({
  onSaved,
  compact = false,
}: {
  onSaved?: (ref: string) => void;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const doUploadIcon = useServerFn(uploadIcon);
  const importRef = useRef<HTMLInputElement>(null);

  const [frames, setFrames] = useState<Frame[]>([blankFrame()]);
  const [active, setActive] = useState(0);
  const [color, setColor] = useState(PALETTE[10]!);
  const [tool, setTool] = useState<"brush" | "eraser" | "picker">("brush");
  const [name, setName] = useState("my-icon");
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const painting = useRef(false);

  const frame = frames[active] ?? blankFrame();

  useEffect(() => {
    const up = () => (painting.current = false);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const id = setInterval(() => setActive((a) => (a + 1) % frames.length), 300);
    return () => clearInterval(id);
  }, [playing, frames.length]);

  const paint = useCallback(
    (index: number) => {
      setFrames((prev) =>
        prev.map((f, fi) => {
          if (fi !== active) return f;
          const next = [...f];
          next[index] = tool === "eraser" ? EMPTY : color;
          return next;
        }),
      );
    },
    [active, color, tool],
  );

  const handleCell = (index: number) => {
    if (tool === "picker") {
      const c = frame[index];
      if (c) setColor(c);
      setTool("brush");
      return;
    }
    paint(index);
  };

  const preview = useMemo(() => frameToPngDataUrl(frame, 8), [frame]);

  const handleImport = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const f = await imageFileToFrame(file);
      setFrames((prev) => prev.map((x, i) => (i === active ? f : x)));
      toast.success("Converted to 16×16 pixel art");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      for (let i = 0; i < frames.length; i++) {
        const dataUrl = frameToPngDataUrl(frames[i]!, 1);
        const blob = await (await fetch(dataUrl)).blob();
        const fname = frames.length > 1 ? `${name}-${i + 1}.png` : `${name}.png`;
        const fd = new FormData();
        fd.append("file", new File([blob], fname, { type: "image/png" }));
        const res = await doUploadIcon({ data: fd });
        if (!res.success || !res.icon) {
          toast.error(res.error ?? "Couldn't save icon");
          return;
        }
        if (i === 0) onSaved?.(res.icon.ref);
      }
      toast.success(
        frames.length > 1
          ? `Saved ${frames.length} frames to your Yoto icons`
          : "Saved to your Yoto icons",
      );
      await qc.invalidateQueries({ queryKey: ["yoto-icons"] });
    } finally {
      setSaving(false);
    }
  };

  const tools: { id: typeof tool; label: string; icon: typeof Brush }[] = [
    { id: "brush", label: "Paintbrush", icon: Brush },
    { id: "eraser", label: "Eraser", icon: Eraser },
    { id: "picker", label: "Color picker", icon: Pipette },
  ];

  return (
    <Card className={compact ? "border-none shadow-none" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Brush className="size-4 text-primary" /> Pixel art icon creator
        </CardTitle>
        <CardDescription>
          Paint a 16×16 icon, animate it across frames, then save it to your Yoto account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-col gap-5 lg:flex-row">
          {/* Canvas */}
          <div
            className="grid aspect-square w-full max-w-sm shrink-0 select-none overflow-hidden rounded-2xl border-2 border-border bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:16px_16px]"
            style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
            onPointerDown={() => (painting.current = true)}
          >
            {frame.map((c, i) => (
              <button
                key={i}
                type="button"
                aria-label={`pixel ${i}`}
                className="border-[0.5px] border-border/25"
                style={c ? { backgroundColor: c } : undefined}
                onPointerDown={() => handleCell(i)}
                onPointerEnter={() => painting.current && tool !== "picker" && paint(i)}
              />
            ))}
          </div>

          <div className="flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {tools.map((t) => (
                <Tooltip key={t.id}>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant={tool === t.id ? "default" : "outline"}
                      onClick={() => setTool(t.id)}
                    >
                      <t.icon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t.label}</TooltipContent>
                </Tooltip>
              ))}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() =>
                      setFrames((prev) => prev.map((f, i) => (i === active ? blankFrame() : f)))
                    }
                  >
                    <Square className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear canvas</TooltipContent>
              </Tooltip>
              <input
                ref={importRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleImport(e.target.files)}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="outline" onClick={() => importRef.current?.click()}>
                    <ImageIcon className="size-4" /> Image → pixels
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Drop in any image to auto-convert to 16×16</TooltipContent>
              </Tooltip>
            </div>

            <div
              className="rounded-2xl border-2 border-dashed border-border p-4 text-center text-xs text-muted-foreground"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void handleImport(e.dataTransfer.files);
              }}
            >
              Drag an image here to convert it into pixel art
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Palette</Label>
              <div className="flex flex-wrap gap-1.5">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    onClick={() => {
                      setColor(c);
                      setTool("brush");
                    }}
                    className={`size-6 rounded-md border-2 transition hover:scale-110 ${
                      color === c ? "border-primary" : "border-border/60"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="size-6 cursor-pointer rounded-md border-2 border-border/60 bg-transparent p-0"
                  aria-label="Custom color"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <img
                src={preview}
                alt="Icon preview"
                className="pixel-icon size-16 rounded-xl border border-border bg-secondary/60"
              />
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="icon-name" className="text-xs">
                  Icon name
                </Label>
                <Input
                  id="icon-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-9"
                />
              </div>
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save
              </Button>
            </div>
          </div>
        </div>

        {/* Frames timeline */}
        <div className="space-y-2 border-t border-border/60 pt-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Animation frames</Label>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={playing ? "default" : "outline"}
                onClick={() => setPlaying((p) => !p)}
                disabled={frames.length < 2}
              >
                <Play className="size-4" /> {playing ? "Stop" : "Preview"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setFrames((prev) => [...prev, [...(prev[active] ?? blankFrame())]]);
                  setActive(frames.length);
                }}
              >
                <Plus className="size-4" /> Add frame
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {frames.map((f, i) => (
              <div key={i} className="relative">
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  className={`flex size-14 items-center justify-center rounded-xl border-2 bg-secondary/60 ${
                    i === active ? "border-primary" : "border-transparent"
                  }`}
                >
                  <img src={frameToPngDataUrl(f, 4)} alt={`Frame ${i + 1}`} className="pixel-icon size-10" />
                </button>
                {frames.length > 1 && (
                  <button
                    type="button"
                    aria-label="Delete frame"
                    className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                    onClick={() => {
                      setFrames((prev) => prev.filter((_, x) => x !== i));
                      setActive((a) => Math.max(0, a - (i <= a ? 1 : 0)));
                    }}
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
