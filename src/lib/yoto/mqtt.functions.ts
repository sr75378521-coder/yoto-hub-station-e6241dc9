import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getValidAccessToken } from "@/lib/yoto/tokens.server";

export interface YotoMqttAuth {
  available: boolean;
  url?: string;
  token?: string;
  reason?: string;
}

/**
 * Yoto players are controlled over MQTT (AWS IoT), authenticated with the
 * user's own Yoto access token as the MQTT password — see
 * https://yoto.dev/players-mqtt/connecting-to-players/
 * The REST /device-v2/{id}/status + /command endpoints require private
 * scopes that public apps cannot get, so everything live goes through here.
 */
export const getYotoMqttAuth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<YotoMqttAuth> => {
    const token = await getValidAccessToken(context.userId);
    if (!token) return { available: false, reason: "not_connected" };
    return {
      available: true,
      url: "wss://aqrphjqbp3u2z-ats.iot.eu-west-2.amazonaws.com/mqtt",
      token,
    };
  });
