import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken, newPublicId, newToken, razorpaySignature } from '@stockpanic/core';
import type { PlanId } from '@stockpanic/core';
import { createSession, migrate } from '@stockpanic/db';
import { MemoryMailer } from '@stockpanic/mail';
import { route } from './api.ts';
import type { AuthDeps } from './auth.ts';
import { handleWebhook } from './billing.ts';
import type { BillingDeps } from './billing.ts';
import { ProviderError } from './razorpay.ts';
import type { BillingProvider } from './razorpay.ts';

// Fictional users and amounts. No network: the provider is a fake and webhooks are signed locally.
const adminUrl = process.env['TEST_DATABASE_URL'];
const WEBHOOK_SECRET = 'razorpay-webhook-secret-for-tests';
const PLAN_IDS: Record<PlanId, string> = { monthly: 'plan_M0NTHLY', yearly: 'plan_YEARLY0' };

class FakeProvider implements BillingProvider {
  created: { plan: PlanId; notes: Record<string, string> }[] = [];
  cancelled: string[] = [];
  changed: { id: string; plan: PlanId }[] = [];
  refuseChange = false;
  #n = 0;
  async createSubscription(plan: PlanId, notes: Record<string, string>) {
    this.created.push({ plan, notes });
    const id = `sub_TEST${++this.#n}`;
    return { id, shortUrl: `https://rzp.example/${id}` };
  }
  async cancelAtCycleEnd(id: string) {
    this.cancelled.push(id);
  }
  async changePlanAtCycleEnd(id: string, plan: PlanId) {
    if (this.refuseChange) throw new ProviderError(400, 'not supported for this mandate');
    this.changed.push({ id, plan });
  }
}

