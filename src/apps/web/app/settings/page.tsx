import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { api } from '../../site/api.ts';
import { Settings } from '../../site/account/Settings.tsx';
import type { Billing, Invoice, Me, SavedView } from '../../site/account/Settings.tsx';

export const metadata: Metadata = { title: 'Settings', robots: { index: false } };

// PRD-007 US-007.3: account, plan and renewal, alerts link, data download and deletion, sessions.
export default async function SettingsPage() {
  const me = await api<Me>('/v1/me');
  if (me.status !== 200) redirect('/sign-in?next=/settings');
  const [billing, invoices, views] = await Promise.all([api<Billing>('/v1/billing'), api<{ invoices: Invoice[] }>('/v1/billing/invoices'), api<{ views: SavedView[]; disabled: boolean }>('/v1/saved-views')]);
  return (
    <Settings
      me={me.body}
      billing={billing.status === 200 ? billing.body : null}
      invoices={invoices.status === 200 ? invoices.body.invoices : []}
      savedViews={views.status === 200 ? views.body : { views: [], disabled: true }}
      billingEnabled={billing.status === 200}
    />
  );
}
