import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { api } from '../../../site/api.ts';
import { AlertSettings } from '../../../site/alerts/AlertSettings.tsx';
import type { Settings } from '../../../site/alerts/AlertSettings.tsx';
import type { EventType } from '../../../site/types.ts';

export const metadata: Metadata = { title: 'Alert settings', robots: { index: false } };

export default async function AlertSettingsPage() {
  const [s, types, me] = await Promise.all([api<Settings>('/v1/alerts/settings'), api<{ types: EventType[] }>('/v1/event-types'), api<{ tier: 'free' | 'paid' }>('/v1/me')]);
  if (s.status === 401) redirect('/sign-in?next=/settings/alerts');
  return <AlertSettings initial={s.body} eventTypes={types.status === 200 ? types.body.types : []} vapidKey={process.env['VAPID_PUBLIC_KEY'] ?? null} tier={me.status === 200 ? me.body.tier : 'free'} />;
}
