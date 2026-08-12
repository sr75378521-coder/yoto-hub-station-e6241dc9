/**
 * Browser-side Yoto MQTT manager.
 *
 * Implements https://yoto.dev/players-mqtt/connecting-to-players/ —
 * one shared connection per device, ref-counted, with the documented
 * keep-alive events request every 4m55s.
 */
import type { MqttClient } from "mqtt";
import { getYotoMqttAuth } from "@/lib/yoto/mqtt.functions";

export interface DeviceState {
  connected: boolean;
  cardId: string | null;
  cardInserted: boolean;
  chapterKey: string | null;
  chapterTitle: string | null;
  trackKey: string | null;
  trackTitle: string | null;
  position: number | null;
  trackLength: number | null;
  playbackStatus: "playing" | "paused" | "stopped" | null;
  volume: number | null;
  sleepTimerActive: boolean;
  sleepTimerSeconds: number | null;
  batteryLevel: number | null;
  charging: boolean;
}

const EMPTY: DeviceState = {
  connected: false,
  cardId: null,
  cardInserted: false,
  chapterKey: null,
  chapterTitle: null,
  trackKey: null,
  trackTitle: null,
  position: null,
  trackLength: null,
  playbackStatus: null,
  volume: null,
  sleepTimerActive: false,
  sleepTimerSeconds: null,
  batteryLevel: null,
  charging: false,
};

type Listener = (s: DeviceState) => void;

interface Entry {
  refs: number;
  client: MqttClient | null;
  state: DeviceState;
  listeners: Set<Listener>;
  keepalive: ReturnType<typeof setInterval> | null;
  connecting: Promise<MqttClient | null> | null;
}

const entries = new Map<string, Entry>();

function entryFor(deviceId: string): Entry {
  let e = entries.get(deviceId);
  if (!e) {
    e = { refs: 0, client: null, state: { ...EMPTY }, listeners: new Set(), keepalive: null, connecting: null };
    entries.set(deviceId, e);
  }
  return e;
}

function emit(e: Entry) {
  const snapshot = e.state;
  for (const l of e.listeners) l(snapshot);
}

function patch(e: Entry, p: Partial<DeviceState>) {
  e.state = { ...e.state, ...p };
  emit(e);
}

async function connect(deviceId: string): Promise<MqttClient | null> {
  const e = entryFor(deviceId);
  if (e.client) return e.client;
  if (e.connecting) return e.connecting;

  e.connecting = (async () => {
    const auth = await getYotoMqttAuth();
    if (!auth.available || !auth.url || !auth.token) return null;
    const mqtt = await import("mqtt");
    const client = mqtt.default.connect(auth.url, {
      keepalive: 300,
      port: 443,
      protocol: "wss",
      username: `${deviceId}?x-amz-customauthorizer-name=PublicJWTAuthorizer`,
      password: auth.token,
      clientId: `DASH${deviceId}`,
      reconnectPeriod: 3000,
      queueQoSZero: true,
      clean: true,
      ALPNProtocols: ["x-amzn-mqtt-ca"],
    } as Parameters<typeof mqtt.default.connect>[1]);

    const topics = [
      `device/${deviceId}/data/events`,
      `device/${deviceId}/data/status`,
      `device/${deviceId}/response`,
    ];

    client.on("connect", () => {
      patch(e, { connected: true });
      client.subscribe(topics, () => {
        client.publish(`device/${deviceId}/command/events/request`, "{}", { qos: 1 });
        client.publish(`device/${deviceId}/command/status/request`, "");
      });
      if (e.keepalive) clearInterval(e.keepalive);
      e.keepalive = setInterval(() => {
        client.publish(`device/${deviceId}/command/events/request`, "{}", { qos: 1 });
      }, 295_000);
    });

    client.on("close", () => patch(e, { connected: false }));
    client.on("offline", () => patch(e, { connected: false }));
    client.on("error", () => patch(e, { connected: false }));

    client.on("message", (topic, buf) => {
      let payload: any;
      try {
        payload = JSON.parse(buf.toString() || "{}");
      } catch {
        return;
      }
      if (topic.endsWith("/data/events")) {
        const ev = payload as Record<string, any>;
        patch(e, {
          cardId: typeof ev.cardId === "string" && ev.cardId !== "none" ? ev.cardId : e.state.cardId,
          chapterKey: ev.chapterKey ?? e.state.chapterKey,
          chapterTitle: ev.chapterTitle ?? e.state.chapterTitle,
          trackKey: ev.trackKey ?? e.state.trackKey,
          trackTitle: ev.trackTitle ?? e.state.trackTitle,
          position: typeof ev.position === "number" ? ev.position : e.state.position,
          trackLength: typeof ev.trackLength === "number" ? ev.trackLength : e.state.trackLength,
          playbackStatus: ev.playbackStatus ?? e.state.playbackStatus,
          volume: typeof ev.volume === "number" ? ev.volume : e.state.volume,
          sleepTimerActive: Boolean(ev.sleepTimerActive),
          sleepTimerSeconds:
            typeof ev.sleepTimerSeconds === "number" ? ev.sleepTimerSeconds : e.state.sleepTimerSeconds,
        });
      } else if (topic.endsWith("/data/status")) {
        const s = (payload?.status ?? payload) as Record<string, any>;
        patch(e, {
          batteryLevel: typeof s.batteryLevel === "number" ? s.batteryLevel : e.state.batteryLevel,
          charging: Boolean(s.charging),
          cardInserted: Boolean(s.cardInserted),
          cardId:
            typeof s.activeCard === "string" && s.activeCard !== "none" ? s.activeCard : e.state.cardId,
          volume: typeof s.volume === "number" ? s.volume : e.state.volume,
        });
      }
    });

    e.client = client;
    return client;
  })();

  try {
    return await e.connecting;
  } finally {
    e.connecting = null;
  }
}

