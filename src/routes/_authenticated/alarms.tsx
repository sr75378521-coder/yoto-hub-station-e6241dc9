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
        content: "View, create and edit wake-up alarms for each Yoto player.",
      },
      { property: "og:title", content: "Alarms · Yoto Control Center" },
      {
        property: "og:description",
        content: "View, create and edit wake-up alarms for each Yoto player.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AlarmsPage,
});

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Alarm {
  id: string;
  device_id: string;
  label: string;
  time: string;
  days: number[];
  enabled: boolean;
  sound_card_id: string | null;
  sound_title: string | null;
  volume: number;
}

type Draft = Omit<Alarm, "id"> & { id?: string };

function AlarmsPage() {
  const qc = useQueryClient();
  const fetchDash = useServerFn(getDashboardData);
  const fetchLists = useServerFn(getPlaylistsData);
  const syncAlarmsToCloud = useServerFn(syncPlayerAlarms);

  const players = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDash() });
  const lists = useQuery({ queryKey: ["playlists"], queryFn: () => fetchLists() });
  const alarms = useQuery({
    queryKey: ["alarms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("player_alarms").select("*").order("time");
      if (error) throw error;
      return data as Alarm[];
    },
  });

  const [draft, setDraft] = useState<Draft | null>(null);

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
      } catch (e) {
        toast.warning(
          `Saved locally, but couldn't sync with Yoto: ${e instanceof Error ? e.message : ""}`,
        );
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save alarm"),
  });

  const remove = async (a: Alarm) => {
    if (!confirm(`Delete "${a.label}"?`)) return;
    await supabase.from("player_alarms").delete().eq("id", a.id);
    const rest = (alarms.data ?? []).filter((x) => x.id !== a.id);
    qc.invalidateQueries({ queryKey: ["alarms"] });
    pushToPlayer(a.device_id, rest).catch(() =>
      toast.warning("Deleted locally, but couldn't reach player to sync"),
    );
  };

  const toggle = (a: Alarm, enabled: boolean) => save.mutate({ ...a, enabled });

  const playerList = players.data?.players ?? [];
  const playlistOptions = lists.data?.playlists ?? [];
  const loading = players.isLoading || alarms.isLoading;

  return (
    <AppShell title="Alarms">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold">Alarms</h2>
            <p className="text-sm text-muted-foreground">
              Schedule wake-up alarms and morning playlists on your Yoto players.
            </p>
          </div>
          <Button
            disabled={!playerList.length}
            onClick={() =>
              setDraft({
                device_id: playerList[0]?.deviceId ?? "",
                label: "Wake up",
                time: "07:00",
                days: [1, 2, 3, 4, 5],
                enabled: true,
                sound_card_id: null,
                sound_title: null,
                volume: 12,
              })
            }
          >
            <Plus className="size-4" /> New alarm
          </Button>
        </div>

        {/* Helpful hardware charging notice */}
        <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
          <Info className="size-5 shrink-0 text-primary" />
          <div className="space-y-1 text-muted-foreground">
            <span className="font-medium text-foreground">How Yoto Player Alarms Work:</span>
            <p>
              To ensure alarms sound and wake the player, <strong>keep the player plugged into power</strong> or in night-standby mode. Deeply hibernating players on battery cannot power themselves back on.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading players…
          </div>
        ) : playerList.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No players found on your connected Yoto account.
            </CardContent>
          </Card>
        ) : (
          playerList.map((p) => {
            const mine = (alarms.data ?? []).filter((a) => a.device_id === p.deviceId);
            return (
              <section key={p.deviceId} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">
                    {p.name}{" "}
                    <span
                      className={cn(
                        "ms-2 text-xs",
                        p.online ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {p.online ? "online" : "offline"}
                    </span>
                  </h3>
                  {mine.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        pushToPlayer(p.deviceId, alarms.data ?? []).then(
                          () => toast.success("Synced to player"),
                          (e) => toast.error(String(e?.message ?? e)),
                        )
                      }
                    >
                      <Send className="size-4" /> Sync now
                    </Button>
                  )}
                </div>

                {mine.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No alarms set for this player.</p>
                ) : (
                  mine.map((a) => (
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
                          aria-label="Edit"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => void remove(a)}
                          aria-label="Delete"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))
                )}
              </section>
            );
          })
        )}
      </div>

      {draft && (
        <AlarmDialog
          draft={draft}
          players={playerList.map((p) => ({ id: p.deviceId, name: p.name }))}
          playlists={playlistOptions.map((p) => ({ id: p.playlistId, name: p.name }))}
          saving={save.isPending}
          onClose={() => setDraft(null)}
          onSave={(d) => save.mutate(d)}
          onUploaded={() => qc.invalidateQueries({ queryKey: ["playlists"] })}
        />
      )}
    </AppShell>
  );
}

