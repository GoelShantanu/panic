'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

declare global {
  interface Window {
    Razorpay?: new (o: Record<string, unknown>) => { open(): void; on(ev: string, fn: () => void): void };
  }
}

// PRD-007 §2.1, as shown to people (C-007.2: depth and convenience only, nothing about any company).
const ROWS: [string, string, string][] = [
  ['Live stream, story and company pages, AI filing summaries', 'Included', 'Included'],
  ['Watchlist size', '20 companies', '200 companies'],
  ['Individual alerts per day', 'Up to 5', 'Up to 30'],
  ['Daily digest', 'Included', 'Included'],
  ['Stream and company history', 'Last 30 days', 'All since launch'],
  ['Event-type filter', 'One type at a time', 'Combine several'],
  ['Filings-only stream', '—', 'Included'],
  ['Saved views', '—', 'Up to 10'],
  ['Alert history', '30 days', '1 year'],
  ['Voting and comments', 'Included', 'Included, same rules'],
];

function loadCheckout(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

export function Plans({ plans, signedIn, tier, trialUsed, subscribed }: { plans: { id: 'monthly' | 'yearly'; price_inr: number }[]; signedIn: boolean; tier: 'free' | 'paid' | null; trialUsed: boolean; subscribed: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Paid access starts only when the provider's webhook confirms payment (D-036); wait up to 60 s.
  async function waitForPaid() {
    setMsg('Confirming your payment…');
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const r = await fetch('/v1/billing', { credentials: 'same-origin' }).catch(() => null);
      const b = r?.ok ? await r.json() : null;
      if (b?.tier === 'paid') {
        setMsg('You are on the paid plan. Thank you.');
        setBusy(false);
        router.refresh();
        return;
      }
    }
    setMsg('Payment received by the provider; confirmation is taking longer than usual. Your plan will update shortly, and an invoice will be emailed.');
    setBusy(false);
  }

  async function subscribe(plan: 'monthly' | 'yearly') {
    if (!signedIn) return router.push('/sign-in?next=/plans');
    setBusy(true);
    setMsg(null);
    const res = await fetch('/v1/billing/checkout', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan }) }).catch(() => null);
    const body = res ? await res.json().catch(() => null) : null;
    if (!res || res.status === 503) { setBusy(false); return setMsg('Subscriptions are not open yet. Try the free trial meanwhile.'); }
    if (res.status === 409) {
      setBusy(false);
      return setMsg(body?.error === 'checkout_in_progress' ? `A ${body.plan} checkout is already open. Select that plan to resume checkout.` : 'You already have an active subscription.');
    }
    if (!res.ok) { setBusy(false); return setMsg('Checkout could not start. Try again.'); }
    if (!(await loadCheckout()) || !window.Razorpay) {
      window.location.href = body.provider_checkout_url; // provider-hosted page as a fallback
      return;
    }
    const rzp = new window.Razorpay({
      key: body.key_id,
      subscription_id: body.subscription_id,
      name: 'StockPanic',
      description: plan === 'yearly' ? 'Paid plan, yearly' : 'Paid plan, monthly',
      handler: () => void waitForPaid(),
      modal: { ondismiss: () => { setBusy(false); setMsg('Checkout closed. Nothing was charged.'); } },
    });
    rzp.on('payment.failed', () => { setBusy(false); setMsg('Payment was not completed. You can try again.'); });
    rzp.open();
  }

  return (
    <div className="plans">
      <h1>Plans</h1>
      <p className="muted">The core product is free. Paid adds depth and convenience; it never changes what news exists, how stories rank, or how votes count.</p>
      <table className="plans-table panel">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Feature</span>
            </th>
            <th scope="col">Free</th>
            <th scope="col">Paid</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([what, free, paid]) => (
            <tr key={what}>
              <th scope="row">{what}</th>
              <td>{free}</td>
              <td>{paid}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="plan-cards">
        {plans.map((p) => (
          <div key={p.id} className="panel plan-card">
            <h2>{p.id === 'yearly' ? 'Yearly' : 'Monthly'}</h2>
            <p className="plan-price">
              ₹{p.price_inr.toLocaleString('en-IN')} <span className="faint">/ {p.id === 'yearly' ? 'year' : 'month'}, GST included</span>
            </p>
            <button type="button" className="button button-primary" disabled={busy || subscribed} onClick={() => void subscribe(p.id)}>
              {subscribed ? 'Current plan' : `Subscribe ${p.id === 'yearly' ? 'yearly' : 'monthly'}`}
            </button>
          </div>
        ))}
      </div>
      {signedIn && !trialUsed && tier === 'free' && (
        <p>
          Or <Link href="/settings">start a 14-day free trial</Link> from settings, with no payment details needed.
        </p>
      )}
      <p className="faint">UPI AutoPay, cards and net banking through Razorpay. StockPanic never sees your card or bank details. Cancel any time from settings in one step; paid features last until the end of the period you paid for.</p>
      {msg && (
        <p className="notice notice-warn" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
