import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { yotoPut, yotoGetJson, YotoNotConnectedError } from "@/lib/yoto/api.server";

/**
 * Yoto device command wrappers.
 * Public reverse-engineered endpoints target `/device-v2/{deviceId}/command/{cmd}`.
 * Commands respond quickly; UI shows optimistic feedback and refetches status.
 */

const deviceCmd = (deviceId: string, cmd: string) =>
  `/device-v2/${encodeURIComponent(deviceId)}/command/${cmd}`;

const baseInput = z.object({ deviceId: z.string().min(1) });

async function send(
  userId: string,
  deviceId: string,
  cmd: string,
  body?: unknown,
): Promise<{ ok: true }> {
  await yotoPut(userId, deviceCmd(deviceId, cmd), body);
  return { ok: true };
}

export const playerPlay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => baseInput.parse(d))
  .handler(({ data, context }) => send(context.userId, data.deviceId, "resume"));

export const playerPause = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => baseInput.parse(d))
  .handler(({ data, context }) => send(context.userId, data.deviceId, "pause"));

export const playerStop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => baseInput.parse(d))
  .handler(({ data, context }) => send(context.userId, data.deviceId, "stop"));

export const playerNext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => baseInput.parse(d))
  .handler(({ data, context }) => send(context.userId, data.deviceId, "next"));

export const playerPrevious = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => baseInput.parse(d))
  .handler(({ data, context }) => send(context.userId, data.deviceId, "previous"));

export const playerSeek = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => baseInput.extend({ positionSeconds: z.number().min(0) }).parse(d))
  .handler(({ data, context }) =>
    send(context.userId, data.deviceId, "seek", { position: data.positionSeconds }),
  );

export const playerSetVolume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    baseInput.extend({ volume: z.number().int().min(0).max(100) }).parse(d),
  )
  .handler(({ data, context }) =>
    send(context.userId, data.deviceId, "set-volume", { volume: data.volume }),
  );

export const playerMute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => baseInput.extend({ mute: z.boolean() }).parse(d))
  .handler(({ data, context }) =>
    send(context.userId, data.deviceId, data.mute ? "mute" : "unmute"),
  );

export const playerShuffle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => baseInput.extend({ shuffle: z.boolean() }).parse(d))
  .handler(({ data, context }) =>
    send(context.userId, data.deviceId, "set-shuffle", { shuffle: data.shuffle }),
  );

export const playerRepeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    baseInput.extend({ repeat: z.enum(["off", "one", "all"]) }).parse(d),
  )
  .handler(({ data, context }) =>
    send(context.userId, data.deviceId, "set-repeat", { repeat: data.repeat }),
  );

export const playerSleepTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    baseInput.extend({ minutes: z.number().int().min(0).max(240) }).parse(d),
  )
  .handler(({ data, context }) =>
    send(context.userId, data.deviceId, "sleep", { minutes: data.minutes }),
  );

/** Fetch live status for a single device. */
export interface PlayerStatus {
  deviceId: string;
  online: boolean;
  playing: boolean;
  paused: boolean;
  volume: number | null;
  muted: boolean;
  shuffle: boolean;
  repeat: "off" | "one" | "all";
  positionSeconds: number | null;
  durationSeconds: number | null;
  trackTitle: string | null;
  cardTitle: string | null;
  artwork: string | null;
  sleepMinutesRemaining: number | null;
  batteryPercent: number | null;
  raw?: unknown;
}

interface YotoDeviceStatusResponse {
  device?: {
    deviceId?: string;
    online?: boolean;
    status?: Record<string, unknown>;
  };
  status?: Record<string, unknown>;
}

function pickNumber(...vals: unknown[]): number | null {
  for (const v of vals) if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}
function pickString(...vals: unknown[]): string | null {
  for (const v of vals) if (typeof v === "string" && v.length) return v;
  return null;
}
function pickBool(...vals: unknown[]): boolean {
  for (const v of vals) if (typeof v === "boolean") return v;
  return false;
}

export const getPlayerStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => baseInput.parse(d))
  .handler(async ({ data, context }): Promise<PlayerStatus | { notConnected: true }> => {
    try {
      const res = await yotoGetJson<YotoDeviceStatusResponse>(
        context.userId,
        `/device-v2/${encodeURIComponent(data.deviceId)}/status`,
      );
      const s = (res.status ?? res.device?.status ?? {}) as Record<string, any>;
      const playback = (s.playback ?? s.player ?? s) as Record<string, any>;
      const repeatRaw = pickString(playback.repeat, s.repeat);
      const repeat: "off" | "one" | "all" =
        repeatRaw === "one" || repeatRaw === "all" ? repeatRaw : "off";
      return {
        deviceId: data.deviceId,
        online: pickBool(res.device?.online, s.online),
        playing: pickBool(playback.playing, s.playing),
        paused: pickBool(playback.paused, s.paused),
        volume: pickNumber(playback.volume, s.volume),
        muted: pickBool(playback.muted, s.muted),
        shuffle: pickBool(playback.shuffle, s.shuffle),
        repeat,
        positionSeconds: pickNumber(playback.position, s.position, playback.elapsed),
        durationSeconds: pickNumber(playback.duration, s.duration),
        trackTitle: pickString(playback.trackTitle, playback.title, s.trackTitle),
        cardTitle: pickString(playback.cardTitle, s.cardTitle, s.title),
        artwork: pickString(playback.artwork, s.artwork, playback.coverUri),
        sleepMinutesRemaining: pickNumber(playback.sleepMinutes, s.sleepMinutesRemaining),
        batteryPercent: pickNumber(s.batteryLevel, s.battery, s.batteryPercent),
      };
    } catch (e) {
      if (e instanceof YotoNotConnectedError) return { notConnected: true };
      throw e;
    }
  });
