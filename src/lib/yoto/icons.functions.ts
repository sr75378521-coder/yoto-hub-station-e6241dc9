import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listIconsRaw, uploadIconRaw, type YotoIcon } from "@/lib/yoto/icons.server";

export type { YotoIcon };

export const listIcons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ success: boolean; icons: YotoIcon[]; error?: string }> => {
    try {
      return { success: true, icons: await listIconsRaw(context.userId) };
    } catch (e) {
      return { success: false, icons: [], error: e instanceof Error ? e.message : "Unknown error" };
    }
  });

export const uploadIcon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    if (!(d instanceof FormData)) throw new Error("FormData required");
    const file = d.get("file");
    if (!(file instanceof File)) throw new Error("file required");
    return { file };
  })
  .handler(async ({ context, data }): Promise<{ success: boolean; icon?: YotoIcon; error?: string }> => {
    try {
      const bytes = await data.file.arrayBuffer();
      const icon = await uploadIconRaw(context.userId, {
        name: data.file.name,
        type: data.file.type,
        bytes,
      });
      return { success: true, icon };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
  });
