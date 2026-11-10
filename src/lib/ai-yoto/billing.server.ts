import { PLANS, planFromPrice, type PlanId } from "./plans";
import { effectivePlan } from "./membership-rules";

export async function stripeRequest(path: string, body?: URLSearchParams, idempotencyKey?: string) {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) throw new Error("Stripe is not configured yet.");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": "2025-08-27.basil",
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error?.message ?? "Stripe could not complete this request.");
  return result;
}

export async function getMembership(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: account, error: accountError } = await supabaseAdmin
    .from("billing_accounts")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (accountError) throw accountError;
  const grantResult = await supabaseAdmin
    .from("membership_grants")
    .select("plan,expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (grantResult.error) throw grantResult.error;
  let plan: PlanId = "free";
  let period = `free:${new Date().toISOString().slice(0, 7)}`;
  let renewsAt = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1),
  ).toISOString();
  let cancelAtPeriodEnd = false;
  if (account) {
    const subscriptions = await stripeRequest(
      `subscriptions?customer=${encodeURIComponent(account.stripe_customer_id)}&status=all&limit=100`,
    );
    const paid = subscriptions.data
      .filter((s: any) => ["active", "trialing"].includes(s.status))
      .map((s: any) => ({
        subscription: s,
        item: s.items?.data?.find((i: any) => planFromPrice(i.price?.id) !== "free"),
      }))
      .filter((s: any) => s.item)
      .sort(
        (a: any, b: any) =>
          PLANS[planFromPrice(b.item.price.id)].rank - PLANS[planFromPrice(a.item.price.id)].rank,
      )[0];
    if (paid) {
      plan = planFromPrice(paid.item.price.id);
      // A shared paid-period key prevents upgrades from awarding a second allowance.
      period = `paid:${account.stripe_customer_id}:${paid.item.current_period_start ?? paid.subscription.current_period_start}`;
      renewsAt = new Date(
        (paid.item.current_period_end ?? paid.subscription.current_period_end) * 1000,
      ).toISOString();
      cancelAtPeriodEnd = Boolean(paid.subscription.cancel_at_period_end);
    }
  }
  const paidPlan = plan;
  plan = effectivePlan(paidPlan, grantResult.data);
  const complimentary = plan !== paidPlan;
  if (complimentary && paidPlan === "free") period = `free:${new Date().toISOString().slice(0, 7)}`;
  const { data: usage, error } = await supabaseAdmin
    .from("ai_credit_usage")
    .select("credits")
    .eq("user_id", userId)
    .eq("period", period)
    .in("status", ["reserved", "completed"]);
  if (error) throw error;
  const used = (usage ?? []).reduce((sum, row) => sum + row.credits, 0);
  return {
    plan,
    paidPlan,
    complimentary,
    grantExpiresAt: complimentary ? (grantResult.data?.expires_at ?? null) : null,
    period,
    allowance: PLANS[plan].credits,
    used,
    remaining: Math.max(0, PLANS[plan].credits - used),
    renewsAt,
    cancelAtPeriodEnd,
    hasCustomer: Boolean(account),
  };
}
