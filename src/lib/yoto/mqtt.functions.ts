import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { yotoGetJson, YotoNotConnectedError } from "@/lib/yoto/api.server";

export interface MqttCredentials {
  available: boolean;
  url?: string;
  username?: string;
  password?: string;
  clientId?: string;
  topicPrefix?: string;
  reason?: string;
}

/**
 * Best-effort fetch of MQTT credentials from Yoto.
 * The official endpoint is not publicly documented; we try a couple of
 * known paths and return `available: false` when none work so the client
 * gracefully falls back to REST polling.
 */
export const getMqttCredentials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MqttCredentials> => {
    const candidates = [
      "/device-v2/mqtt/credentials",
      "/device-v2/mqtt/client",
      "/mqtt/credentials",
    ];
    for (const path of candidates) {
      try {
        const data = await yotoGetJson<Record<string, any>>(context.userId, path);
        const url =
          data.url ?? data.wssUrl ?? data.endpoint
            ? (data.wssUrl as string) ?? (data.url as string) ?? (data.endpoint as string)
            : undefined;
        if (url) {
          return {
            available: true,
            url,
            username: data.username,
            password: data.password ?? data.token,
            clientId: data.clientId,
            topicPrefix: data.topicPrefix ?? "device/",
          };
        }
      } catch (e) {
        if (e instanceof YotoNotConnectedError) {
          return { available: false, reason: "not_connected" };
        }
        // try next candidate
      }
    }
    return { available: false, reason: "unavailable" };
  });
