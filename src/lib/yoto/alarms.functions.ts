import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { yotoGetJson, yotoPut } from "@/lib/yoto/api.server";

const DAYS_COUNT = 7;

interface DeviceConfigResponse {
  device?: {
    deviceId?: string;
    geoTimezone?: string;
    config?: Record<string, unknown> & {
      alarms?: string[];
      alarmsEnabled?: string | number | boolean;
    };
  };
}

export interface WireAlarmInput {
  time: string; // HH:MM
  days: number[]; // 1 = Mon ... 7 = Sun
  sound_card_id?: string | null;
  volume: number; // 1 - 16
  enabled: boolean;
}

/**
 * Encodes an alarm into Yoto's official wire format:
 * `<7-day-mask>,<HHMM>,<cardId>,,,<volume>,<enabled>`
 * e.g. "1111100,0730,6Mq8g,,,16,1"
 */
function toYotoAlarmString(a: WireAlarmInput): string {
  const mask = Array.from({ length: DAYS_COUNT }, (_, i) =>
    a.days.includes(i + 1) ? "1" : "0",
  ).join("");

  const timeClean = a.time.replace(":", "").padStart(4, "0").slice(0, 4);
  const cardId = (a.sound_card_id ?? "").trim();
  const volume = Math.min(16, Math.max(1, Math.round(a.volume || 10)));
  const enabledFlag = a.enabled ? 1 : 0;

  return `${mask},${timeClean},${cardId},,,${volume},${enabledFlag}`;
}

const syncInput = z.object({
  deviceId: z.string().min(1),
  alarms: z.array(
    z.object({
      time: z.string(),
      days: z.array(z.number()),
      sound_card_id: z.string().nullable().optional(),
      volume: z.number().default(10),
      enabled: z.boolean(),
    }),
  ),
});

/**
 * Persists alarms to the Yoto Cloud REST API (`PUT /device-v2/{deviceId}/config`).
 * Preserves all other device configuration fields and ensures alarmsEnabled = "1".
 */
export const syncPlayerAlarms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => syncInput.parse(data))
  .handler(async ({ data, context }) => {
    const { deviceId, alarms } = data;

    // 1. Fetch current player config to preserve display, nightlight, etc.
    let currentConfig: Record<string, unknown> = {};
    try {
      const resp = await yotoGetJson<DeviceConfigResponse>(
        context.userId,
        `/device-v2/${encodeURIComponent(deviceId)}/config`,
      );
      currentConfig = resp.device?.config ?? {};
    } catch (err) {
      console.warn("Could not read existing device config, using empty base:", err);
    }

    // 2. Generate wire alarm strings
    const alarmStrings = alarms.map(toYotoAlarmString);

    // 3. Save merged config back to Yoto Cloud
    const updatedConfig = {
      ...currentConfig,
      alarms: alarmStrings,
      alarmsEnabled: "1",
    };

    await yotoPut(
      context.userId,
      `/device-v2/${encodeURIComponent(deviceId)}/config`,
      {
        deviceId,
        config: updatedConfig,
      },
    );

    return { success: true, count: alarmStrings.length, alarms: alarmStrings };
  });
