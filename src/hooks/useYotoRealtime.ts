import { useEffect, useRef, useState } from "react";
import type { MqttClient } from "mqtt";
import { useServerFn } from "@tanstack/react-start";
import { getMqttCredentials } from "@/lib/yoto/mqtt.functions";

export type RealtimeStatus = "connecting" | "mqtt" | "polling" | "offline";

interface Options {
  /** Called with a raw MQTT status payload. */
  onDeviceEvent?: (deviceId: string, payload: unknown) => void;
  /** Poll fallback trigger — invoked at the polling interval. */
  onPoll: () => void;
  /** Which device IDs to subscribe to. */
  deviceIds: string[];
  /** Polling interval in ms when MQTT unavailable. */
  pollIntervalMs?: number;
  /** Enable the hook. */
  enabled?: boolean;
}

/**
 * Subscribe to real-time Yoto player status via MQTT when the server can
 * mint credentials, otherwise fall back to REST polling. Automatically
 * downgrades to polling if the MQTT connection drops.
 */
export function useYotoRealtime({
  onDeviceEvent,
  onPoll,
  deviceIds,
  pollIntervalMs = 5000,
  enabled = true,
}: Options): { status: RealtimeStatus } {
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const fetchCreds = useServerFn(getMqttCredentials);
  const clientRef = useRef<MqttClient | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onDeviceEventRef = useRef(onDeviceEvent);
  const onPollRef = useRef(onPoll);
  const idsKey = deviceIds.slice().sort().join(",");

  useEffect(() => {
    onDeviceEventRef.current = onDeviceEvent;
    onPollRef.current = onPoll;
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const startPolling = () => {
      if (pollRef.current) return;
      setStatus((s) => (s === "mqtt" ? s : "polling"));
      pollRef.current = setInterval(() => onPollRef.current?.(), pollIntervalMs);
    };
    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    (async () => {
      try {
        const creds = await fetchCreds();
        if (cancelled) return;
        if (!creds.available || !creds.url) {
          startPolling();
          return;
        }
        const mqtt = await import("mqtt");
        if (cancelled) return;
        const client = mqtt.default.connect(creds.url, {
          username: creds.username,
          password: creds.password,
          clientId: creds.clientId ?? `yoto-cc-${Math.random().toString(16).slice(2)}`,
          reconnectPeriod: 5000,
          clean: true,
        });
        clientRef.current = client;
        client.on("connect", () => {
          setStatus("mqtt");
          stopPolling();
          for (const id of deviceIds) {
            client.subscribe(`${creds.topicPrefix ?? "device/"}${id}/events`);
          }
        });
        client.on("message", (topic, payload) => {
          const match = topic.match(/device[s]?\/([^/]+)/);
          if (!match) return;
          try {
            const json = JSON.parse(payload.toString());
            onDeviceEventRef.current?.(match[1], json);
          } catch {
            /* ignore malformed */
          }
        });
        client.on("error", () => startPolling());
        client.on("close", () => {
          setStatus((s) => (s === "mqtt" ? "polling" : s));
          startPolling();
        });
        client.on("offline", () => {
          setStatus("offline");
          startPolling();
        });
      } catch {
        if (!cancelled) startPolling();
      }
    })();

    return () => {
      cancelled = true;
      stopPolling();
      clientRef.current?.end(true);
      clientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, idsKey, pollIntervalMs]);

  return { status };
}
