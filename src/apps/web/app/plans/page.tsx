import type { Metadata } from 'next';
import { api } from '../../site/api.ts';
import { Plans } from '../../site/account/Plans.tsx';

export const metadata: Metadata = { title: 'Plans', description: 'StockPanic is free. Paid adds more alerts, longer history and advanced filters.' };

export default async function PlansPage() {
  const [plans, me, billing] = await Promise.all([
    api<{ plans: { id: 'monthly' | 'yearly'; price_inr: number }[] }>('/v1/plans'),
    api<{ tier: 'free' | 'paid'; trial: { used: boolean } }>('/v1/me'),
    api<{ subscription: { status: string; cancel_at_period_end: boolean } | null }>('/v1/billing'),
  ]);
  const signedIn = me.status === 200;
  const sub = billing.status === 200 ? billing.body.subscription : null;
  return (
    <Plans
      plans={plans.status === 200 ? plans.body.plans : []}
      signedIn={signedIn}
      tier={signedIn ? me.body.tier : null}
      trialUsed={signedIn ? me.body.trial.used : false}
      subscribed={!!sub && (sub.status === 'active' || sub.status === 'past_due') && !sub.cancel_at_period_end}
    />
  );
}
