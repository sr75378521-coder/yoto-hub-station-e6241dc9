import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Record a signed-in user's page visit. The user identity always comes from auth context. */
export const trackPageVisit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pagePath: string }) => {
    if (
      typeof input?.pagePath !== "string" ||
      !input.pagePath.startsWith("/") ||
      input.pagePath.length > 500 ||
      input.pagePath.startsWith("//")
    ) {
      throw new Error("Invalid page path");
    }
    return { pagePath: input.pagePath };
  })
  .handler(async ({ context, data }) => {
    const db = context.supabase as any;
    const { error } = await db.from("analytics_page_visits").insert({
      user_id: context.userId,
      page_path: data.pagePath,
    });
    if (error) throw new Error("Could not record page visit");
    return { success: true };
  });

export interface AdminPageVisit {
  id: string;
  email: string | null;
  page_path: string;
  visited_at: string;
}

/** List recent visits; both the admin check and data access happen server-side. */
export const getAdminPageVisits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ visits: AdminPageVisit[] }> => {
    const { data: role } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: rows, error }, { data: users, error: usersError }] = await Promise.all([
      admin
        .from("analytics_page_visits")
        .select("id, user_id, page_path, visited_at")
        .gte("visited_at", since)
        .order("visited_at", { ascending: false })
        .limit(1000),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (error) throw new Error("Could not load page visits");
    if (usersError) throw new Error("Could not load user accounts");

    const emails = new Map((users?.users ?? []).map((user) => [user.id, user.email ?? null]));
    return {
      visits: (rows ?? []).map((row: Omit<AdminPageVisit, "email"> & { user_id: string }) => ({
        id: row.id,
        email: emails.get(row.user_id) ?? null,
        page_path: row.page_path,
        visited_at: row.visited_at,
      })),
    };
  });
