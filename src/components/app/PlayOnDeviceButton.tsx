import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Play, Loader2, MonitorSpeaker } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getDashboardData, getPlaylistTracks } from "@/lib/players.functions";
import { playerPlayCard } from "@/lib/yoto/commands.functions";
import { useWebPlayer } from "./WebPlayer";

interface Props {
  cardId: string;
  label?: string;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "ghost";
  className?: string;
}

export function PlayOnDeviceButton({
  cardId,
  label = "Play",
  size = "sm",
  variant = "ghost",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fetchDashboard = useServerFn(getDashboardData);
  const fetchTracks = useServerFn(getPlaylistTracks);
  const playCard = useServerFn(playerPlayCard);
  const { playQueue } = useWebPlayer();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchDashboard(),
    enabled: open,
  });

  const handlePlay = async (deviceId: string) => {
    setBusyId(deviceId);
    try {
      await playCard({ data: { deviceId, cardId } });
      toast.success("Playing on your Yoto");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start playback");
    } finally {
      setBusyId(null);
    }
  };

  const handlePlayHere = async () => {
    setBusyId("__browser__");
    try {
      const res = await fetchTracks({ data: { playlistId: cardId } });
      const playable = res.tracks.filter((t) => t.url);
      if (playable.length === 0) {
        toast.error(
          res.error
            ? `Couldn't load audio: ${res.error}`
            : "This playlist has no streamable audio for browser playback",
        );
        return;
      }

      playQueue({ id: cardId, title: res.title, artwork: res.artwork, tracks: playable });
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load audio");
    } finally {
      setBusyId(null);
    }
  };

  const players = data?.players ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant={variant} className={className}>
          <Play className="size-4" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Play</DialogTitle>
          <DialogDescription>Play in this browser or on a Yoto player.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Button
            variant="default"
            className="w-full justify-between"
            disabled={busyId !== null}
            onClick={handlePlayHere}
          >
            <span className="flex items-center gap-2">
              <MonitorSpeaker className="size-4" />
              This device (browser)
            </span>
            {busyId === "__browser__" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
          </Button>

          <div className="flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">Yoto players</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> Loading players…
            </div>
          )}
          {!isLoading && players.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No Yoto players found on this account.
            </p>
          )}
          {players.map((p) => (
            <Button
              key={p.deviceId}
              variant="outline"
              className="w-full justify-between"
              disabled={busyId !== null}
              onClick={() => handlePlay(p.deviceId)}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`inline-block size-2 rounded-full ${p.online ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                />
                {p.name}
              </span>
              {busyId === p.deviceId ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
