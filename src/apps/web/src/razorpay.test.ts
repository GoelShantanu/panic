import { describe, expect, it } from 'vitest';
import { ProviderError, RazorpayProvider, razorpayFromEnv } from './razorpay.ts';

function stub(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}
const config = { keyId: 'rzp_test_abc', keySecret: 'secret', planIds: { monthly: 'plan_M', yearly: 'plan_Y' } };

describe('RazorpayProvider (no network)', () => {
  it('creates a subscription with Basic auth, the provider plan, a finite cycle count and customer notifications', async () => {
    const { calls, fetchImpl } = stub(200, { id: 'sub_1', short_url: 'https://rzp.io/i/x', status: 'created' });
    const r = await new RazorpayProvider({ ...config, fetchImpl }).createSubscription('yearly', { user_id: 'us_1' });
    expect(r).toEqual({ id: 'sub_1', shortUrl: 'https://rzp.io/i/x' });
    expect(calls[0]!.url).toBe('https://api.razorpay.com/v1/subscriptions');
    expect((calls[0]!.init.headers as Record<string, string>)['authorization']).toBe(`Basic ${Buffer.from('rzp_test_abc:secret').toString('base64')}`);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ plan_id: 'plan_Y', total_count: 10, customer_notify: 1, notes: { user_id: 'us_1' } });
  });

  it('cancels at cycle end and changes plan at cycle end', async () => {
    const { calls, fetchImpl } = stub(200, {});
    const p = new RazorpayProvider({ ...config, fetchImpl });
    await p.cancelAtCycleEnd('sub_1');
    await p.changePlanAtCycleEnd('sub_1', 'monthly');
    expect(calls.map((c) => [c.init.method, c.url, JSON.parse(String(c.init.body))])).toEqual([
      ['POST', 'https://api.razorpay.com/v1/subscriptions/sub_1/cancel', { cancel_at_cycle_end: 1 }],
      ['PATCH', 'https://api.razorpay.com/v1/subscriptions/sub_1', { plan_id: 'plan_M', schedule_change_at: 'cycle_end' }],
    ]);
  });

  it('surfaces provider errors with their status', async () => {
    const { fetchImpl } = stub(400, { error: { description: 'bad' } });
    await expect(new RazorpayProvider({ ...config, fetchImpl }).cancelAtCycleEnd('sub_1')).rejects.toBeInstanceOf(ProviderError);
  });

  it('is configured only when every key is set', () => {
    expect(razorpayFromEnv({ RAZORPAY_KEY_ID: 'k', RAZORPAY_KEY_SECRET: 's', RAZORPAY_PLAN_MONTHLY: 'm' })).toBeNull();
    expect(razorpayFromEnv({ RAZORPAY_KEY_ID: 'k', RAZORPAY_KEY_SECRET: 's', RAZORPAY_PLAN_MONTHLY: 'm', RAZORPAY_PLAN_YEARLY: 'y' })).toBeInstanceOf(RazorpayProvider);
  });
});
