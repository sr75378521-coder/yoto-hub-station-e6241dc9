import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link2, Loader2, Nfc, RefreshCw } from "lucide-react";
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
import { getDashboardData } from "@/lib/players.functions";
import { getInsertedCard } from "@/lib/yoto/commands.functions";
import { linkPhysicalCard } from "@/lib/yoto/myo.functions";

/**
 * "Link to card" — pick an online player, read whatever NFC card is inserted
 * in it, and bind that card to this playlist. Manual code entry stays as a
 * fallback for cards that aren't in a player.
 */
export function LinkCardDialog({ contentId }: { contentId: string }) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const fetchDashboard = useServerFn(getDashboardData);
  const readCard = useServerFn(getInsertedCard);
  const doLink = useServerFn(linkPhysicalCard);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchDashboard(),
    enabled: open,
  });

  const players = data?.players ?? [];

  const link = async (cardId: string) => {
    const res = await doLink({ data: { contentId, cardId } });
    if (!res.success) {
      toast.error(res.error ?? "Couldn't link that card");
      return false;
    }
    toast.success("Card linked to this playlist");
    setOpen(false);
    return true;
  };

  const linkViaPlayer = async (deviceId: string) => {
    setBusyId(deviceId);
    try {
      const read = await readCard({ data: { deviceId } });
      if (!read.success || !read.cardId) {
        toast.error(read.error ?? "Put a card in that player, then try again");
        return;
      }
      await link(read.cardId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read the card");
    } finally {
      setBusyId(null);
    }
  };

  const linkManual = async () => {
    if (!manual.trim()) return toast.error("Enter a card code");
    setBusyId("__manual__");
    try {
      await link(manual.trim());
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

          <div className="flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or enter a code</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Card code"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              className="flex-1"
            />
            <Button onClick={() => void linkManual()} disabled={busyId !== null}>
              {busyId === "__manual__" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Link2 className="size-4" />
              )}
              Link
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
