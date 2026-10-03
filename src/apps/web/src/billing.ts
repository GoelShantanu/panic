// Billing API and provider webhooks (PRD-007 §2.2, §4.3; D-035, D-036).

import type pg from 'pg';
import { RETRY_GRACE_DAYS, invoiceTax, isOneOf, renderInvoice, verifyRazorpaySignature } from '@stockpanic/core';
import type { PlanId, Seller } from '@stockpanic/core';
import {
  addUserNotice,
  applySubscription,
  checkoutByRef,
  createCheckout,
  createInvoice,
  currentSubscription,
  invoiceByNumber,
  listInvoices,
  markCancelAtPeriodEnd,
  recordBillingEvent,
  setBillingEventOutcome,
  setPendingPlan,
  subscriptionByRef,
  userEmailOf,
} from '@stockpanic/db';
import type { SessionUser } from '@stockpanic/db';
import type { Mailer } from '@stockpanic/mail';
import { ProviderError } from './razorpay.ts';
import type { BillingProvider } from './razorpay.ts';

export interface BillingDeps {
  provider: BillingProvider;
  keyId: string; // public key for the checkout page
  planIds: Record<PlanId, string>;
  webhookSecret: string;
  seller: Seller;
  mailer: Mailer;
  log?: (line: string) => void;
}

export interface Res {
  status: number;
  body: unknown;
}

const PLAN_IDS = ['monthly', 'yearly'] as const;
const authRequired: Res = { status: 401, body: { error: 'auth_required' } };
const unavailable: Res = { status: 503, body: { error: 'billing_unavailable' } };
const field = (body: unknown, key: string): unknown => (typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : undefined);

function subscriptionJson(s: Awaited<ReturnType<typeof currentSubscription>>) {
  if (!s) return null;
  return {
    plan: s.plan,
    status: s.status,
    cancel_at_period_end: s.cancelAtPeriodEnd || s.status === 'cancelled',
    renews_at: s.cancelAtPeriodEnd || s.status !== 'active' ? null : s.currentPeriodEnd,
    access_until: s.currentPeriodEnd,
    pending_plan: s.pendingPlan,
    payment_retrying: s.status === 'past_due',
  };
}

// GET /v1/billing
export async function getBilling(db: pg.ClientBase, user: SessionUser | null, now: Date): Promise<Res> {
  if (!user) return authRequired;
  return { status: 200, body: { tier: user.tier, subscription: subscriptionJson(await currentSubscription(db, user.id, now)) } };
}

// POST /v1/billing/checkout { plan }
export async function postCheckout(db: pg.ClientBase, body: unknown, user: SessionUser | null, deps: BillingDeps | null, now: Date): Promise<Res> {
  if (!user) return authRequired;
  if (!deps) return unavailable;
  const plan = field(body, 'plan');
  if (!isOneOf(PLAN_IDS, plan)) return { status: 400, body: { error: 'invalid_param', param: 'plan' } };
  const current = await currentSubscription(db, user.id, now);
  if (current && (current.status === 'active' || current.status === 'past_due') && !current.cancelAtPeriodEnd) return { status: 409, body: { error: 'already_subscribed' } };
  let sub;
  try {
    sub = await deps.provider.createSubscription(plan, { user_id: user.publicId, plan });
  } catch (err) {
    deps.log?.(`checkout failed: ${(err as Error).message}`);
    return { status: 502, body: { error: 'provider_error' } };
  }
  await createCheckout(db, sub.id, user.id, plan, now);
  return { status: 200, body: { provider_checkout_url: sub.shortUrl, provider: 'razorpay', subscription_id: sub.id, key_id: deps.keyId } };
}

// POST /v1/billing/cancel — one step, no retention offer (US-007.8 AC-1).
export async function postCancel(db: pg.ClientBase, user: SessionUser | null, deps: BillingDeps | null, now: Date): Promise<Res> {
  if (!user) return authRequired;
  if (!deps) return unavailable;
  const s = await currentSubscription(db, user.id, now);
  if (!s || s.status === 'cancelled') return { status: 409, body: { error: 'no_active_subscription' } };
  if (!s.cancelAtPeriodEnd) {
    try {
      await deps.provider.cancelAtCycleEnd(s.providerRef);
    } catch (err) {
      deps.log?.(`cancel failed: ${(err as Error).message}`);
      return { status: 502, body: { error: 'provider_error' } };
    }
    await markCancelAtPeriodEnd(db, s.id);
  }
  return { status: 200, body: { subscription: subscriptionJson(await currentSubscription(db, user.id, now)) } };
}

