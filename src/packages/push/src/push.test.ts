import { describe, expect, it } from 'vitest';
import { MemoryPusher, WebPusher, generateVapidKeys, pusherFromEnv } from './index.ts';

describe('push (PRD-003 US-003.6)', () => {
  const sub = { endpoint: 'https://push.example.invalid/abc', keys: { p256dh: 'p', auth: 'a' } };

  it('memory transport records sends and reports withdrawn subscriptions as gone', async () => {
    const p = new MemoryPusher();
    expect(await p.send(sub, '{}')).toBe('sent');
    p.gone.add(sub.endpoint);
    expect(await p.send(sub, '{}')).toBe('gone');
    expect(p.sent).toHaveLength(1);
  });

  it('is off unless configured; web push needs VAPID keys', () => {
    expect(pusherFromEnv({})).toBeNull();
    expect(pusherFromEnv({ PUSH: 'memory' })).toBeInstanceOf(MemoryPusher);
    expect(() => pusherFromEnv({ PUSH: 'web' })).toThrow(/VAPID/);
    const keys = generateVapidKeys();
    expect(pusherFromEnv({ PUSH: 'web', VAPID_SUBJECT: 'mailto:ops@example.invalid', VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey })).toBeInstanceOf(WebPusher);
  });
});
