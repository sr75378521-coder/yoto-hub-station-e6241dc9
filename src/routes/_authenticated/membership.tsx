import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState } from 'react';
import { Check, CreditCard, RefreshCw, Sparkles } from 'lucide-react';
import { AppShell } from '@/components/app/AppShell';
import { Button } from '@/components/ui/button';
import { PLANS, AI_COSTS, type PlanId } from '@/lib/ai-yoto/plans';
import { membershipOptions } from '@/lib/ai-yoto/queries';
import { checkout, billingPortal } from '@/lib/ai-yoto/billing.functions';

export const Route = createFileRoute('/_authenticated/membership')({
  head: () => ({ meta: [
    { title: 'Membership · Yoto Control Center' }, { name: 'description', content: 'Manage your Yoto AI membership, monthly credits and subscription.' },
    { property: 'og:title', content: 'Yoto AI Membership' }, { property: 'og:description', content: 'Basic, Pro and Pro Max memberships for your Yoto audio projects.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(membershipOptions()),
  component: MembershipPage,
});
function MembershipPage() {
  const membership = useSuspenseQuery(membershipOptions());
  const startCheckout = useServerFn(checkout), portal = useServerFn(billingPortal);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const current = membership.data;
  useEffect(() => {
    const refresh = () => { void membership.refetch(); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [membership.refetch]);
  async function pay(plan?: Exclude<PlanId, 'free'>) {
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    setBusy(true); setError('');
    try {
      const result = plan && current.paidPlan === 'free' ? await startCheckout({ data: { plan } }) : await portal();
      if (tab) tab.location.href = result.url; else window.location.assign(result.url);
    } catch (e) { tab?.close(); setError(e instanceof Error ? e.message : 'Could not open billing.'); }
    finally { setBusy(false); }
  }
  return <AppShell title="Membership"><div className="mx-auto max-w-5xl space-y-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-display text-3xl font-bold">Your membership</h2><p className="mt-2 text-muted-foreground">{PLANS[current.plan].name} · {current.remaining} of {current.allowance} credits remaining</p></div><Button variant="outline" onClick={() => membership.refetch()} disabled={membership.isFetching}><RefreshCw className="size-4" />Refresh</Button></div>
    {current.complimentary && <p className="border-l-2 border-primary pl-3 text-sm">Complimentary {PLANS[current.plan].name} · {current.grantExpiresAt ? `Ends ${new Date(current.grantExpiresAt).toLocaleDateString()}` : 'No expiration'} · No payment required</p>}
    <div className="border-y py-5"><div className="flex flex-wrap justify-between gap-3"><div><strong className="text-lg">{current.remaining} credits</strong><p className="mt-1 text-sm text-muted-foreground">{current.cancelAtPeriodEnd ? 'Plan ends' : 'Credits renew'} {new Date(current.renewsAt).toLocaleDateString()}</p></div>{current.hasCustomer && <Button variant="outline" onClick={() => pay()} disabled={busy}><CreditCard className="size-4" />Manage subscription</Button>}</div></div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-3">{(['basic', 'pro', 'pro_max'] as const).map(id => <div key={id} className={`flex flex-col rounded-lg border p-5 ${current.plan === id ? 'border-primary bg-primary/5' : 'bg-card'}`}>
      <div className="flex items-center justify-between gap-2"><h3 className="text-xl font-bold">{PLANS[id].name}</h3>{current.plan === id && <Check className="size-5 text-primary" />}</div>
      <p className="mt-4"><span className="text-3xl font-bold">${PLANS[id].price}</span><span className="text-sm text-muted-foreground"> USD / month</span></p>
      <ul className="my-6 flex-1 space-y-3 text-sm">{[`${PLANS[id].credits} monthly credits`, 'Audio transcription & chapters', 'Yoto publishing & AI assistant', 'Chapter numbering · no credits', 'Public playlists & LibriVox library', ...(id !== 'basic' ? ['AI pixel icons', 'Clean chapter filenames · no credits'] : []), ...(id === 'pro_max' ? ['Animated AI icons', 'Group chapters by duration · no credits'] : [])].map(item => <li key={item} className="flex gap-2"><Check className="size-4 shrink-0 text-primary" />{item}</li>)}</ul>
       <Button variant={current.plan === id ? 'outline' : 'default'} disabled={busy || current.plan === id || (current.complimentary && PLANS[id].rank <= PLANS[current.plan].rank)} onClick={() => pay(id)}>{current.plan === id ? 'Your plan' : current.complimentary && PLANS[id].rank <= PLANS[current.plan].rank ? 'Included in your award' : current.paidPlan !== 'free' ? 'Change plan' : `Choose ${PLANS[id].name}`}</Button>
    </div>)}</div>
    <div className="space-y-2 text-sm text-muted-foreground"><p>Free includes 5 monthly credits. Transcription: 1 credit per started minute. Chapter organization and assistant: 1 credit. Static icon: {AI_COSTS.icon} credits. Animated icon: {AI_COSTS.animated} credits.</p><p>Credits reset each month and do not roll over. Failed AI requests are not charged.</p></div>
    <Button asChild variant="outline"><Link to="/ai-yoto"><Sparkles className="size-4" />Open AI Yoto</Link></Button>
    <Button asChild variant="outline"><Link to="/public-playlists">Public playlists &amp; audiobooks</Link></Button>
  </div></AppShell>;
}