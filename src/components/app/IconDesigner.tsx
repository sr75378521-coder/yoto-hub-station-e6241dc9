import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eraser, Loader2, Paintbrush, PaintBucket, Palette, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { uploadIcon, type YotoIcon } from "@/lib/yoto/icons.functions";

const SIZE = 16;
const PALETTE = [
  "#000000", "#ffffff", "#7f7f7f", "#c8c8c8",
  "#e4002b", "#ff6b6b", "#ff9f1c", "#ffd166",
  "#06d6a0", "#118ab2", "#3a86ff", "#8338ec",
  "#ff70a6", "#7f4f24", "#606c38", "#22223b",
];

type Cell = string | null;

function emptyGrid(): Cell[] {
  return Array.from({ length: SIZE * SIZE }, () => null);
}

function gridToPngFile(grid: Cell[], name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return reject(new Error("Canvas unavailable"));
    ctx.clearRect(0, 0, SIZE, SIZE);
    grid.forEach((color, i) => {
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(i % SIZE, Math.floor(i / SIZE), 1, 1);
    });
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Couldn't render icon"));
      resolve(new File([blob], `${name || "my-icon"}.png`, { type: "image/png" }));
    }, "image/png");
  });
}

export function IconDesignerButton({
  onCreated,
  variant = "outline",
}: {
  onCreated?: (icon: YotoIcon) => void;
  variant?: "outline" | "default" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [grid, setGrid] = useState<Cell[]>(emptyGrid);
  const [color, setColor] = useState(PALETTE[4]);
  const [tool, setTool] = useState<"draw" | "erase" | "fill">("draw");
  const [name, setName] = useState("My icon");
  const [saving, setSaving] = useState(false);
  const painting = useRef(false);
  const qc = useQueryClient();
  const doUpload = useServerFn(uploadIcon);

  const paint = useCallback(
    (index: number) => {
      setGrid((prev) => {
        const next = [...prev];
        if (tool === "erase") next[index] = null;
        else if (tool === "fill") return prev.map(() => color);
        else next[index] = color;
        return next;
      });
    },
    [color, tool],
  );

  const save = async () => {
    if (grid.every((c) => !c)) {
      toast.error("Draw something first!");
      return;
    }
    setSaving(true);
    try {
      const file = await gridToPngFile(grid, name.trim());
      const fd = new FormData();
      fd.append("file", file);
      const res = await doUpload({ data: fd });
      if (!res.success || !res.icon) {
        toast.error(res.error ?? "Couldn't save icon");
        return;
      }
      toast.success(`"${res.icon.title}" saved to your Yoto icons`);
      await qc.invalidateQueries({ queryKey: ["yoto-icons"] });
      onCreated?.(res.icon);
      setOpen(false);
      setGrid(emptyGrid());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save icon");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={variant}>
          <Palette className="size-4" />
          Design icon
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Design a 16×16 icon</DialogTitle>
          <DialogDescription>
            Tap the squares to paint your own pixel art, then save it to your Yoto icons.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div
            className="grid touch-none select-none overflow-hidden rounded-2xl border-2 border-border bg-[repeating-conic-gradient(#e9e4dc_0%_25%,#f7f4ef_0%_50%)_50%/16px_16px]"
            style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))`, width: "min(100%, 320px)" }}
            onPointerDown={() => (painting.current = true)}
            onPointerUp={() => (painting.current = false)}
            onPointerLeave={() => (painting.current = false)}
          >
            {grid.map((cell, i) => (
              <button
                key={i}
                type="button"
                aria-label={`pixel ${i}`}
                className="aspect-square border-[0.5px] border-black/5"
                style={{ backgroundColor: cell ?? "transparent" }}
                onPointerDown={() => paint(i)}
                onPointerEnter={() => painting.current && paint(i)}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => {
                  setColor(c);
                  setTool((t) => (t === "erase" ? "draw" : t));
                }}
                className={`size-7 rounded-lg border-2 transition ${
                  color === c ? "border-primary scale-110" : "border-border/60"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="size-7 cursor-pointer rounded-lg border-2 border-border/60 bg-transparent p-0"
              aria-label="Custom colour"
            />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button size="sm" variant={tool === "draw" ? "default" : "outline"} onClick={() => setTool("draw")}>
              <Paintbrush className="size-4" /> Draw
            </Button>
            <Button size="sm" variant={tool === "erase" ? "default" : "outline"} onClick={() => setTool("erase")}>
              <Eraser className="size-4" /> Erase
            </Button>
            <Button size="sm" variant="outline" onClick={() => setGrid(() => Array.from({ length: SIZE * SIZE }, () => color))}>
              <PaintBucket className="size-4" /> Fill
            </Button>
            <Button size="sm" variant="outline" onClick={() => setGrid(emptyGrid())}>
              <Trash2 className="size-4" /> Clear
            </Button>
          </div>

          <div className="w-full space-y-1.5">
            <Label htmlFor="icon-name">Icon name</Label>
            <Input id="icon-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Palette className="size-4" />}
            Save to my Yoto icons
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
