import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Console } from '../../site/admin/Console.tsx';
import type { Abuse, ConsoleData, CorrectionRow, Grievance, Switches } from '../../site/admin/Console.tsx';
import { MfaVerify, TotpEnrol } from '../../site/admin/Mfa.tsx';
import { api } from '../../site/api.ts';

// The title is chosen after the role check so the page reveals nothing to non-operators.
export async function generateMetadata(): Promise<Metadata> {
  const me = await api<{ role: string }>('/v1/me');
  const operator = me.status === 200 && (me.body.role === 'operator' || me.body.role === 'admin');
  return { title: operator ? 'Operator console' : 'Page not found', robots: { index: false, follow: false } };
}

// Operators only, after a TOTP check (PRD-007 US-007.5 AC-2; D-033). Everyone else, signed in or
// not, gets a 404: the page does not admit to existing.
export default async function AdminPage() {
  const me = await api<{ role: string; totp_enabled: boolean }>('/v1/me');
  if (me.status !== 200 || (me.body.role !== 'operator' && me.body.role !== 'admin')) notFound();
  if (!me.body.totp_enabled) {
    return (
      <div className="settings">
        <h1>Operator console</h1>
        <TotpEnrol />
      </div>
    );
  }
  const settings = await api<Switches & { error?: string }>('/v1/admin/settings');
  if (settings.status === 403) {
    return (
      <div className="settings">
        <h1>Operator console</h1>
        <MfaVerify />
      </div>
    );
  }
  const [g, c, a] = await Promise.all([
    api<{ grievances: Grievance[] }>('/v1/admin/grievances'),
    api<{ queue: CorrectionRow[] }>('/v1/admin/corrections'),
    api<Abuse>('/v1/admin/abuse'),
  ]);
  const data: ConsoleData = {
    grievances: g.status === 200 ? g.body.grievances : [],
    corrections: c.status === 200 ? c.body.queue : [],

    abuse: a.status === 200 ? a.body : { vote_bursts: [], shared_ips: [], concentrated_voters: [], bullish_view_sme_share: { total: 0, sme: 0 } },
    settings: settings.body,
  };
  return <Console initial={data} />;
}
