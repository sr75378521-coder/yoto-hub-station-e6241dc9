import { Radio, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { PlayerSummary } from "@/lib/players.functions";
import { PlayerControls } from "./PlayerControls";

export function PlayerCard({ player }: { player: PlayerSummary }) {
  return (
    <Card className="group relative overflow-hidden border-border/60 bg-card/70 backdrop-blur transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
      <div
        className="absolute inset-x-0 top-0 h-24 opacity-70"
        style={{ background: "var(--gradient-player)" }}
      />
      <CardContent className="relative flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Radio className="size-5" />
          </div>
          <Badge variant={player.online ? "default" : "secondary"} className="gap-1">
            {player.online ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
            {player.online ? "Online" : "Offline"}
          </Badge>
        </div>

        <div>
          <h3 className="text-base font-semibold leading-tight">{player.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {player.deviceType ?? "Yoto"} · {player.deviceFamily ?? "player"}
          </p>
        </div>

        <div className="border-t border-border/60 pt-4">
          <PlayerControls deviceId={player.deviceId} initialOnline={player.online} />
        </div>
      </CardContent>
    </Card>
  );
}
