// Desktop browser push (PRD-003 US-003.6 AC-1) behind one interface, like the mailer (ADR-007).

import webpush from 'web-push';

export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export type PushResult = 'sent' | 'gone' | 'error';

export interface Pusher {
  send(subscription: PushSubscription, payload: string): Promise<PushResult>;
}

export class MemoryPusher implements Pusher {
  readonly sent: { subscription: PushSubscription; payload: string }[] = [];
  readonly gone = new Set<string>();
  async send(subscription: PushSubscription, payload: string): Promise<PushResult> {
    if (this.gone.has(subscription.endpoint)) return 'gone';
    this.sent.push({ subscription, payload });
    return 'sent';
  }
}

export interface VapidConfig {
  subject: string; // mailto: or https: contact, required by push services
  publicKey: string;
  privateKey: string;
}

const PUSH_TTL_SECONDS = 3600;

export class WebPusher implements Pusher {
  private readonly vapid: VapidConfig;
  constructor(vapid: VapidConfig) {
    this.vapid = vapid;
  }

  async send(subscription: PushSubscription, payload: string): Promise<PushResult> {
    try {
      await webpush.sendNotification(subscription, payload, { vapidDetails: this.vapid, TTL: PUSH_TTL_SECONDS });
      return 'sent';
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // The browser withdrew the subscription: the caller deletes it.
      return status === 404 || status === 410 ? 'gone' : 'error';
    }
  }
}

// PUSH = web | memory | off (default off). web needs VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.
export function pusherFromEnv(env: Record<string, string | undefined> = process.env): Pusher | null {
  const kind = env['PUSH'] ?? 'off';
  if (kind === 'off') return null;
  if (kind === 'memory') return new MemoryPusher();
  if (kind !== 'web') throw new Error(`unknown PUSH: ${kind}`);
  const subject = env['VAPID_SUBJECT'];
  const publicKey = env['VAPID_PUBLIC_KEY'];
  const privateKey = env['VAPID_PRIVATE_KEY'];
  if (!subject || !publicKey || !privateKey) throw new Error('PUSH=web needs VAPID_SUBJECT, VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY');
  return new WebPusher({ subject, publicKey, privateKey });
}

export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  return webpush.generateVAPIDKeys();
}
