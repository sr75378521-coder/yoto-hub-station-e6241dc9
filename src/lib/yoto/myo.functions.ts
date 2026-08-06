import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { yotoGetJson, yotoPost } from "@/lib/yoto/api.server";
import { deleteCardRaw, uploadAudioToYoto, uploadCoverImageRaw } from "@/lib/yoto/myo.server";

export interface EditableTrack {
  key: string;
  title: string;
  trackUrl: string;
  duration?: number;
  fileSize?: number;
  channels?: string;
  format?: string;
  icon?: string;
}

export interface EditableChapter {
  key: string;
  title: string;
  icon?: string;
  tracks: EditableTrack[];
}

export interface EditableCard {
  cardId: string;
  title: string;
  description: string;
  author: string;
  cover: string;
  editable: boolean;
  chapters: EditableChapter[];
}

export const getCardForEdit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const o = d as { cardId?: unknown };
    if (typeof o?.cardId !== "string") throw new Error("cardId required");
    return { cardId: o.cardId };
  })
  .handler(
    async ({ context, data }): Promise<{ success: boolean; card?: EditableCard; error?: string }> => {
      try {
        const res = await yotoGetJson<Record<string, any>>(
          context.userId,
          `/content/${data.cardId}`,
        );
        const card = (res?.card ?? res) as Record<string, any>;
        const meta = card?.metadata ?? {};
        const pickIcon = (o: any): string | undefined =>
          o?.display?.icon16x16 ?? o?.icon16x16 ?? o?.display?.icon ?? o?.icon ?? undefined;
        const chapters: EditableChapter[] = (card?.content?.chapters ?? []).map(
          (ch: any, i: number) => ({
            key: String(ch?.key ?? i + 1).padStart(2, "0"),
            title: ch?.title ?? `Chapter ${i + 1}`,
            icon: pickIcon(ch) ?? pickIcon(ch?.tracks?.[0]),
            tracks: (ch?.tracks?.length ? ch.tracks : []).map((t: any, ti: number) => ({
              key: String(t?.key ?? ti + 1).padStart(2, "0"),
              title: t?.title ?? `Track ${ti + 1}`,
              trackUrl: t?.trackUrl ?? "",
              duration: typeof t?.duration === "number" ? t.duration : undefined,
              fileSize: typeof t?.fileSize === "number" ? t.fileSize : undefined,
              channels: t?.channels ?? undefined,
              format: t?.format ?? undefined,
              icon: pickIcon(t) ?? pickIcon(ch),
            })),
          }),
        );
        return {
          success: true,
          card: {
            cardId: card?.cardId ?? data.cardId,
            title: meta?.title ?? card?.title ?? "Untitled",
            description: meta?.description ?? "",
            author: meta?.author ?? "",
            cover: meta?.cover?.imageL ?? meta?.cover?.imageM ?? meta?.cover?.imageS ?? "",
            editable: Boolean(card?.userId || card?.createdByClientId || true),
            chapters,
          },
        };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
      }
    },
  );

export const saveCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const o = d as {
      cardId?: unknown;
      title?: unknown;
      description?: unknown;
      cover?: unknown;
      author?: unknown;
      chapters?: unknown;
    };
    if (typeof o?.title !== "string" || !o.title.trim()) throw new Error("Title required");
    if (!Array.isArray(o?.chapters)) throw new Error("chapters required");
    return {
      cardId: typeof o.cardId === "string" ? o.cardId : undefined,
      title: o.title,
      description: typeof o.description === "string" ? o.description : "",
      cover: typeof o.cover === "string" ? o.cover : undefined,
      author: typeof o.author === "string" ? o.author : undefined,
      chapters: o.chapters as EditableChapter[],
    };
  })
  .handler(async ({ context, data }): Promise<{ success: boolean; cardId?: string; error?: string }> => {
    try {
      let totalDuration = 0;
      let totalSize = 0;
      const chapters = data.chapters.map((ch, i) => {
        const key = String(i + 1).padStart(2, "0");
        const tracks = ch.tracks.map((t, ti) => {
          totalDuration += t.duration ?? 0;
          totalSize += t.fileSize ?? 0;
          const tkey = String(ti + 1).padStart(2, "0");
          return {
            key: tkey,
            title: t.title,
            trackUrl: t.trackUrl,
            type: "audio",
            format: t.format ?? "aac",
            duration: t.duration,
            fileSize: t.fileSize,
            channels: t.channels ?? "stereo",
            overlayLabel: String(ti + 1),
            ...(t.icon ? { display: { icon16x16: t.icon } } : {}),
          };
        });
        return {
          key,
          title: ch.title,
          overlayLabel: String(i + 1),
          tracks,
          ...(ch.icon ? { display: { icon16x16: ch.icon } } : {}),
        };
      });

      // Preserve everything Yoto already stores on this card (cover art,
      // author, category, etc.) — a bare metadata object wipes the cover.
      let existingMeta: Record<string, any> = {};
      if (data.cardId) {
        try {
          const cur = await yotoGetJson<Record<string, any>>(
            context.userId,
            `/content/${data.cardId}`,
          );
          existingMeta = ((cur?.card ?? cur) as Record<string, any>)?.metadata ?? {};
        } catch {
          existingMeta = {};
        }
      }

      const cover = data.cover?.trim()
        ? { imageL: data.cover.trim() }
        : (existingMeta.cover ?? undefined);

      const body: Record<string, unknown> = {
        ...(data.cardId ? { cardId: data.cardId } : {}),
        title: data.title,
        content: { chapters },
        metadata: {
          ...existingMeta,
          title: data.title,
          description: data.description,
          ...(data.author !== undefined ? { author: data.author } : {}),
          ...(cover ? { cover } : {}),
          media: {
            ...(existingMeta.media ?? {}),
            duration: totalDuration,
            fileSize: totalSize,
          },
        },
      };

      const res = await yotoPost<Record<string, any>>(context.userId, "/content", body);
      const cardId = res?.cardId ?? res?.card?.cardId ?? data.cardId;
      return { success: true, cardId };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
  });

export const deleteCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const o = d as { cardId?: unknown };
    if (typeof o?.cardId !== "string") throw new Error("cardId required");
    return { cardId: o.cardId };
  })
  .handler(async ({ context, data }): Promise<{ success: boolean; error?: string }> => {
    try {
      await deleteCardRaw(context.userId, data.cardId);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
  });

export const uploadTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    if (!(d instanceof FormData)) throw new Error("FormData required");
    const file = d.get("file");
    if (!(file instanceof File)) throw new Error("file required");
    return { file };
  })
  .handler(
    async ({
      context,
      data,
    }): Promise<{ success: boolean; track?: EditableTrack; error?: string }> => {
      try {
        const bytes = await data.file.arrayBuffer();
        const up = await uploadAudioToYoto(context.userId, {
          name: data.file.name,
          type: data.file.type,
          bytes,
        });
        return {
          success: true,
          track: {
            key: "00",
            title: data.file.name.replace(/\.[^.]+$/, ""),
            trackUrl: `yoto:#${up.sha256}`,
            duration: up.duration,
            fileSize: up.fileSize,
            channels: up.channels,
            format: up.format,
          },
        };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
      }
    },
  );
