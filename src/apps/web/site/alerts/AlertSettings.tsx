'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { EventType } from '../types.ts';

export interface Settings {
  channels: { email: boolean; push: boolean };
  daily_budget: number;
  budget_ceiling: number;
  used_today: number;
  quiet_hours: { enabled: boolean; start: string; end: string; tz: string };
  digest: { time: string; digest_only: boolean };
  event_types: Record<string, boolean>;
  email_disabled_after_bounces?: boolean;
}
type SettingsPatch = Partial<Pick<Settings, 'daily_budget' | 'event_types'>> & {
  channels?: Partial<Settings['channels']>;
  quiet_hours?: Partial<Settings['quiet_hours']>;
  digest?: Partial<Settings['digest']>;
};

const b64ToBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function put(patch: unknown) {
  const res = await fetch('/v1/alerts/settings', { method: 'PUT', signal: AbortSignal.timeout(15_000), credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }).catch(() => null);
  return res?.ok ? ((await res.json().catch(() => null)) as Settings | null) : null;
}

// Browser push (US-003.6 AC-1): permission is asked only when the user turns push on.
async function enablePush(vapidKey: string): Promise<string | null> {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'This browser does not support push notifications.';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'Notifications are blocked for this site in your browser settings.';
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidKey) }));
  const res = await fetch('/v1/push/subscriptions', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sub.toJSON()) });
  return res.ok ? null : 'Could not register this browser for alerts.';
}

async function disablePush() {
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration('/sw.js') : undefined;
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await fetch('/v1/push/subscriptions', { method: 'DELETE', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => null);
    await sub.unsubscribe().catch(() => undefined);
  }
}

// PRD-003 US-003.7, US-003.9 AC-2: channels, budget, quiet hours, digest, per-event-type switches.
export function AlertSettings({ initial, eventTypes, vapidKey, tier }: { initial: Settings; eventTypes: EventType[]; vapidKey: string | null; tier: 'free' | 'paid' }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function save(patch: SettingsPatch) {
    const previous = s;
    setS(current => ({ ...current, ...patch,
      channels: { ...current.channels, ...patch.channels },
      quiet_hours: { ...current.quiet_hours, ...patch.quiet_hours },
      digest: { ...current.digest, ...patch.digest },
      event_types: { ...current.event_types, ...patch.event_types },
    }));
    setBusy(true);
    setError(false);
    setMsg('Saving…');
    try {
      const r = await put(patch);
      if (!r) throw new Error('save failed');
      setS(r);
      setMsg('Saved. Changes apply to new stories.');
    } catch {
      setS(previous);
      setError(true);
      setMsg('That setting could not be saved. Please try again.');
    } finally { setBusy(false); }
  }
  return (
    <div className="settings mobile-workflow alert-settings">
      <h1>Alert settings</h1>
      <p className="muted">
        Alerts are about companies on your <Link href="/watchlist">watchlist</Link> only, and only for the event types you choose. Changes apply to stories from now on.
      </p>
      {s.email_disabled_after_bounces && <p className="notice notice-warn">Email alerts were turned off because messages to your address kept failing. Check the address in settings, then turn email back on.</p>}

      {msg && <p className={`notice ${error ? 'notice-error' : 'notice-success'}`} role={error ? 'alert' : 'status'}>{msg}</p>}
      <fieldset className="settings-controls" disabled={busy} aria-busy={busy}>
      <legend className="sr-only">Alert preferences</legend>
      <section className="panel settings-section" aria-labelledby="ch-h">
        <h2 id="ch-h">Channels</h2>
        <label className="check">
          <input type="checkbox" checked={s.channels.email} onChange={(e) => void save({ channels: { email: e.target.checked } })} /> Email
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={s.channels.push}
            disabled={!vapidKey}
            onChange={async (e) => {
              const checked = e.target.checked;
              setBusy(true);
              setMsg('Updating browser notifications…');
              setError(false);
              try {
                if (checked) {
                  const err = await enablePush(vapidKey!);
                  if (err) throw new Error(err);
                } else await disablePush();
                await save({ channels: { push: checked } });
              } catch (err) {
                setError(true);
                setMsg(err instanceof Error ? err.message : 'Could not update browser notifications. Please try again.');
              } finally { setBusy(false); }
            }}
          />{' '}
          Browser notifications {!vapidKey && <span className="faint">(not available yet)</span>}
        </label>
      </section>

      <section className="panel settings-section" aria-labelledby="bud-h">
        <h2 id="bud-h">How often</h2>
        <label className="inline-label">
          Individual alerts per day
          <input type="number" min={0} max={s.budget_ceiling} value={s.daily_budget} onChange={(e) => void save({ daily_budget: Math.max(0, Math.min(s.budget_ceiling, Number(e.target.value))) })} />
        </label>
        <p className="faint">
          {s.used_today} used today, resets at midnight IST. Your plan allows up to {s.budget_ceiling}
          {tier === 'free' && (
            <>
              {' '}
              (<Link href="/plans">paid allows 30</Link>)
            </>
          )}
          . Anything beyond goes into your daily digest, never dropped.
        </p>
        <label className="check">
          <input type="checkbox" checked={s.quiet_hours.enabled} onChange={(e) => void save({ quiet_hours: { enabled: e.target.checked } })} /> Quiet hours
        </label>
        {s.quiet_hours.enabled && (
          <span className="time-range">
            <input type="time" aria-label="Quiet hours start" value={s.quiet_hours.start} onChange={(e) => void save({ quiet_hours: { start: e.target.value } })} /> to{' '}
            <input type="time" aria-label="Quiet hours end" value={s.quiet_hours.end} onChange={(e) => void save({ quiet_hours: { end: e.target.value } })} /> IST
          </span>
        )}
        <label className="inline-label">
          Daily digest at
          <input type="time" value={s.digest.time} onChange={(e) => void save({ digest: { time: e.target.value } })} /> IST
        </label>
        <label className="check">
          <input type="checkbox" checked={s.digest.digest_only} onChange={(e) => void save({ digest: { digest_only: e.target.checked } })} /> Digest only: no individual alerts
        </label>
      </section>

      <section className="panel settings-section" aria-labelledby="types-h">
        <h2 id="types-h">Which events alert you</h2>
        <div className="type-grid">
          {eventTypes.map((t) => (
            <label key={t.code} className="check">
              <input type="checkbox" checked={!!s.event_types[t.code]} onChange={(e) => void save({ event_types: { [t.code]: e.target.checked } })} /> {t.label}
            </label>
          ))}
        </div>
      </section>
      </fieldset>
      <p>
        <Link href="/alerts">Alert history</Link>
      </p>
    </div>
  );
}
