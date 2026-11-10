import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const transcribeSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ path: z.string().max(300) }).parse(input))
  .handler(async ({ context, data }) => {
    if (!data.path.startsWith(`${context.userId}/ai-yoto/`) || data.path.includes(".."))
      throw new Error("Invalid audio path.");
    const { transcribeStored } = await import("./ai.server");
    return transcribeStored(context.userId, data.path);
  });
export const organizeSegments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        key: z.string().uuid(),
        segments: z
          .array(
            z.object({
              start: z.number().nonnegative(),
              end: z.number().positive(),
              path: z.string(),
              transcript: z.string().max(20000),
            }),
          )
          .min(1)
          .max(1500),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    if (data.segments.some((s) => !s.path.startsWith(`${context.userId}/ai-yoto/`)))
      throw new Error("Invalid audio path.");
    const { organizeAudio } = await import("./ai.server");
    return organizeAudio(context.userId, data.key, data.segments);
  });
export const assistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ key: z.string().uuid(), prompt: z.string().min(1).max(12000) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { askAssistant } = await import("./ai.server");
    return askAssistant(context.userId, data.key, data.prompt);
  });
export const generatePixels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        key: z.string().uuid(),
        prompt: z.string().min(1).max(1000),
        animated: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { makePixels } = await import("./ai.server");
    return makePixels(context.userId, data.key, data.prompt, data.animated);
  });
export const chatEditPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        key: z.string().uuid(),
        history: z
          .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
          .min(1)
          .max(30),
        playlist: z.object({
          title: z.string().max(200),
          chapters: z
            .array(
              z.object({
                title: z.string().max(200),
                minutes: z.number().finite().nonnegative(),
                excerpt: z.string().max(600),
              }),
            )
            .max(200),
        }),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { chatEdit } = await import("./ai.server");
    return chatEdit(context.userId, data.key, data.history, data.playlist);
  });
