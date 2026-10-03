import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { TotpEnrol } from '../../../site/admin/Mfa.tsx';
import { api } from '../../../site/api.ts';

export const metadata: Metadata = { title: 'Operator set-up', robots: { index: false, follow: false } };

// Not linked anywhere: a future operator enrols here, then an admin grants the role, which requires
// enrolment first (D-033).
export default async function EnrolPage() {
  const me = await api<{ username: string | null; role: string; totp_enabled: boolean }>('/v1/me');
  if (me.status === 401) redirect('/sign-in?next=/admin/enrol');
  if (me.status !== 200) redirect('/');
  if (me.body.totp_enabled && me.body.role !== 'user') redirect('/admin');
  return (
    <div className="settings">
      <h1>Operator set-up</h1>
      {me.body.totp_enabled ? (
        <p className="notice notice-warn">
          Your authenticator app is set up. Ask an admin to grant operator access to <strong>{me.body.username}</strong>.
        </p>
      ) : (
        <TotpEnrol />
      )}
    </div>
  );
}
