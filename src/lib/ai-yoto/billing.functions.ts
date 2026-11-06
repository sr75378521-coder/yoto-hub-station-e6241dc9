import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { PLANS } from './plans';

export const membership = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { getMembership } = await import('./billing.server');
  return getMembership(context.userId);
});
export const checkout = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ plan: z.enum(['basic', 'pro', 'pro_max']) }).parse(input)).handler(async ({ context, data }) => {
  const { stripeRequest, getMembership } = await import('./billing.server');
  const current = await getMembership(context.userId);
  if (current.paidPlan !== 'free') throw new Error('Manage your existing subscription to change plans.');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const account = await supabaseAdmin.from('billing_accounts').select('stripe_customer_id').eq('user_id', context.userId).maybeSingle();
  if (account.error) throw account.error;
  let customer = account.data?.stripe_customer_id;
  if (!customer) {
    const user = await context.supabase.auth.getUser();
    const params = new URLSearchParams({ 'metadata[app_user_id]': context.userId });
    if (user.data.user?.email) params.set('email', user.data.user.email);
    const created = await stripeRequest('customers', params, `yoto-customer-${context.userId}`);
    customer = created.id;
    const saved = await supabaseAdmin.from('billing_accounts').upsert({ user_id: context.userId, stripe_customer_id: created.id });
    if (saved.error) throw saved.error;
  }
  const origin = new URL(getRequest().url).origin;
  const session = await stripeRequest('checkout/sessions', new URLSearchParams({ customer: String(customer), mode: 'subscription', 'line_items[0][price]': PLANS[data.plan].priceId, 'line_items[0][quantity]': '1', success_url: `${origin}/membership?checkout=success`, cancel_url: `${origin}/membership`, 'subscription_data[metadata][app_user_id]': context.userId }));
  return { url: session.url as string };
});
export const billingPortal = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const account = await context.supabase.from('billing_accounts').select('stripe_customer_id').eq('user_id', context.userId).single();
  if (account.error) throw new Error('No subscription account yet.');
  const { stripeRequest } = await import('./billing.server');
  const session = await stripeRequest('billing_portal/sessions', new URLSearchParams({ customer: account.data.stripe_customer_id, return_url: `${new URL(getRequest().url).origin}/membership` }));
  return { url: session.url as string };
});