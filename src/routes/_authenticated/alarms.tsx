import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlarmClock,
  Info,
  Loader2,
  Pencil,
  Plus,
  Send,
  Trash2,
  Upload,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getDashboardData, getPlaylistsData } from "@/lib/players.functions";
import { appendTracks, uploadTrack } from "@/lib/yoto/myo.functions";
import { syncPlayerAlarms } from "@/lib/yoto/alarms.functions";
import { yotoDevice } from "@/lib/yoto/mqtt-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/alarms")({
  head: () => ({
    meta: [
      { title: "Alarms · Yoto Control Center" },
      {
        name: "description",
        content:
          "Manage scheduled wakeup alarms and custom sounds synced to your Yoto players.",
      },
      { property: "og:title", content: "Alarms · Yoto Control Center" },
      {
        property: "og:description",
        content:
          "Manage scheduled wakeup alarms and custom sounds synced to your Yoto players.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AlarmsPage,
});

interface Alarm {
  id: string;
  device_id: string;
  label: string;
  time: string; // HH:MM
  days: number[]; // 1-7
  enabled: boolean;
  sound_type: string;
  sound_card_id: string | null;
  sound_title: string | null;
  volume: number;
}

type Draft = Omit<Alarm, "id"> & { id?: string };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function AlarmsPage() {
  const qc = useQueryClient();
  const fetchDash = useServerFn(getDashboardData);
  const fetchPlaylists = useServerFn(getPlaylistsData);
  const syncAlarmsToCloud = useServerFn(syncPlayerAlarms);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [syncingDevice, setSyncingDevice] = useState<string | null>(null);

  const { data: dash } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchDash(),
  });

  const { data: pls } = useQuery({
    queryKey: ["playlists"],
    queryFn: () => fetchPlaylists(),
  });

  const { data: alarms = [], isLoading } = useQuery({
    queryKey: ["alarms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("player_alarms")
        .select("*")
        .order("time");
      if (error) throw error;
      return (data ?? []) as Alarm[];
    },
  });

  /** Pushes alarms both to Yoto Cloud REST API and over MQTT */
  const pushToPlayer = async (deviceId: string, allAlarms: Alarm[]) => {
    const playerAlarms = allAlarms.filter((a) => a.device_id === deviceId);

    // 1. Persist to official Yoto Cloud API
    const res = await syncAlarmsToCloud({
      data: {
        deviceId,
        alarms: playerAlarms.map((a) => ({
          time: a.time,
          days: a.days,
          sound_card_id: a.sound_card_id,
          volume: a.volume ?? 10,
          enabled: a.enabled,
        })),
      },
    });

    // 2. Also notify the player via MQTT if it is currently awake
    try {
      await yotoDevice.setConfig(deviceId, { alarms: res.alarms, alarmsEnabled: 1 });
    } catch {
      // Ignore MQTT offline errors since cloud persistence is primary
    }
  };

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Please sign in again");
      const row = {
        ...d,
        user_id: u.user.id,
        sound_type: "playlist",
        volume: Math.min(16, Math.max(1, d.volume || 10)),
      };

      const { error } = d.id
        ? await supabase.from("player_alarms").update(row).eq("id", d.id)
        : await supabase.from("player_alarms").insert(row);
      if (error) throw error;

      const { data } = await supabase.from("player_alarms").select("*");
      return { deviceId: d.device_id, all: (data ?? []) as Alarm[] };
    },
    onSuccess: async ({ deviceId, all }) => {
      qc.invalidateQueries({ queryKey: ["alarms"] });
      setDraft(null);
      try {
        await pushToPlayer(deviceId, all);
        toast.success("Alarm saved and synced to your Yoto player");
      } catch (err) {
        toast.error("Alarm saved locally, but Yoto sync failed: " + (err as Error).message);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (a: Alarm) => {
      const { error } = await supabase.from("player_alarms").delete().eq("id", a.id);
      if (error) throw error;
      const { data } = await supabase.from("player_alarms").select("*");
      return { deviceId: a.device_id, all: (data ?? []) as Alarm[] };
    },
    onSuccess: async ({ deviceId, all }) => {
      qc.invalidateQueries({ queryKey: ["alarms"] });
      try {
        await pushToPlayer(deviceId, all);
        toast.success("Alarm deleted and synced to your player");
      } catch (err) {
        toast.error("Deleted locally, but Yoto sync failed: " + (err as Error).message);
      }
    },
  });

  const toggle = async (a: Alarm, enabled: boolean) => {
    const updated = alarms.map((x) => (x.id === a.id ? { ...x, enabled } : x));
    await supabase.from("player_alarms").update({ enabled }).eq("id", a.id);
    qc.invalidateQueries({ queryKey: ["alarms"] });
    try {
      await pushToPlayer(a.device_id, updated);
      toast.success(enabled ? "Alarm turned on" : "Alarm turned off");
    } catch {
      toast.warning("Updated locally; will sync when player connects");
    }
  };

  const manualSync = async (deviceId: string) => {
    setSyncingDevice(deviceId);
    try {
      await pushToPlayer(deviceId, alarms);
      toast.success("Alarms pushed to Yoto Cloud and player successfully!");
    } catch (err) {
      toast.error("Sync failed: " + (err as Error).message);
    } finally {
      setSyncingDevice(null);
    }
  };

  const playerList = useMemo(() => {
    const list = dash?.players ?? [];
    return list.map((p) => ({
      deviceId: p.deviceId ?? (p as unknown as { id: string }).id,
      name: p.name || "Yoto Player",
    }));
  }, [dash]);

  const byPlayer = useMemo(() => {
    const map = new Map<string, Alarm[]>();
    for (const a of alarms) {
      const arr = map.get(a.device_id) ?? [];
      arr.push(a);
      map.set(a.device_id, arr);
    }
    return map;
  }, [alarms]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Alarms</h1>
            <p className="text-sm text-muted-foreground">
              Wake-up alarms sync directly to Yoto Cloud so your player wakes on time.
            </p>
          </div>
          <Button
            onClick={() =>
              setDraft({
                device_id: playerList[0]?.deviceId ?? "",
                label: "Wake up",
                time: "07:00",
                days: [1, 2, 3, 4, 5],
                enabled: true,
                sound_card_id: null,
                sound_title: null,
                volume: 10,
              })
            }
          >
            <Plus className="size-4" /> New alarm
          </Button>
        </div>

        {/* Helpful hardware charging notice */}
        <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
          <Info className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">
              Keep your player plugged in or in standby for alarms to ring
            </p>
            <p className="text-muted-foreground">
              Yoto players power their internal alarm clocks from cloud schedules. If a battery-powered
              player goes into a deep sleep, plug it into its charging dock overnight so it stays awake to
              sound your alarm.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : playerList.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No Yoto players linked. Connect your Yoto account in the Dashboard first.
            </CardContent>
          </Card>
        ) : (
          playerList.map((p) => {
            const list = byPlayer.get(p.deviceId) ?? [];
            const isSyncing = syncingDevice === p.deviceId;

            return (
              <div key={p.deviceId} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-semibold">{p.name}</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSyncing}
                    onClick={() => manualSync(p.deviceId)}
                    className="gap-1.5 text-xs"
                  >
                    {isSyncing ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Send className="size-3.5" />
                    )}
                    Sync now
                  </Button>
                </div>

                {list.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-sm text-muted-foreground">
                      No alarms set for this player. Click "New alarm" above.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {list.map((a) => (
                      <Card key={a.id} className={cn(!a.enabled && "opacity-60")}>
                        <CardContent className="flex items-center gap-4 p-4">
                          <AlarmClock className="size-6 text-primary" />
                          <div className="min-w-0 flex-1">
                            <div className="font-display text-3xl font-bold tabular-nums">
                              {a.time}
                            </div>
                            <div className="truncate text-sm text-muted-foreground">
                              {a.label} ·{" "}
                              {a.days.length === 7
                                ? "Every day"
                                : a.days.map((d) => DAYS[d - 1]).join(", ") || "Once"}{" "}
                              · Vol {a.volume ?? 10}/16 · {a.sound_title ?? "Default Yoto alarm"}
                            </div>
                          </div>
                          <Switch
                            checked={a.enabled}
                            onCheckedChange={(v) => toggle(a, v)}
                            aria-label="Alarm on"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDraft(a)}
                            aria-label="Edit alarm"
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => remove.mutate(a)}
                            aria-label="Delete alarm"
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}

        {draft && (
          <AlarmDialog
            draft={draft}
            players={playerList}
            playlists={pls?.cards ?? []}
            onClose={() => setDraft(null)}
            onSave={(d) => save.mutate(d)}
            isSaving={save.isPending}
          />
        )}
      </div>
    </AppShell>
  );
}

interface AlarmDialogProps {
  draft: Draft;
  players: { deviceId: string; name: string }[];
  playlists: Array<{ cardId?: string; id?: string; title?: string }>;
  onClose: () => void;
  onSave: (d: Draft) => void;
  isSaving: boolean;
}

function AlarmDialog({
  draft,
  players,
  playlists,
  onClose,
  onSave,
  isSaving,
}: AlarmDialogProps) {
  const [d, setD] = useState<Draft>(draft);
  const [isUploading, setIsUploading] = useState(false);
  const uploadFn = useServerFn(uploadTrack);
  const appendFn = useServerFn(appendTracks);
  const qc = useQueryClient();

  const toggleDay = (dayNum: number) => {
    const next = d.days.includes(dayNum)
      ? d.days.filter((x) => x !== dayNum)
      : [...d.days, dayNum].sort((a, b) => a - b);
    setD({ ...d, days: next });
  };

  const handleCustomAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const up = await uploadFn({
        data: {
          filename: file.name,
          contentType: file.type || "audio/mpeg",
          sizeBytes: file.size,
        },
      });

      await fetch(up.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "audio/mpeg" },
        body: file,
      });

      const res = await appendFn({
        data: {
          playlistTitle: `Alarm: ${d.label || file.name.replace(/\.[^/.]+$/, "")}`,
          tracks: [
            {
              title: d.label || file.name.replace(/\.[^/.]+$/, ""),
              trackUrl: up.trackUrl,
              durationSeconds: 30,
              format: "mp3",
            },
          ],
        },
      });

      setD({
        ...d,
        sound_card_id: res.cardId,
        sound_title: `Custom: ${file.name.replace(/\.[^/.]+$/, "")}`,
      });
      qc.invalidateQueries({ queryKey: ["playlists"] });
      toast.success("Custom alarm audio uploaded and saved to your MYO library!");
    } catch (err) {
      toast.error("Upload failed: " + (err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{d.id ? "Edit Alarm" : "New Alarm"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Target Player</Label>
            <Select
              value={d.device_id}
              onValueChange={(v) => setD({ ...d, device_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a player" />
              </SelectTrigger>
              <SelectContent>
                {players.map((p) => (
                  <SelectItem key={p.deviceId} value={p.deviceId}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Time</Label>
              <Input
                type="time"
                value={d.time}
                onChange={(e) => setD({ ...d, time: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Label</Label>
              <Input
                value={d.label}
                onChange={(e) => setD({ ...d, label: e.target.value })}
                placeholder="Wake up"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Repeat Days</Label>
            <div className="flex gap-1.5">
              {DAYS.map((name, idx) => {
                const dayNum = idx + 1;
                const active = d.days.includes(dayNum);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleDay(dayNum)}
                    className={cn(
                      "flex-1 rounded-md border py-1.5 text-xs font-semibold transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {name.slice(0, 2)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <Label className="flex items-center gap-1.5">
                <Volume2 className="size-4" /> Alarm Volume
              </Label>
              <span className="font-semibold">{d.volume ?? 10} / 16</span>
            </div>
            <Slider
              min={1}
              max={16}
              step={1}
              value={[d.volume ?? 10]}
              onValueChange={([v]) => setD({ ...d, volume: v })}
            />
            <p className="text-xs text-muted-foreground">
              Yoto full volume range (1–16). Level 16 is maximum volume.
            </p>
          </div>

          <div className="space-y-1">
            <Label>Alarm Sound or Playlist</Label>
            <Select
              value={d.sound_card_id ?? "none"}
              onValueChange={(v) =>
                setD({
                  ...d,
                  sound_card_id: v === "none" ? null : v,
                  sound_title:
                    v === "none"
                      ? null
                      : playlists.find((p) => (p.cardId ?? p.id) === v)?.title ?? null,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Default Yoto wake up tone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Default Yoto alarm sound</SelectItem>
                {playlists.map((pl) => {
                  const id = pl.cardId ?? pl.id;
                  if (!id) return null;
                  return (
                    <SelectItem key={id} value={id}>
                      {pl.title || "Untitled playlist"}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-dashed border-border p-3 text-center">
            <p className="text-xs font-medium">Or upload custom audio for this alarm</p>
            <p className="text-[11px] text-muted-foreground">
              Upload an MP3; it will automatically create a private Yoto card sound.
            </p>
            <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted">
              {isUploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              {isUploading ? "Uploading..." : "Choose audio file"}
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                disabled={isUploading}
                onChange={handleCustomAudio}
              />
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={() => onSave(d)} disabled={isSaving || isUploading}>
            {isSaving && <Loader2 className="size-4 animate-spin" />}
            Save alarm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
