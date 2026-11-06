import { getMembership } from './billing.server';
import { canUseAction } from './plans';

export async function withCredits<T>(userId: string, key: string, cost: number, action: string, work: () => Promise<T>): Promise<T> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const block = await supabaseAdmin.from('ai_gateway_blocks').select('message').eq('id', 'workspace').maybeSingle();
  if (block.error) throw block.error;
  if (block.data) throw new Error(block.data.message);
  const membership = await getMembership(userId);
  if (!canUseAction(membership.plan, action)) throw new Error(action === 'animated' ? 'Animated icons require Pro Max.' : 'AI icons require Pro or Pro Max.');
  const reserved = await supabaseAdmin.rpc('reserve_ai_credits', { p_user: userId, p_period: membership.period, p_key: key, p_cost: cost, p_allowance: membership.allowance });
  if (reserved.error) throw new Error(reserved.error.message);
  const record = reserved.data as { cached?: boolean; result?: T } | null;
  if (record?.cached && record.result !== undefined) return record.result;
  try {
    const result = await work();
    const saved = await supabaseAdmin.from('ai_credit_usage').update({ status: 'completed', result: JSON.parse(JSON.stringify(result)) }).eq('user_id', userId).eq('request_key', key);
    if (saved.error) throw saved.error;
    return result;
  } catch (error) {
    await supabaseAdmin.from('ai_credit_usage').update({ status: 'failed' }).eq('user_id', userId).eq('request_key', key);
    throw error;
  }
}

export async function checkedGatewayFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    const body = await response.clone().json().catch(() => ({}));
    const message = body.message ?? body.error?.message ?? `AI request failed (${response.status}).`;
    if ([402, 403].includes(response.status)) {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const { error } = await supabaseAdmin.from('ai_gateway_blocks').upsert({ id: 'workspace', status: response.status, message, updated_at: new Date().toISOString() });
      if (error) throw new Error('AI access is blocked and could not be recorded.');
    }
    throw new Error(message);
  }
  return response;
}
