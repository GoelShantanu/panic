// Billing state: checkouts, subscriptions from provider webhooks, invoices (PRD-007 §2.2, D-036).

import type pg from 'pg';
import { financialYear, invoiceNumber } from '@stockpanic/core';
import type { PlanId } from '@stockpanic/core';

export async function createCheckout(db: pg.ClientBase, providerRef: string, shortUrl: string, userId: string, plan: PlanId, now: Date): Promise<void> {
  await db.query('INSERT INTO billing_checkout (provider_ref, short_url, user_id, plan, created_at) VALUES ($1, $2, $3, $4, $5)', [providerRef, shortUrl, userId, plan, now]);
}

export async function recentCheckoutForUser(db: pg.ClientBase, userId: string, since: Date): Promise<{ providerRef: string; shortUrl: string; plan: PlanId } | null> {
  const { rows } = await db.query(
    'SELECT provider_ref, short_url, plan FROM billing_checkout WHERE user_id = $1 AND created_at >= $2 AND short_url IS NOT NULL ORDER BY created_at DESC LIMIT 1',
    [userId, since],
  );
  return rows[0] ? { providerRef: rows[0].provider_ref, shortUrl: rows[0].short_url, plan: rows[0].plan } : null;
}

export interface SubscriptionRow {
  id: string;
  userId: string;
  plan: PlanId;
  status: 'active' | 'past_due' | 'cancelled' | 'expired';
  providerRef: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  pendingPlan: PlanId | null;
  lastEventAt: Date | null;
  pastDueSince: Date | null;
}

const subRow = (r: any): SubscriptionRow => ({
  id: String(r.id),
  userId: String(r.user_id),
  plan: r.plan,
  status: r.status,
  providerRef: r.provider_ref,
  currentPeriodEnd: r.current_period_end,
  cancelAtPeriodEnd: r.cancel_at_period_end,
  pendingPlan: r.pending_plan,
  lastEventAt: r.last_event_at,
  pastDueSince: r.past_due_since,
});

// The subscription that currently decides access: live, or cancelled but still in its paid period.
export async function currentSubscription(db: pg.ClientBase, userId: string, now: Date): Promise<SubscriptionRow | null> {
  const { rows } = await db.query(
    `SELECT * FROM subscription WHERE user_id = $1 AND status <> 'expired' AND current_period_end > $2 ORDER BY created_at DESC LIMIT 1`,
    [userId, now],
  );
  return rows[0] ? subRow(rows[0]) : null;
}

export async function subscriptionByRef(db: pg.ClientBase, providerRef: string): Promise<SubscriptionRow | null> {
  const { rows } = await db.query('SELECT * FROM subscription WHERE provider_ref = $1', [providerRef]);
  return rows[0] ? subRow(rows[0]) : null;
}

export async function checkoutByRef(db: pg.ClientBase, providerRef: string): Promise<{ userId: string; plan: PlanId } | null> {
  const { rows } = await db.query('SELECT user_id, plan FROM billing_checkout WHERE provider_ref = $1', [providerRef]);
  return rows[0] ? { userId: String(rows[0].user_id), plan: rows[0].plan } : null;
}

// Each provider event is handled once (Razorpay x-razorpay-event-id).
export async function recordBillingEvent(db: pg.ClientBase, e: { id: string; event: string; providerCreated: Date | null; payload: unknown; at: Date }): Promise<boolean> {
  const { rowCount } = await db.query(
    `INSERT INTO billing_event (provider_event_id, event, received_at, provider_created, payload) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
    [e.id, e.event, e.at, e.providerCreated, JSON.stringify(e.payload)],
  );
  return (rowCount ?? 0) > 0;
}

export async function setBillingEventOutcome(db: pg.ClientBase, id: string, outcome: string): Promise<void> {
  await db.query('UPDATE billing_event SET outcome = $2 WHERE provider_event_id = $1', [id, outcome]);
}

export interface SubscriptionChange {
  providerRef: string;
  userId: string;
  plan: PlanId;
  status: SubscriptionRow['status'];
  currentPeriodEnd: Date;
  cancelAtPeriodEnd?: boolean;
  pastDueSince?: Date | null;
  clearPendingPlan?: boolean;
  eventAt: Date;
}

// Webhooks can arrive out of order: an event older than the last one applied is ignored.
export async function applySubscription(db: pg.ClientBase, c: SubscriptionChange): Promise<'applied' | 'stale'> {
  const existing = await subscriptionByRef(db, c.providerRef);
  if (existing?.lastEventAt && existing.lastEventAt > c.eventAt) return 'stale';
  if (!existing) {
    // A user who cancelled and re-subscribed: the old one stops counting as live (one live per user).
    if (c.status === 'active' || c.status === 'past_due') {
      await db.query(`UPDATE subscription SET status = 'cancelled' WHERE user_id = $1 AND status IN ('active', 'past_due') AND provider_ref <> $2`, [c.userId, c.providerRef]);
    }
    await db.query(
      `INSERT INTO subscription (user_id, plan, status, provider_ref, current_period_end, cancel_at_period_end, last_event_at, past_due_since)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [c.userId, c.plan, c.status, c.providerRef, c.currentPeriodEnd, c.cancelAtPeriodEnd ?? false, c.eventAt, c.pastDueSince ?? null],
    );
    return 'applied';
  }
  await db.query(
    `UPDATE subscription SET plan = $2, status = $3, current_period_end = $4,
            cancel_at_period_end = coalesce($5, cancel_at_period_end), last_event_at = $6,
            past_due_since = CASE WHEN $7::boolean THEN $8 ELSE past_due_since END,
            pending_plan = CASE WHEN $9 THEN NULL ELSE pending_plan END
      WHERE provider_ref = $1`,
    [c.providerRef, c.plan, c.status, c.currentPeriodEnd, c.cancelAtPeriodEnd ?? null, c.eventAt, c.pastDueSince !== undefined, c.pastDueSince ?? null, c.clearPendingPlan ?? false],
  );
  return 'applied';
}

