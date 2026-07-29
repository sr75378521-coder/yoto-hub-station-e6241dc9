import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Play, Loader2 } from "lucide-react";
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
import { getDashboardData } from "@/lib/players.functions";
import { playerPlayCard } from "@/lib/yoto/commands.functions";

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
  const playCard = useServerFn(playerPlayCard);

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
          <DialogTitle>Play on device</DialogTitle>
          <DialogDescription>Choose a Yoto player to start playback.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
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
