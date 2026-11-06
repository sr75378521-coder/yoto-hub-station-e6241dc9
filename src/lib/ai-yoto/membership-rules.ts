import { PLANS, type PlanId } from './plans';

export function effectivePlan(paid: PlanId, grant: { plan: string; expires_at: string | null } | null, now = Date.now()): PlanId {
  if (!grant || (grant.expires_at && Date.parse(grant.expires_at) <= now) || !Object.hasOwn(PLANS, grant.plan)) return paid;
  const awarded = grant.plan as PlanId;
  return PLANS[awarded].rank > PLANS[paid].rank ? awarded : paid;
}

export function assertMembershipAdmin(isAdmin: boolean) {
  if (!isAdmin) throw new Error('Only administrators can award memberships.');
}