function AlarmDialog({
  draft,
  players,
  playlists,
  saving,
  onClose,
  onSave,
  onUploaded,
}: {
  draft: Draft;
  players: { id: string; name: string }[];
  playlists: { id: string; name: string }[];
  saving: boolean;
  onClose: () => void;
  onSave: (d: Draft) => void;
  onUploaded: () => void;
}) {
  const [d, setD] = useState<Draft>(draft);
  const [uploading, setUploading] = useState(false);
  const upload = useServerFn(uploadTrack);
  const append = useServerFn(appendTracks);

  const options = useMemo(() => {
    const has = d.sound_card_id && !playlists.some((p) => p.id === d.sound_card_id);
    return has
      ? [{ id: d.sound_card_id!, name: d.sound_title ?? "Ringtone" }, ...playlists]
      : playlists;
  }, [playlists, d.sound_card_id, d.sound_title]);

  const onFile = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await upload({ data: fd });
      if (!up.success || !up.track) throw new Error(up.error ?? "Upload failed");
      const title = `Alarm · ${up.track.title}`;
      const res = await append({ data: { newTitle: title, tracks: [up.track] } });
      if (!res.success || !res.cardId)
        throw new Error(res.error ?? "Couldn't make ringtone playlist");
      setD((x) => ({ ...x, sound_card_id: res.cardId!, sound_title: title }));
      onUploaded();
      toast.success("Ringtone uploaded to your library");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{d.id ? "Edit alarm" : "New alarm"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            type="time"
            value={d.time}
            onChange={(e) => setD({ ...d, time: e.target.value })}
            className="h-16 text-center font-display text-4xl font-bold"
          />

          <div className="space-y-1">
            <Label>Alarm Name</Label>
            <Input value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} />
          </div>

          <div className="space-y-1">
            <Label>Player</Label>
            <Select value={d.device_id} onValueChange={(v) => setD({ ...d, device_id: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {players.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Repeat Days</Label>
            <div className="flex flex-wrap gap-1">
              {DAYS.map((name, i) => {
                const on = d.days.includes(i + 1);
                return (
                  <Button
                    key={name}
                    type="button"
                    size="sm"
                    variant={on ? "default" : "outline"}
                    onClick={() =>
                      setD({
                        ...d,
                        days: on ? d.days.filter((x) => x !== i + 1) : [...d.days, i + 1].sort(),
                      })
                    }
                  >
                    {name}
                  </Button>
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
                    v === "none" ? null : (options.find((o) => o.id === v)?.name ?? null),
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Default Yoto sound" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Default Yoto alarm sound</SelectItem>
                {options.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              disabled={uploading}
              asChild
            >
              <label className="cursor-pointer">
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                {uploading ? "Uploading…" : "Upload a custom MP3 sound"}
                <input
                  type="file"
                  accept="audio/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onFile(f);
                  }}
                />
              </label>
            </Button>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => onSave(d)} disabled={saving || d.days.length === 0}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {d.id ? "Update Alarm" : "Save Alarm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
