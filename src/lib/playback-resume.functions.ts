import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PlaybackResumeTarget = "browser" | "player";

export interface PlaybackCheckpoint {
  target: PlaybackResumeTarget;
  targetId: string;
  state: Record<string, unknown>;
  updatedAt: string;
}

function validateCheckpointInput(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Playback checkpoint is required");
  const value = input as Record<string, unknown>;
  if (value.target !== "browser" && value.target !== "player") {
    throw new Error("Invalid playback target");
  }
  if (typeof value.targetId !== "string" || !value.targetId.trim() || value.targetId.length > 200) {
    throw new Error("Invalid playback target ID");
  }
  if (!value.state || typeof value.state !== "object" || Array.isArray(value.state)) {
    throw new Error("Invalid playback state");
  }
  const serialized = JSON.stringify(value.state);
  if (serialized.length > 200_000) throw new Error("Playback state is too large");
  return {
    target: value.target,
    targetId: value.targetId,
    state: value.state as Record<string, unknown>,
  };
}

export const savePlaybackCheckpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => validateCheckpointInput(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("playback_checkpoints")
      .upsert(
        {
          user_id: context.userId,
          target: data.target,
          target_id: data.targetId,
          state: data.state,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,target,target_id" },
      );
    if (error) throw new Error("Could not save playback progress");
    return { success: true };
  });

export const getPlaybackCheckpoint = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Playback target is required");
    const value = input as Record<string, unknown>;
    if (value.target !== "browser" && value.target !== "player") {
      throw new Error("Invalid playback target");
    }
    if (typeof value.targetId !== "string" || !value.targetId.trim() || value.targetId.length > 200) {
      throw new Error("Invalid playback target ID");
    }
    return { target: value.target, targetId: value.targetId };
  })
  .handler(async ({ context, data }): Promise<PlaybackCheckpoint | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any)
      .from("playback_checkpoints")
      .select("target, target_id, state, updated_at")
      .eq("user_id", context.userId)
      .eq("target", data.target)
      .eq("target_id", data.targetId)
      .maybeSingle();
    if (error) throw new Error("Could not load playback progress");
    if (!row) return null;
    return {
      target: row.target,
      targetId: row.target_id,
      state: row.state as Record<string, unknown>,
      updatedAt: row.updated_at,
    };
  });