// POST /v1/billing/switch { plan } — takes effect at the next renewal (US-007.8 AC-3).
export async function postSwitch(db: pg.ClientBase, body: unknown, user: SessionUser | null, deps: BillingDeps | null, now: Date): Promise<Res> {
  if (!user) return authRequired;
  if (!deps) return unavailable;
  const plan = field(body, 'plan');
  if (!isOneOf(PLAN_IDS, plan)) return { status: 400, body: { error: 'invalid_param', param: 'plan' } };
  const s = await currentSubscription(db, user.id, now);
  if (!s || s.status !== 'active' || s.cancelAtPeriodEnd) return { status: 409, body: { error: 'no_active_subscription' } };
  if (s.plan === plan && !s.pendingPlan) return { status: 409, body: { error: 'already_on_plan' } };
  try {
    await deps.provider.changePlanAtCycleEnd(s.providerRef, plan);
  } catch (err) {
    deps.log?.(`switch failed: ${(err as Error).message}`);
    // Some mandate types cannot change amount; the user can cancel and subscribe to the other plan.
    return { status: err instanceof ProviderError && err.status < 500 ? 409 : 502, body: { error: 'switch_unavailable' } };
  }
  await setPendingPlan(db, s.id, s.plan === plan ? null : plan);
  return { status: 200, body: { subscription: subscriptionJson(await currentSubscription(db, user.id, now)) } };
}

// GET /v1/billing/invoices, GET /v1/billing/invoices/{number}
export async function getInvoices(db: pg.ClientBase, user: SessionUser | null): Promise<Res> {
  if (!user) return authRequired;
  const rows = await listInvoices(db, user.id);
  return {
    status: 200,
    body: { invoices: rows.map((i) => ({ invoice_id: i.number, amount_inr: i.amountInr, gst_inr: i.gstInr, issued_at: i.issuedAt, pdf_url: null, url: `/v1/billing/invoices/${encodeURIComponent(i.number)}` })) },
  };
}

export async function getInvoice(db: pg.ClientBase, number: string, user: SessionUser | null, deps: BillingDeps | null): Promise<Res> {
  if (!user) return authRequired;
  if (!deps) return unavailable;
  const i = await invoiceByNumber(db, user.id, number);
  if (!i) return { status: 404, body: { error: 'not_found' } };
  const email = (await userEmailOf(db, user.id)) ?? '';
  return {
    status: 200,
    body: {
      invoice_id: i.number, amount_inr: i.amountInr, gst_inr: i.gstInr, cgst_inr: i.cgstInr, sgst_inr: i.sgstInr, issued_at: i.issuedAt,
      text: renderInvoice({ number: i.number, issuedAt: i.issuedAt, seller: deps.seller, buyerEmail: email, plan: i.plan ?? 'monthly', amountInr: i.amountInr, periodEnd: i.periodEnd }),
    },
  };
}

// ---------------------------------------------------------------- webhooks

const fromUnix = (v: unknown) => (typeof v === 'number' && v > 0 ? new Date(v * 1000) : null);
const days = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

async function tell(db: pg.ClientBase, deps: BillingDeps, userId: string, subject: string, text: string) {
  const email = await userEmailOf(db, userId);
  if (email) await deps.mailer.send({ to: email, subject, text }).catch((e: Error) => deps.log?.(`billing email failed: ${e.message}`));
}

// POST /v1/billing/webhook — raw body, Razorpay signature, each event once.
export async function handleWebhook(db: pg.ClientBase, rawBody: string, signature: string | null, eventId: string | null, deps: BillingDeps | null, now: Date): Promise<Res> {
  if (!deps) return unavailable;
  if (!verifyRazorpaySignature(deps.webhookSecret, rawBody, signature)) return { status: 401, body: { error: 'invalid_signature' } };
  let evt: any;
  try {
    evt = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: 'invalid_json' } };
  }
  const id = eventId ?? `${evt.event}:${evt.created_at}:${evt.payload?.subscription?.entity?.id ?? ''}:${evt.payload?.payment?.entity?.id ?? ''}`;
  await db.query('BEGIN');
  try {
    if (!(await recordBillingEvent(db, { id, event: String(evt.event), providerCreated: fromUnix(evt.created_at), payload: evt, at: now }))) {
      await db.query('ROLLBACK');
      return { status: 200, body: { duplicate: true } };
    }
    const outcome = await applyEvent(db, evt, deps, now);
    await setBillingEventOutcome(db, id, outcome);
    await db.query('COMMIT');
    return { status: 200, body: { outcome } };
  } catch (err) {
    await db.query('ROLLBACK');
    throw err; // 500: the provider retries
  }
}

