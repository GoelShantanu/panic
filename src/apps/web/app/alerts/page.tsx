import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { api } from '../../site/api.ts';
import { History } from '../../site/alerts/History.tsx';
import type { AlertRow } from '../../site/alerts/History.tsx';

export const metadata: Metadata = { title: 'Alert history', robots: { index: false } };

export default async function AlertHistoryPage() {
  const [h, me] = await Promise.all([api<{ alerts: AlertRow[]; next_cursor: string | null }>('/v1/alerts/history'), api<{ entitlements: { alert_history_days: number } }>('/v1/me')]);
  if (h.status === 401) redirect('/sign-in?next=/alerts');
  return <History initial={h.body.alerts} cursor={h.body.next_cursor} days={me.status === 200 ? me.body.entitlements.alert_history_days : 30} />;
}