/** Subscribe to a device's live state; returns an unsubscribe function. */
export function subscribeDevice(deviceId: string, listener: Listener): () => void {
  const e = entryFor(deviceId);
  e.refs += 1;
  e.listeners.add(listener);
  listener(e.state);
  void connect(deviceId);

  return () => {
    e.listeners.delete(listener);
    e.refs -= 1;
    if (e.refs <= 0) {
      if (e.keepalive) clearInterval(e.keepalive);
      e.keepalive = null;
      e.client?.end(true);
      e.client = null;
      entries.delete(deviceId);
    }
  };
}

export function getDeviceState(deviceId: string): DeviceState {
  return entries.get(deviceId)?.state ?? EMPTY;
}

async function publish(deviceId: string, suffix: string, payload: unknown = "") {
  const client = await connect(deviceId);
  if (!client) throw new Error("Yoto account not connected");
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  client.publish(`device/${deviceId}/command/${suffix}`, body, { qos: 1 });
}

export const yotoDevice = {
  requestStatus: (id: string) => publish(id, "status/request", ""),
  requestEvents: (id: string) => publish(id, "events/request", "{}"),
  setVolume: (id: string, volume: number) => publish(id, "volume/set", { volume }),
  setSleepTimer: (id: string, seconds: number) => publish(id, "sleep-timer/set", { seconds }),
  pause: (id: string) => publish(id, "card/pause", ""),
  resume: (id: string) => publish(id, "card/resume", ""),
  stop: (id: string) => publish(id, "card/stop", ""),
  reboot: (id: string) => publish(id, "reboot", ""),
  setAmbient: (id: string, r: number, g: number, b: number) => publish(id, "ambients/set", { r, g, b }),
  previewIcon: (id: string, uri: string, timeout = 5) =>
    publish(id, "display/preview", { uri, timeout, animated: 0 }),
  startCard: (
    id: string,
    opts: {
      cardId: string;
      chapterKey?: string;
      trackKey?: string;
      secondsIn?: number;
    },
  ) =>
    publish(id, "card/start", {
      uri: `https://yoto.io/${opts.cardId}`,
      chapterKey: opts.chapterKey ?? "01",
      trackKey: opts.trackKey ?? "01",
      secondsIn: opts.secondsIn ?? 0,
      cutOff: 0,
    }),
};

/**
 * Read the card currently sitting in a player, over MQTT.
 * Asks the device for a fresh status report and waits for the answer.
 */
export async function readInsertedCard(
  deviceId: string,
  timeoutMs = 12_000,
): Promise<{ cardId: string | null; inserted: boolean }> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: { cardId: string | null; inserted: boolean }) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsub();
      resolve(v);
    };
    const unsub = subscribeDevice(deviceId, (s) => {
      if (s.cardId) finish({ cardId: s.cardId, inserted: true });
    });
    const timer = setTimeout(() => {
      const s = getDeviceState(deviceId);
      finish({ cardId: s.cardId, inserted: s.cardInserted });
    }, timeoutMs);
    void yotoDevice.requestStatus(deviceId).catch(() => finish({ cardId: null, inserted: false }));
    void yotoDevice.requestEvents(deviceId).catch(() => {});
  });
}
