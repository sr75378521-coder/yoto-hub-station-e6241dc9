import { useEffect, useState } from "react";
import { subscribeDevice, type DeviceState } from "@/lib/yoto/mqtt-client";

export type RealtimeStatus = "connecting" | "mqtt" | "offline";

/** Live state for a single Yoto player over MQTT. */
export function useYotoDevice(deviceId: string, enabled = true) {
  const [state, setState] = useState<DeviceState | null>(null);

  useEffect(() => {
    if (!enabled || !deviceId) return;
    return subscribeDevice(deviceId, setState);
  }, [deviceId, enabled]);

  return {
    state,
    connected: state?.connected ?? false,
    status: (state?.connected ? "mqtt" : enabled ? "connecting" : "offline") as RealtimeStatus,
  };
}

interface Options {
  deviceIds: string[];
  enabled?: boolean;
}

/** Aggregate connection status across several players (for the dashboard badge). */
export function useYotoRealtime({ deviceIds, enabled = true }: Options): {
  status: RealtimeStatus;
} {
  const [connectedIds, setConnectedIds] = useState<string[]>([]);
  const idsKey = deviceIds.slice().sort().join(",");

  useEffect(() => {
    if (!enabled) return;
    const ids = idsKey ? idsKey.split(",") : [];
    const unsubs = ids.map((id) =>
      subscribeDevice(id, (s) =>
        setConnectedIds((prev) => {
          const has = prev.includes(id);
          if (s.connected && !has) return [...prev, id];
          if (!s.connected && has) return prev.filter((x) => x !== id);
          return prev;
        }),
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [idsKey, enabled]);

  if (!enabled) return { status: "offline" };
  return { status: connectedIds.length > 0 ? "mqtt" : "connecting" };
}
