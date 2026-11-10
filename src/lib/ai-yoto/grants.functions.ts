import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertMembershipAdmin } from "./membership-rules";

export const listMembershipGrants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (role.error) throw role.error;
    assertMembershipAdmin(role.data === true);
    const result = await context.supabase
      .from("membership_grants")
      .select("user_id,plan,expires_at");
    if (result.error) throw result.error;
    return result.data;
  });

export const awardMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        plan: z.enum(["basic", "pro", "pro_max"]).nullable(),
        months: z.number().int().min(0).max(36),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const role = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (role.error) throw role.error;
    assertMembershipAdmin(role.data === true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const account = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (account.error || !account.data.user) throw new Error("This account does not exist.");
    if (!data.plan) {
      const result = await supabaseAdmin
        .from("membership_grants")
        .delete()
        .eq("user_id", data.userId);
      if (result.error) throw result.error;
    } else {
      const end = new Date();
      end.setUTCMonth(end.getUTCMonth() + data.months);
      const result = await supabaseAdmin
        .from("membership_grants")
        .upsert({
          user_id: data.userId,
          plan: data.plan,
          expires_at: data.months ? end.toISOString() : null,
          granted_by: context.userId,
          updated_at: new Date().toISOString(),
        });
      if (result.error) throw result.error;
    }
    return { success: true };
  });
