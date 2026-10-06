import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { yotoPost } from "@/lib/yoto/api.server";
import { uploadAudioToYoto } from "@/lib/yoto/myo.server";

type YotoTrack = {
  trackUrl: string;
  duration?: number;
  fileSize?: number;
  channels?: string;
  format?: string;
};

/** Upload one Spark Studio box's audio to Yoto (cached on the box once done). */
export const uploadStudioCheckpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const o = d as { checkpointId?: unknown };
    if (typeof o?.checkpointId !== "string") throw new Error("checkpointId required");
    return { checkpointId: o.checkpointId };
  })
  .handler(async ({ context, data }): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data: cp, error } = await context.supabase
        .from("checkpoints")
        .select("id, audio_path, audio_name, yoto_track")
        .eq("id", data.checkpointId)
        .single();
      if (error || !cp) throw new Error("Box not found");
      if (cp.yoto_track) return { success: true };
      if (!cp.audio_path) throw new Error("This box has no audio file");
      const file = await context.supabase.storage.from("studio-audio").download(cp.audio_path);
      if (file.error || !file.data) throw new Error("Couldn't read the audio file");
      const up = await uploadAudioToYoto(context.userId, {
        name: cp.audio_name ?? "audio.mp3",
        type: file.data.type || "audio/mpeg",
        bytes: await file.data.arrayBuffer(),
      });
      const track: YotoTrack = {
        trackUrl: `yoto:#${up.sha256}`,
        duration: up.duration,
        fileSize: up.fileSize,
        channels: up.channels,
        format: up.format,
      };
      const upd = await context.supabase
        .from("checkpoints")
        .update({ yoto_track: track })
        .eq("id", cp.id);
      if (upd.error) throw upd.error;
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Upload failed" };
    }
  });

/** Build the Yoto playlist from the flow chart and save it to the user's Yoto account. */
export const publishStudioProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const o = d as { projectId?: unknown };
    if (typeof o?.projectId !== "string") throw new Error("projectId required");
    return { projectId: o.projectId };
  })
  .handler(async ({ context, data }): Promise<{ success: boolean; cardId?: string; error?: string }> => {
    try {
      const { data: project, error: pErr } = await context.supabase
        .from("studio_projects")
        .select("*")
        .eq("id", data.projectId)
        .single();
      if (pErr || !project) throw new Error("Playlist not found");
      const { data: rows, error } = await context.supabase
        .from("checkpoints")
        .select("*")
        .eq("project_id", data.projectId);
      if (error) throw error;
      if (!rows?.length) throw new Error("Add at least one audio box first");

      // Top-to-bottom order (start box first).
      const list = [...rows].sort((a, b) =>
        a.is_start !== b.is_start ? (a.is_start ? -1 : 1) : a.pos_y - b.pos_y || a.pos_x - b.pos_x,
      );
      const missing = list.find((c) => !c.yoto_track);
      if (missing) throw new Error(`"${missing.title}" hasn't been uploaded yet`);

      const keyOf = new Map(list.map((c, i) => [c.id, String(i + 1).padStart(2, "0")]));
      const goTo = (id: string | null) => {
        const k = id ? keyOf.get(id) : undefined;
        return k ? { cmd: "goto", params: { chapterKey: k, trackKey: "01" } } : undefined;
      };

      let duration = 0;
      let fileSize = 0;
      const chapters = list.map((c, i) => {
        const t = c.yoto_track as unknown as YotoTrack;
        duration += t.duration ?? 0;
        fileSize += t.fileSize ?? 0;
        const events: Record<string, unknown> = {};
        const onEnd = c.auto_advance ? goTo(c.auto_target) : { cmd: "stop" };
        if (onEnd) events.onEnd = onEnd;
        const left = c.left_action === "jump" ? goTo(c.left_target) : undefined;
        const right = c.right_action === "jump" ? goTo(c.right_target) : undefined;
        if (left) events.onLhb = left;
        if (right) events.onRhb = right;
        const key = String(i + 1).padStart(2, "0");
        return {
          key,
          title: c.title,
          overlayLabel: String(i + 1),
          tracks: [
            {
              key: "01",
              title: c.title,
              overlayLabel: String(i + 1),
              trackUrl: t.trackUrl,
              type: "audio",
              format: t.format ?? "aac",
              duration: t.duration,
              fileSize: t.fileSize,
              channels: t.channels ?? "stereo",
              ...(c.loop_audio ? { events: { ...events, onEnd: { cmd: "repeat" } } } : Object.keys(events).length ? { events } : {}),
            },
          ],
          ...(c.is_checkpoint ? { checkpoint: true } : {}),
        };
      });

      const res = await yotoPost<Record<string, any>>(context.userId, "/content", {
        ...(project.yoto_card_id ? { cardId: project.yoto_card_id } : {}),
        title: project.title,
        content: { chapters, playbackType: "interactive" },
        metadata: {
          title: project.title,
          description: project.description ?? "",
          media: { duration, fileSize },
        },
      });
      const cardId: string | undefined = res?.cardId ?? res?.card?.cardId ?? project.yoto_card_id ?? undefined;
      if (cardId && cardId !== project.yoto_card_id) {
        await context.supabase.from("studio_projects").update({ yoto_card_id: cardId }).eq("id", project.id);
      }
      return { success: true, cardId };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Save failed" };
    }
  });