export async function markCancelAtPeriodEnd(db: pg.ClientBase, subscriptionId: string): Promise<void> {
  await db.query('UPDATE subscription SET cancel_at_period_end = true, pending_plan = NULL WHERE id = $1', [subscriptionId]);
}

export async function setPendingPlan(db: pg.ClientBase, subscriptionId: string, plan: PlanId | null): Promise<void> {
  await db.query('UPDATE subscription SET pending_plan = $2 WHERE id = $1', [subscriptionId, plan]);
}

export interface InvoiceRow {
  number: string;
  amountInr: number;
  gstInr: number;
  cgstInr: number | null;
  sgstInr: number | null;
  plan: PlanId | null;
  periodEnd: Date | null;
  issuedAt: Date;
}

const invRow = (r: any): InvoiceRow => ({
  number: r.invoice_number,
  amountInr: Number(r.amount_inr),
  gstInr: Number(r.gst_inr),
  cgstInr: r.cgst_inr === null ? null : Number(r.cgst_inr),
  sgstInr: r.sgst_inr === null ? null : Number(r.sgst_inr),
  plan: r.plan,
  periodEnd: r.period_end,
  issuedAt: r.issued_at,
});

// One invoice per provider payment; numbers run without gaps within a financial year (D-036).
export async function createInvoice(
  db: pg.ClientBase,
  i: { userId: string; subscriptionId: string | null; paymentRef: string; amountInr: number; gst: number; cgst: number; sgst: number; plan: PlanId; periodEnd: Date | null; at: Date },
): Promise<{ created: boolean; invoice: InvoiceRow }> {
  const existing = await db.query('SELECT * FROM invoice WHERE provider_ref = $1', [i.paymentRef]);
  if (existing.rows[0]) return { created: false, invoice: invRow(existing.rows[0]) };
  const fy = financialYear(i.at);
  const { rows } = await db.query(
    `INSERT INTO invoice_counter (financial_year, last_number) VALUES ($1, 1)
     ON CONFLICT (financial_year) DO UPDATE SET last_number = invoice_counter.last_number + 1 RETURNING last_number`,
    [fy],
  );
  const ins = await db.query(
    `INSERT INTO invoice (user_id, subscription_id, amount_inr, gst_inr, cgst_inr, sgst_inr, issued_at, provider_ref, invoice_number, plan, period_end)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [i.userId, i.subscriptionId, i.amountInr, i.gst, i.cgst, i.sgst, i.at, i.paymentRef, invoiceNumber(fy, rows[0].last_number), i.plan, i.periodEnd],
  );
  return { created: true, invoice: invRow(ins.rows[0]) };
}

export async function listInvoices(db: pg.ClientBase, userId: string): Promise<InvoiceRow[]> {
  const { rows } = await db.query('SELECT * FROM invoice WHERE user_id = $1 AND invoice_number IS NOT NULL ORDER BY issued_at DESC', [userId]);
  return rows.map(invRow);
}

export async function invoiceByNumber(db: pg.ClientBase, userId: string, number: string): Promise<InvoiceRow | null> {
  const { rows } = await db.query('SELECT * FROM invoice WHERE user_id = $1 AND invoice_number = $2', [userId, number]);
  return rows[0] ? invRow(rows[0]) : null;
}

export async function addUserNotice(db: pg.ClientBase, userId: string, kind: 'payment_retrying' | 'downgraded', payload: unknown): Promise<void> {
  await db.query('INSERT INTO user_notice (user_id, kind, payload) VALUES ($1, $2, $3)', [userId, kind, JSON.stringify(payload)]);
}

export async function userEmailOf(db: pg.ClientBase, userId: string): Promise<string | null> {
  const { rows } = await db.query('SELECT email FROM app_user WHERE id = $1 AND deleted_at IS NULL', [userId]);
  return rows[0]?.email ?? null;
}
