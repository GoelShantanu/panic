'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { istDateTime } from '../format.ts';

export interface Me {
  user_id: string;
  username: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  created_at: string;
  email_verified: boolean;
  tier: 'free' | 'paid';
  trial: { used: boolean; ends_at: string | null };
  subscription: { plan: string; status: string; renews_at: string; cancel_at_period_end: boolean } | null;
  marketing_opt_in: boolean;
  sign_in_methods: string[];
  entitlements: Record<string, number | boolean | null>;
}
export interface Billing {
  subscription: { plan: string; status: string; cancel_at_period_end: boolean; renews_at: string | null; access_until: string; pending_plan: string | null; payment_retrying: boolean } | null;
}
export interface Invoice {
  invoice_id: string;
  amount_inr: number;
  gst_inr: number;
  issued_at: string;
  url: string;
}
export interface SavedView {
  id: string;
  name: string;
  params: { view: string; event_types: string[]; filings_only: boolean };
}

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(path, { method, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }).catch(() => null);
  return { status: res?.status ?? 0, body: res && res.status !== 204 ? await res.json().catch(() => null) : null };
}

const day = (iso: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(iso));

export function Settings({ me, billing, invoices, savedViews, billingEnabled }: { me: Me; billing: Billing | null; invoices: Invoice[]; savedViews: { views: SavedView[]; disabled: boolean }; billingEnabled: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Record<string, string>>({});
  const say = (k: string, m: string) => setMsg((x) => ({ ...x, [k]: m }));
  const [username, setUsername] = useState(me.username);
  const [marketing, setMarketing] = useState(me.marketing_opt_in);
  const [views, setViews] = useState(savedViews.views);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [deleteChoice, setDeleteChoice] = useState<'keep_as_deleted_user' | 'delete'>('keep_as_deleted_user');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sub = billing?.subscription ?? null;

  async function saveUsername(e: React.FormEvent) {
    e.preventDefault();
    const r = await call('PATCH', '/v1/me', { username });
    if (r.status === 200) (say('username', 'Username changed.'), router.refresh());
    else if (r.status === 429) say('username', `You can change your username again on ${day(r.body.available_from)}.`);
    else if (r.body?.error === 'username_taken') say('username', 'That username is taken.');
    else if (r.body?.error === 'username_reserved') say('username', 'That username is reserved.');
    else say('username', 'Usernames are 3–20 letters, digits or underscores.');
  }

  return (
    <div className="settings">
      <h1>Settings</h1>

      <section className="panel settings-section" aria-labelledby="acct-h">
        <h2 id="acct-h">Account</h2>
        <dl className="kv">
          <dt>Email</dt>
          <dd>{me.email}</dd>
          {(me.first_name || me.last_name) && <><dt>Name</dt><dd>{[me.first_name, me.last_name].filter(Boolean).join(' ')}</dd></>}
          <dt>Sign-in methods</dt>
          <dd>{me.sign_in_methods.length ? me.sign_in_methods.map((m) => m === 'google' ? 'Google' : 'Email and password').join(', ') : 'Set a password to sign in next time'}</dd>
          <dt>Member since</dt>
          <dd>{day(me.created_at)}</dd>
        </dl>
        <p><Link href="/sign-in?mode=reset&next=%2Fsettings">{me.sign_in_methods.includes('password') ? 'Reset password' : 'Set a password'}</Link></p>
        <form onSubmit={saveUsername} className="inline-form">
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} />
          </label>
          <button type="submit" className="button" disabled={username === me.username}>
            Change
          </button>
        </form>
        {msg['username'] && <p className="muted" role="status">{msg['username']}</p>}
      </section>

      <section className="panel settings-section" aria-labelledby="plan-h">
        <h2 id="plan-h">Membership</h2>
        <p>
          You are a <strong>Verified Member</strong> with full, unrestricted access to all BazaarPanic features (100% Free).
        </p>
        <p className="faint" style={{ marginTop: '0.5rem' }}>
          ✓ 12-Sector Heatmap &amp; Filings Intelligence • 30-Day News Archive • 200-Stock Watchlists • Live F&amp;O PCR Telemetry • Instant ↻ Refresh Now
        </p>
        <div className="row-buttons" style={{ marginTop: '1rem' }}>
          <Link href="/plans" className="button">
            View All Features
          </Link>
          {sub && !sub.cancel_at_period_end && (
            <>
              {!confirmCancel ? (
                <button type="button" className="button" onClick={() => setConfirmCancel(true)}>
                  Cancel subscription
                </button>
              ) : (
                <span className="confirm">
                  Cancel? You keep paid features until {day(sub.renews_at ?? sub.access_until)}.{' '}
                  <button
                    type="button"
                    className="button"
                    onClick={async () => {
                      const r = await call('POST', '/v1/billing/cancel');
                      setConfirmCancel(false);
                      if (r.status === 200) (say('plan', 'Cancelled. You will not be charged again.'), router.refresh());
                      else say('plan', 'Cancelling did not work. Try again.');
                    }}
                  >
                    Yes, cancel
                  </button>{' '}
                  <button type="button" className="icon-button" onClick={() => setConfirmCancel(false)}>
                    Keep it
                  </button>
                </span>
              )}
            </>
          )}
        </div>
        {msg['plan'] && <p className="muted" role="status">{msg['plan']}</p>}
        {invoices.length > 0 && (
          <>
            <h3 className="sub-h">Past Invoices</h3>
            <ul className="plain-list">
              {invoices.map((i) => (
                <li key={i.invoice_id}>
                  <Link href={`/settings/invoices/${encodeURIComponent(i.invoice_id)}`}>{i.invoice_id}</Link> · ₹{i.amount_inr.toFixed(2)} · {day(i.issued_at)}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="panel settings-section" aria-labelledby="views-h">
        <h2 id="views-h">Saved views</h2>
        {views.length === 0 ? (
          <p className="muted">{'Save a view from the stream to reopen it here in one click.'}</p>
        ) : (
          <ul className="plain-list">
            {views.map((v) => {
              const p = new URLSearchParams();
              if (v.params.view !== 'latest') p.set('view', v.params.view);
              if (v.params.event_types.length) p.set('event_types', v.params.event_types.join(','));
              return (
                <li key={v.id}>
                  {savedViews.disabled ? <span>{v.name}</span> : <Link href={p.toString() ? `/?${p}` : '/'}>{v.name}</Link>}{' '}
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Delete saved view ${v.name}`}
                    onClick={async () => {
                      const r = await call('DELETE', `/v1/saved-views/${v.id}`);
                      if (r.status === 204) setViews((x) => x.filter((y) => y.id !== v.id));
                    }}
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel settings-section" aria-labelledby="email-h">
        <h2 id="email-h">Email</h2>
        <p className="muted">
          We send sign-in codes, alerts, digests and billing emails. <Link href="/settings/alerts">Alert settings</Link>
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={marketing}
            onChange={async (e) => {
              const v = e.target.checked;
              setMarketing(v);
              const r = await call('PATCH', '/v1/me', { marketing_opt_in: v });
              if (r.status !== 200) (setMarketing(!v), say('email', 'Could not save. Try again.'));
            }}
          />
          Occasional product news (optional)
        </label>
        {msg['email'] && <p className="muted">{msg['email']}</p>}
      </section>

      <section className="panel settings-section" aria-labelledby="data-h">
        <h2 id="data-h">Your data</h2>
        <button
          type="button"
          className="button"
          onClick={async () => {
            const r = await call('POST', '/v1/me/export');
            if (r.status === 202) say('data', `We are preparing your data. You will get an email with a download link by ${istDateTime(r.body.ready_by)} IST.`);
            else say('data', 'Could not start the export. Try again.');
          }}
        >
          Download my data
        </button>
        {msg['data'] && <p className="muted" role="status">{msg['data']}</p>}
        <h3 className="sub-h">Delete account</h3>
        <p className="muted">Sign-in stops immediately; your data is erased within 30 days. An active subscription is cancelled with no further charges.</p>
        <fieldset className="choice">
          <legend>Your comments</legend>
          <label className="check">
            <input type="radio" name="comments" checked={deleteChoice === 'keep_as_deleted_user'} onChange={() => setDeleteChoice('keep_as_deleted_user')} /> Keep them, shown as &quot;[deleted user]&quot;
          </label>
          <label className="check">
            <input type="radio" name="comments" checked={deleteChoice === 'delete'} onChange={() => setDeleteChoice('delete')} /> Delete them
          </label>
        </fieldset>
        {!confirmDelete ? (
          <button type="button" className="button" onClick={() => setConfirmDelete(true)}>
            Delete my account
          </button>
        ) : (
          <span className="confirm">
            This cannot be undone.{' '}
            <button
              type="button"
              className="button button-danger"
              onClick={async () => {
                const r = await call('POST', '/v1/me/delete', { comments: deleteChoice });
                if (r.status === 202) (router.push('/?deleted=1'), router.refresh());
                else (setConfirmDelete(false), say('data', 'Deleting did not work. Try again.'));
              }}
            >
              Delete permanently
            </button>{' '}
            <button type="button" className="icon-button" onClick={() => setConfirmDelete(false)}>
              Keep my account
            </button>
          </span>
        )}
      </section>

      <section className="panel settings-section" aria-labelledby="sess-h">
        <h2 id="sess-h">Sessions</h2>
        <div className="row-buttons">
          <button type="button" className="button" onClick={async () => (await call('POST', '/v1/auth/signout', { everywhere: false }), router.push('/'), router.refresh())}>
            Sign out
          </button>
          <button type="button" className="button" onClick={async () => (await call('POST', '/v1/auth/signout', { everywhere: true }), router.push('/'), router.refresh())}>
            Sign out everywhere
          </button>
        </div>
      </section>
    </div>
  );
}

