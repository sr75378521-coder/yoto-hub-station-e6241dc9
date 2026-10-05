import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Moon, Sun, Play } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { getDashboardData, getPlaylistsData } from "@/lib/players.functions";
import { yotoDevice } from "@/lib/yoto/mqtt-client";

export const Route = createFileRoute("/_authenticated/bedtime")({
  head: () => ({
    meta: [
      { title: "Bedtime Routine · Yoto Control Center" },
      { name: "description", content: "One tap to set night light, volume, story and sleep timer on your Yoto players." },
      { property: "og:title", content: "Bedtime Routine · Yoto Control Center" },
      { property: "og:description", content: "One-tap bedtime routines for every Yoto player." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BedtimePage,
});

interface Routine {
  color: string;
  volume: number;
  sleepMin: number;
  cardId: string;
  fadeOut: boolean;
}
const DEFAULT: Routine = { color: "#ff8a3d", volume: 5, sleepMin: 30, cardId: "", fadeOut: true };
const KEY = "bedtime-routine";

function BedtimePage() {
  const dash = useServerFn(getDashboardData);
  const lists = useServerFn(getPlaylistsData);
  const players = useQuery({ queryKey: ["dashboard"], queryFn: () => dash() });
  const playlists = useQuery({ queryKey: ["playlists"], queryFn: () => lists() });
  const [r, setR] = useState<Routine>(DEFAULT);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const s = localStorage.getItem(KEY);
      if (s) setR({ ...DEFAULT, ...JSON.parse(s) });
    } catch {}
  }, []);
  useEffect(() => {
    const online = players.data?.players.filter((p) => p.online).map((p) => p.deviceId) ?? [];
    setSelected(online);
  }, [players.data]);

  const save = (n: Routine) => {
    setR(n);
    localStorage.setItem(KEY, JSON.stringify(n));
  };

  const runAll = async (fn: (id: string) => Promise<unknown>, label: string) => {
    if (!selected.length) return toast.error("Pick at least one player");
    setBusy(true);
    const res = await Promise.allSettled(selected.map(fn));
    setBusy(false);
    const failed = res.filter((x) => x.status === "rejected").length;
    failed ? toast.error(`${label}: ${failed} player(s) didn't respond`) : toast.success(`${label} done`);
  };

  const startBedtime = () =>
    runAll(async (id) => {
      await yotoDevice.setAmbientHex(id, r.color);
      await yotoDevice.setVolume(id, r.volume);
      if (r.cardId) await yotoDevice.startCard(id, { cardId: r.cardId });
      if (r.sleepMin > 0) {
        if (r.fadeOut) {
          setTimeout(() => void yotoDevice.fadeOutAndStop(id, 60).catch(() => {}), Math.max(0, r.sleepMin * 60 - 60) * 1000);
        } else await yotoDevice.setSleepTimer(id, r.sleepMin * 60);
      }
    }, "Bedtime");

  const goodMorning = () =>
    runAll(async (id) => {
      await yotoDevice.ambientOff(id);
      await yotoDevice.cancelSleepTimer(id);
      await yotoDevice.setVolume(id, 8);
    }, "Good morning");

  return (
    <AppShell title="Bedtime">
      <div className="mx-auto max-w-3xl space-y-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Moon className="size-5" /> Bedtime routine</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label>Players</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {players.data?.players.map((p) => (
                  <label key={p.deviceId} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                    <Checkbox
                      checked={selected.includes(p.deviceId)}
                      onCheckedChange={(v) =>
                        setSelected((s) => (v ? [...s, p.deviceId] : s.filter((x) => x !== p.deviceId)))
                      }
                    />
                    {p.name} <span className="ml-auto text-xs text-muted-foreground">{p.online ? "online" : "offline"}</span>
                  </label>
                )) ?? <p className="text-sm text-muted-foreground">Loading players…</p>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Label htmlFor="c">Night light</Label>
              <input id="c" type="color" value={r.color} onChange={(e) => save({ ...r, color: e.target.value })} className="h-9 w-14 rounded" />
            </div>
            <div>
              <Label>Volume: {r.volume} / 16</Label>
              <Slider className="mt-2" min={0} max={16} step={1} value={[r.volume]} onValueChange={(v) => save({ ...r, volume: v[0] ?? 5 })} />
            </div>
            <div>
              <Label>Sleep after: {r.sleepMin === 0 ? "off" : `${r.sleepMin} min`}</Label>
              <Slider className="mt-2" min={0} max={120} step={5} value={[r.sleepMin]} onValueChange={(v) => save({ ...r, sleepMin: v[0] ?? 30 })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={r.fadeOut} onCheckedChange={(v) => save({ ...r, fadeOut: Boolean(v) })} />
              Gently fade the volume out at the end (keep this page open)
            </label>
            <div>
              <Label htmlFor="pl">Bedtime story</Label>
              <select id="pl" value={r.cardId} onChange={(e) => save({ ...r, cardId: e.target.value })}
                className="mt-2 w-full rounded-lg border bg-background p-2 text-sm">
                <option value="">Don't start a story</option>
                {playlists.data?.playlists.map((p) => (
                  <option key={p.playlistId} value={p.playlistId}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={startBedtime} disabled={busy}><Play className="size-4" /> Start bedtime</Button>
              <Button variant="outline" onClick={goodMorning} disabled={busy}><Sun className="size-4" /> Good morning</Button>
            </div>
            <p className="text-xs text-muted-foreground">Your routine is saved on this device.</p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