async function applyEvent(db: pg.ClientBase, evt: any, deps: BillingDeps, now: Date): Promise<string> {
  const sub = evt.payload?.subscription?.entity;
  if (!sub || typeof sub.id !== 'string' || !String(evt.event).startsWith('subscription.')) return 'ignored';
  const existing = await subscriptionByRef(db, sub.id);
  const checkout = existing ? null : await checkoutByRef(db, sub.id);
  const userId = existing?.userId ?? checkout?.userId;
  if (!userId) return 'unknown_subscription';
  const plan: PlanId = (Object.entries(deps.planIds).find(([, p]) => p === sub.plan_id)?.[0] as PlanId | undefined) ?? existing?.plan ?? checkout!.plan;
  const eventAt = fromUnix(evt.created_at) ?? now;
  const periodEnd = fromUnix(sub.current_end) ?? existing?.currentPeriodEnd ?? null;
  const base = { providerRef: sub.id, userId, plan, eventAt };

  switch (evt.event) {
    case 'subscription.authenticated':
    case 'subscription.activated':
    case 'subscription.charged':
    case 'subscription.resumed':
    case 'subscription.updated': {
      if (!periodEnd) return 'awaiting_first_charge';
      const r = await applySubscription(db, { ...base, status: 'active', currentPeriodEnd: periodEnd, pastDueSince: null, clearPendingPlan: existing?.pendingPlan === plan });
      if (r === 'stale') return 'stale';
      const pay = evt.payload?.payment?.entity;
      if (evt.event === 'subscription.charged' && pay && typeof pay.id === 'string' && typeof pay.amount === 'number') {
        const amountInr = pay.amount / 100; // paise
        const tax = invoiceTax(amountInr, deps.seller);
        const saved = await subscriptionByRef(db, sub.id);
        const { created, invoice } = await createInvoice(db, { userId, subscriptionId: saved?.id ?? null, paymentRef: pay.id, amountInr, ...tax, plan, periodEnd, at: eventAt });
        if (created) {
          const text = renderInvoice({ number: invoice.number, issuedAt: invoice.issuedAt, seller: deps.seller, buyerEmail: (await userEmailOf(db, userId)) ?? '', plan, amountInr, periodEnd });
          await tell(db, deps, userId, `StockPanic invoice ${invoice.number}`, text); // US-007.7 AC-5
        }
      }
      return 'active';
    }
    case 'subscription.pending': {
      // Retrying: access continues for the grace period (US-007.7 AC-6).
      const since = existing?.pastDueSince ?? eventAt;
      const graceEnd = days(since, RETRY_GRACE_DAYS);
      const r = await applySubscription(db, { ...base, status: 'past_due', currentPeriodEnd: periodEnd && periodEnd > graceEnd ? periodEnd : graceEnd, pastDueSince: since });
      if (r === 'stale') return 'stale';
      if (!existing?.pastDueSince) {
        await addUserNotice(db, userId, 'payment_retrying', { access_until: graceEnd });
        await tell(db, deps, userId, 'StockPanic: payment failed, retrying', `We couldn't take your StockPanic payment. Your bank or UPI app will be retried over the next ${RETRY_GRACE_DAYS} days, and paid features stay on meanwhile. You can update your payment method from your Razorpay mandate.`);
      }
      return 'past_due';
    }
    case 'subscription.halted': {
      const r = await applySubscription(db, { ...base, status: 'expired', currentPeriodEnd: eventAt });
      if (r === 'stale') return 'stale';
      await addUserNotice(db, userId, 'downgraded', { reason: 'payment_failed' });
      await tell(db, deps, userId, 'StockPanic: your account is now on Free', 'All payment retries failed, so your account has moved to the Free plan. Your watchlist and saved views are kept; subscribe again any time to restore paid features.');
      return 'expired';
    }
    case 'subscription.cancelled':
    case 'subscription.completed': {
      // Paid access runs to the end of the paid period; no partial refunds (US-007.8 AC-2).
      const r = await applySubscription(db, { ...base, status: 'cancelled', currentPeriodEnd: periodEnd ?? eventAt, cancelAtPeriodEnd: true });
      return r === 'stale' ? 'stale' : 'cancelled';
    }
    default:
      return 'ignored';
  }
}