describe.skipIf(!adminUrl)('billing on Razorpay (PostgreSQL, fake provider)', () => {
  const dbName = `sp_bill_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let db: pg.Client;
  const mailer = new MemoryMailer();
  const provider = new FakeProvider();
  const billing: BillingDeps = {
    provider, keyId: 'rzp_test_key', planIds: PLAN_IDS, webhookSecret: WEBHOOK_SECRET,
    seller: { name: 'Example Media Private Limited', address: 'Bengaluru, Karnataka', gstin: '29ABCDE1234F1Z5', sac: null },
  };
  const deps: AuthDeps = { mailer, authSecret: 'test-secret-that-is-at-least-32-chars!!', google: null, billing };
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const call = (who: string, method: string, path: string, body: unknown = null, now = new Date()) =>
    route(db, method, new URL(`http://test${path}`), now, { body, sessionToken: tokens[who]! }, deps);
  const b = (r: { body: unknown }) => r.body as any;
  let clock = Math.floor(Date.now() / 1000);
  let eventN = 0;
  const hook = async (event: string, subId: string, opts: { plan?: PlanId; currentEnd?: number | null; payment?: { id: string; amount: number }; createdAt?: number; eventId?: string } = {}) => {
    const createdAt = opts.createdAt ?? ++clock;
    const body = JSON.stringify({
      entity: 'event', event, created_at: createdAt, contains: opts.payment ? ['subscription', 'payment'] : ['subscription'],
      payload: {
        subscription: { entity: { id: subId, plan_id: PLAN_IDS[opts.plan ?? 'monthly'], status: 'active', current_end: opts.currentEnd === undefined ? createdAt + 30 * 86400 : opts.currentEnd } },
        ...(opts.payment ? { payment: { entity: { id: opts.payment.id, amount: opts.payment.amount, currency: 'INR', status: 'captured' } } } : {}),
      },
    });
    return handleWebhook(db, body, razorpaySignature(WEBHOOK_SECRET, body), opts.eventId ?? `evt_${++eventN}`, billing, new Date());
  };
  const tier = async (who: string) => (await db.query('SELECT tier FROM user_tier WHERE user_id = $1', [ids[who]])).rows[0].tier;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    await migrate(db);
    for (const name of ['payer', 'other']) {
      const u = await db.query(
        `INSERT INTO app_user (public_id, username, email, email_verified_at, age_confirmed_at, terms_accepted_at, privacy_consent_at)
         VALUES ($1, $2, $3, now(), now(), now(), now()) RETURNING id`,
        [newPublicId('us'), name, `${name}@example.invalid`],
      );
      ids[name] = String(u.rows[0].id);
      tokens[name] = newToken();
      await createSession(db, hashToken(tokens[name]!), ids[name]!, new Date());
    }
  });

  afterAll(async () => {
    await db?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  it('checkout creates a provider subscription; nothing is paid until the webhook says so', async () => {
    expect((await call('payer', 'POST', '/v1/billing/checkout', { plan: 'weekly' })).status).toBe(400);
    const r = await call('payer', 'POST', '/v1/billing/checkout', { plan: 'monthly' });
    expect(b(r)).toEqual({ provider_checkout_url: 'https://rzp.example/sub_TEST1', provider: 'razorpay', subscription_id: 'sub_TEST1', key_id: 'rzp_test_key' });
    expect(provider.created[0]!.notes).toMatchObject({ plan: 'monthly' });
    expect(b(await call('payer', 'POST', '/v1/billing/checkout', { plan: 'monthly' }))).toEqual(b(r));
    expect((await call('payer', 'POST', '/v1/billing/checkout', { plan: 'yearly' })).status).toBe(409);
    expect(provider.created).toHaveLength(1);
    expect(await tier('payer')).toBe('free');
  });

  it('charged: paid tier, numbered GST invoice, emailed; replays are ignored', async () => {
    expect(b(await hook('subscription.authenticated', 'sub_TEST1', { currentEnd: null }))).toEqual({ outcome: 'awaiting_first_charge' });
    expect(b(await hook('subscription.activated', 'sub_TEST1'))).toEqual({ outcome: 'active' });
    const charged = await hook('subscription.charged', 'sub_TEST1', { payment: { id: 'pay_1', amount: 29900 }, eventId: 'evt_charge_1' });
    expect(b(charged)).toEqual({ outcome: 'active' });
    expect(await tier('payer')).toBe('paid');
    const inv = b(await call('payer', 'GET', '/v1/billing/invoices')).invoices;
    expect(inv).toHaveLength(1);
    expect(inv[0]).toMatchObject({ amount_inr: 299, gst_inr: 45.61 });
    expect(inv[0].invoice_id).toMatch(/^SP\/\d{4}-\d{2}\/000001$/);
    const detail = b(await call('payer', 'GET', `/v1/billing/invoices/${encodeURIComponent(inv[0].invoice_id)}`));
    expect(detail.text).toContain('TAX INVOICE');
    expect(detail).toMatchObject({ cgst_inr: 22.8, sgst_inr: 22.81 });
    const queuedMail = await db.query(`SELECT payload->>'subject' AS subject FROM job WHERE queue = 'account' AND payload->>'kind' = 'email'`);
    expect(queuedMail.rows.map((r) => r.subject)).toContain(`StockPanic invoice ${inv[0].invoice_id}`);
    expect((await call('other', 'GET', `/v1/billing/invoices/${encodeURIComponent(inv[0].invoice_id)}`)).status).toBe(404);

    expect(b(await hook('subscription.charged', 'sub_TEST1', { payment: { id: 'pay_1', amount: 29900 }, eventId: 'evt_charge_1' }))).toEqual({ duplicate: true });
    expect(b(await call('payer', 'GET', '/v1/billing/invoices')).invoices).toHaveLength(1);
    expect(b(await call('payer', 'GET', '/v1/billing'))).toMatchObject({ tier: 'paid', subscription: { plan: 'monthly', status: 'active', cancel_at_period_end: false } });
  });

  it('bad signatures, unknown subscriptions and stale events change nothing', async () => {
    const body = JSON.stringify({ event: 'subscription.halted', payload: { subscription: { entity: { id: 'sub_TEST1' } } } });
    expect((await handleWebhook(db, body, razorpaySignature('wrong', body), 'evt_x', billing, new Date())).status).toBe(401);
    expect(b(await hook('subscription.activated', 'sub_UNKNOWN'))).toEqual({ outcome: 'unknown_subscription' });
    expect(b(await hook('subscription.halted', 'sub_TEST1', { createdAt: clock - 1000 }))).toEqual({ outcome: 'stale' });
    expect(await tier('payer')).toBe('paid');
  });

  it('a failed charge keeps access during retries; exhausted retries move the account to Free', async () => {
    const pastEnd = Math.floor(Date.now() / 1000) - 3600; // the paid period has already ended
    expect(b(await hook('subscription.pending', 'sub_TEST1', { currentEnd: pastEnd }))).toEqual({ outcome: 'past_due' });
    expect(await tier('payer')).toBe('paid'); // 7-day grace (US-007.7 AC-6)
    expect(b(await call('payer', 'GET', '/v1/billing')).subscription.payment_retrying).toBe(true);
    expect(b(await call('payer', 'GET', '/v1/me/notifications')).notices[0]).toMatchObject({ kind: 'payment_retrying' });
    const queuedMail = await db.query(`SELECT payload->>'subject' AS subject FROM job WHERE queue = 'account' AND payload->>'kind' = 'email'`);
    expect(queuedMail.rows.some((r) => r.subject.includes('payment failed'))).toBe(true);

    expect(b(await hook('subscription.charged', 'sub_TEST1', { payment: { id: 'pay_2', amount: 29900 } }))).toEqual({ outcome: 'active' }); // a retry succeeded
    expect(b(await call('payer', 'GET', '/v1/billing')).subscription.payment_retrying).toBe(false);

    await hook('subscription.pending', 'sub_TEST1', { currentEnd: pastEnd });
    expect(b(await hook('subscription.halted', 'sub_TEST1'))).toEqual({ outcome: 'expired' });
    expect(await tier('payer')).toBe('free');
    expect(b(await call('payer', 'GET', '/v1/me/notifications')).notices.map((n: any) => n.kind)).toContain('downgraded');
  });

  it('re-subscribe, switch plan at renewal, cancel in one step with access to period end', async () => {
    const r = await call('payer', 'POST', '/v1/billing/checkout', { plan: 'monthly' });
    const subId = b(r).subscription_id;
    await hook('subscription.charged', subId, { payment: { id: 'pay_3', amount: 29900 } });
    expect(await tier('payer')).toBe('paid');
    expect((await call('payer', 'POST', '/v1/billing/checkout', { plan: 'yearly' })).status).toBe(409);

    expect(b(await call('payer', 'POST', '/v1/billing/switch', { plan: 'yearly' })).subscription.pending_plan).toBe('yearly');
    expect(provider.changed.at(-1)).toEqual({ id: subId, plan: 'yearly' });
    await hook('subscription.charged', subId, { plan: 'yearly', currentEnd: clock + 365 * 86400, payment: { id: 'pay_4', amount: 299900 } });
    expect(b(await call('payer', 'GET', '/v1/billing')).subscription).toMatchObject({ plan: 'yearly', pending_plan: null });
    expect(b(await call('payer', 'GET', '/v1/billing/invoices')).invoices[0]).toMatchObject({ amount_inr: 2999, gst_inr: 457.47 });

    provider.refuseChange = true;
    expect(b(await call('payer', 'POST', '/v1/billing/switch', { plan: 'monthly' }))).toEqual({ error: 'switch_unavailable' });

    const c = await call('payer', 'POST', '/v1/billing/cancel');
    expect(b(c).subscription).toMatchObject({ cancel_at_period_end: true, renews_at: null });
    expect(provider.cancelled).toEqual([subId]);
    expect(await tier('payer')).toBe('paid'); // until the period ends (US-007.8 AC-2)
    await hook('subscription.cancelled', subId, { plan: 'yearly', currentEnd: clock + 365 * 86400 });
    expect(await tier('payer')).toBe('paid');
    expect((await call('payer', 'POST', '/v1/billing/cancel')).status).toBe(409);

    // Subscribing again while the cancelled plan still runs is allowed.
    const again = await call('payer', 'POST', '/v1/billing/checkout', { plan: 'monthly' });
    await hook('subscription.charged', b(again).subscription_id, { payment: { id: 'pay_5', amount: 29900 } });
    expect((await db.query(`SELECT count(*)::int AS n FROM subscription WHERE user_id = $1 AND status IN ('active', 'past_due')`, [ids['payer']])).rows[0].n).toBe(1);
  });

  it('deleting the account stops future charges at the provider', async () => {
    const live = (await db.query(`SELECT provider_ref FROM subscription WHERE user_id = $1 AND status = 'active'`, [ids['payer']])).rows[0].provider_ref;
    expect((await call('payer', 'POST', '/v1/me/delete', { comments: 'delete' })).status).toBe(202);
    expect(provider.cancelled).toContain(live);
  });

  it('invoice numbers run without gaps', async () => {
    const nums = (await db.query(`SELECT invoice_number FROM invoice ORDER BY id`)).rows.map((r) => Number(r.invoice_number.split('/')[2]));
    expect(nums).toEqual(nums.map((_, i) => i + 1));
  });
});
