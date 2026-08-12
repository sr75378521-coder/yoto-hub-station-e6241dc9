import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Nfc, RefreshCw } from "lucide-react";
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
import { linkPhysicalCard } from "@/lib/yoto/myo.functions";
import { readInsertedCard } from "@/lib/yoto/mqtt-client";

/**
 * "Link to card" — pick an online player, read the NFC card sitting in it
 * over MQTT, and bind that card to this playlist.
 */
export function LinkCardDialog({ contentId }: { contentId: string }) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fetchDashboard = useServerFn(getDashboardData);
  const doLink = useServerFn(linkPhysicalCard);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchDashboard(),
    enabled: open,
  });

  const players = [...(data?.players ?? [])].sort(
    (a, b) => Number(b.online) - Number(a.online),
  );

  const linkViaPlayer = async (deviceId: string) => {
    setBusyId(deviceId);
    try {
      toast.info("Reading the card in your player…");
      const { cardId } = await readInsertedCard(deviceId);
      if (!cardId) {
        toast.error("No card detected — put a Make Your Own card in that player and try again");
        return;
      }
      const res = await doLink({ data: { contentId, cardId } });
      if (!res.success) {
        toast.error(res.error ?? "Couldn't link that card");
        return;
      }
      toast.success("Card linked to this playlist");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read the card");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Nfc className="size-4" />
          Link to card
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link a card to this playlist</DialogTitle>
          <DialogDescription>
            Put a Make Your Own card into one of your players, then pick that player — we'll read
            the card over NFC and link it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Your players</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
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
              className="h-auto w-full justify-between whitespace-normal py-2 text-left"
              disabled={busyId !== null || !p.online}
              onClick={() => void linkViaPlayer(p.deviceId)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`inline-block size-2 shrink-0 rounded-full ${p.online ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                />
                <span className="truncate">
                  {p.name}
                  {!p.online && " (offline)"}
                </span>
              </span>
              {busyId === p.deviceId ? (
                <Loader2 className="size-4 shrink-0 animate-spin" />
              ) : (
                <Nfc className="size-4 shrink-0" />
              )}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
