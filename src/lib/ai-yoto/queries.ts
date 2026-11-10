import { queryOptions } from "@tanstack/react-query";
import { membership } from "./billing.functions";
import { supabase } from "@/integrations/supabase/client";
import { getYotoConnectionStatus } from "@/lib/players.functions";
import type { AiChapter } from "./plans";

export interface Draft {
  id: string;
  title: string;
  chapters: AiChapter[];
  yoto_card_id: string | null;
  updated_at: string;
}
export const membershipOptions = () =>
  queryOptions({
    queryKey: ["membership"],
    queryFn: () => membership(),
    refetchInterval: 60000,
    retry: false,
  });
export const connectionOptions = () =>
  queryOptions({
    queryKey: ["yoto-connection-status"],
    queryFn: () => getYotoConnectionStatus(),
    retry: false,
  });
export const draftsOptions = () =>
  queryOptions({
    queryKey: ["ai-yoto-drafts"],
    queryFn: async (): Promise<Draft[]> => {
      const { data, error } = await supabase
        .from("ai_yoto_drafts")
        .select("id,title,chapters,yoto_card_id,updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data.map((d) => ({ ...d, chapters: d.chapters as unknown as AiChapter[] }));
    },
  });
