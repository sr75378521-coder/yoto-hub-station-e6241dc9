import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PlaybackResumeTarget = "browser" | "player";

export interface PlaybackCheckpoint {
  target: PlaybackResumeTarget;
  targetId: string;
  state: Record<string, unknown>;
  updatedAt: string;
}

export interface PlaybackBookmark {
  id: string;
  target: PlaybackResumeTarget;
  targetId: string;
  label: string;
  state: Record<string, unknown>;
  createdAt: string;
}

const targetSchema = z.object({
  target: z.enum(["browser", "player"]),
  targetId: z.string().trim().min(1).max(200),
});
const stateSchema = z
  .record(z.string(), z.unknown())
  .refine((state) => JSON.stringify(state).length <= 200_000, "Playback state is too large");

export const savePlaybackCheckpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const value = input as Record<string, unknown>;
    return { ...targetSchema.parse(value), state: stateSchema.parse(value.state) };
  })
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
  .inputValidator((input: unknown) => targetSchema.parse(input))
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

/** Save a named position in the current browser queue for the signed-in user. */
export const savePlaybackBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const value = input as Record<string, unknown>;
    return {
      target: z.literal("browser").parse(value.target),
      targetId: z.string().trim().min(1).max(200).parse(value.targetId),
      label: z.string().trim().min(1).max(100).parse(value.label),
      state: stateSchema.parse(value.state),
    };
  })
  .handler(async ({ context, data }): Promise<{ success: true; id: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any)
      .from("playback_bookmarks")
      .insert({
        user_id: context.userId,
        target: data.target,
        target_id: data.targetId,
        label: data.label,
        state: data.state,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error("Could not save bookmark");
    return { success: true, id: row.id };
  });

export const getPlaybackBookmarks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (input == null) return { target: "browser" as const };
    return z.object({ target: z.enum(["browser", "player"]).optional() }).parse(input);
  })
  .handler(async ({ context, data }): Promise<PlaybackBookmark[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = (supabaseAdmin as any)
      .from("playback_bookmarks")
      .select("id, target, target_id, label, state, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.target) query = query.eq("target", data.target);
    const { data: rows, error } = await query;
    if (error) throw new Error("Could not load bookmarks");
    return (rows ?? []).map((row: any) => ({
      id: row.id,
      target: row.target,
      targetId: row.target_id,
      label: row.label,
      state: row.state as Record<string, unknown>,
      createdAt: row.created_at,
    }));
  });

export const deletePlaybackBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("playback_bookmarks")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not delete bookmark");
    return { success: true };
  });
