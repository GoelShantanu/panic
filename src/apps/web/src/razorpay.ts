// Payment provider boundary (D-035: Razorpay). Handlers depend on BillingProvider; tests use a fake.
// Razorpay Subscriptions API: POST /v1/subscriptions, POST /v1/subscriptions/:id/cancel,
// PATCH /v1/subscriptions/:id; HTTP Basic auth with key ID and key secret.

import type { PlanId } from '@stockpanic/core';

export class ProviderError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface BillingProvider {
  createSubscription(plan: PlanId, notes: Record<string, string>): Promise<{ id: string; shortUrl: string }>;
  cancelAtCycleEnd(subscriptionId: string): Promise<void>;
  changePlanAtCycleEnd(subscriptionId: string, plan: PlanId): Promise<void>;
}

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  planIds: Record<PlanId, string>; // provider plan IDs, created once in the Razorpay dashboard
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

// Razorpay needs a finite number of billing cycles; ten years either way [ASSUMPTION].
const TOTAL_COUNT: Record<PlanId, number> = { monthly: 120, yearly: 10 };

export class RazorpayProvider implements BillingProvider {
  readonly #c: RazorpayConfig;
  constructor(config: RazorpayConfig) {
    this.#c = config;
  }

  async #call(method: string, path: string, body: unknown): Promise<any> {
    const res = await (this.#c.fetchImpl ?? fetch)(`${this.#c.baseUrl ?? 'https://api.razorpay.com'}${path}`, {
      method,
      headers: {
        authorization: `Basic ${Buffer.from(`${this.#c.keyId}:${this.#c.keySecret}`).toString('base64')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) throw new ProviderError(res.status, `razorpay ${method} ${path}: HTTP ${res.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  }

  async createSubscription(plan: PlanId, notes: Record<string, string>) {
    // customer_notify: Razorpay sends the customer's payment and pre-debit communications (US-007.7 AC-4).
    const r = await this.#call('POST', '/v1/subscriptions', { plan_id: this.#c.planIds[plan], total_count: TOTAL_COUNT[plan], customer_notify: 1, notes });
    if (typeof r.id !== 'string' || typeof r.short_url !== 'string') throw new ProviderError(502, 'razorpay: subscription response without id or short_url');
    return { id: r.id, shortUrl: r.short_url };
  }

  async cancelAtCycleEnd(subscriptionId: string) {
    await this.#call('POST', `/v1/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { cancel_at_cycle_end: 1 });
  }

  async changePlanAtCycleEnd(subscriptionId: string, plan: PlanId) {
    await this.#call('PATCH', `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, { plan_id: this.#c.planIds[plan], schedule_change_at: 'cycle_end' });
  }
}

export function razorpayFromEnv(env: Record<string, string | undefined>): RazorpayProvider | null {
  const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret, RAZORPAY_PLAN_MONTHLY: monthly, RAZORPAY_PLAN_YEARLY: yearly } = env;
  if (!keyId || !keySecret || !monthly || !yearly) return null;
  // RAZORPAY_BASE_URL exists for local testing against a stand-in server.
  return new RazorpayProvider({ keyId, keySecret, planIds: { monthly, yearly }, ...(env['RAZORPAY_BASE_URL'] ? { baseUrl: env['RAZORPAY_BASE_URL'] } : {}) });
}
