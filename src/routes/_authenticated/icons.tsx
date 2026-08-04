import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IconGrid, IconUploadButton, useYotoIcons } from "@/components/app/IconPicker";

export const Route = createFileRoute("/_authenticated/icons")({
  head: () => ({
    meta: [
      { title: "My Icons · Yoto Control Center" },
      {
        name: "description",
        content: "Browse, upload and save the pixel icons that show on your Yoto player screen.",
      },
      { property: "og:title", content: "My Icons · Yoto Control Center" },
      {
        property: "og:description",
        content: "Browse, upload and save the pixel icons that show on your Yoto player screen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IconsPage,
});

function IconsPage() {
  const { data, isLoading } = useYotoIcons();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"mine" | "yoto">("mine");

  const icons = useMemo(() => {
    const all = (data?.icons ?? []).filter((i) => i.source === tab);
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((i) => i.title.toLowerCase().includes(needle)) : all;
  }, [data, q, tab]);

  return (
    <AppShell title="My Icons">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-3xl bg-[image:var(--gradient-player)] p-6">
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <Sparkles className="size-6 text-primary" /> My Yoto icons
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload your own 16×16 pixel art — it saves straight to your Yoto account and can be
            used on any playlist track.
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Icon collection</CardTitle>
              <CardDescription>{data?.icons?.length ?? 0} icons available</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Tabs value={tab} onValueChange={(v) => setTab(v as "mine" | "yoto")}>
                <TabsList>
                  <TabsTrigger value="mine">Mine</TabsTrigger>
                  <TabsTrigger value="yoto">Yoto</TabsTrigger>
                </TabsList>
              </Tabs>
              <Input
                placeholder="Search…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-9 w-40"
              />
              <IconUploadButton />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading your icons…
              </div>
            ) : icons.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                {data?.error
                  ? `Couldn't load icons: ${data.error}`
                  : tab === "mine"
                    ? "No icons yet — upload a PNG to get started."
                    : "No Yoto icons available."}
              </p>
            ) : (
              <IconGrid
                icons={icons}
                onPick={(icon) => {
                  void navigator.clipboard?.writeText(icon.ref);
                  toast.success(`Copied "${icon.title}" icon reference`);
                }}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
