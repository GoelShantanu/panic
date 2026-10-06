import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { mailerFromEnv } from '@stockpanic/mail';
import { createGoogleVerifier } from '../google.ts';
import { razorpayFromEnv } from '../razorpay.ts';
import { createApiServer } from '../server.ts';

const url = process.env['DATABASE_URL'];
const authSecret = process.env['AUTH_SECRET'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}
if (!authSecret || authSecret.length < 32) {
  console.error('AUTH_SECRET must be set to at least 32 characters (keys sign-in code hashes)');
  process.exit(2);
}
const port = Number(process.env['PORT'] ?? 3000);
const googleClientId = process.env['GOOGLE_CLIENT_ID'];

const pool = new pg.Pool({ connectionString: url, max: 10 });
const mailer = mailerFromEnv();
// Billing (D-035, D-036): RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_PLAN_MONTHLY, RAZORPAY_PLAN_YEARLY,
// RAZORPAY_WEBHOOK_SECRET; invoices use SELLER_NAME, SELLER_ADDRESS, SELLER_GSTIN (blank: not registered), SELLER_SAC.
const razorpay = razorpayFromEnv(process.env);
const env = process.env;
const billing =
  razorpay && env['RAZORPAY_WEBHOOK_SECRET'] && env['SELLER_NAME'] && env['SELLER_ADDRESS']
    ? {
        provider: razorpay,
        keyId: env['RAZORPAY_KEY_ID']!,
        planIds: { monthly: env['RAZORPAY_PLAN_MONTHLY']!, yearly: env['RAZORPAY_PLAN_YEARLY']! },
        webhookSecret: env['RAZORPAY_WEBHOOK_SECRET'],
        seller: { name: env['SELLER_NAME'], address: env['SELLER_ADDRESS'], gstin: env['SELLER_GSTIN'] || null, sac: env['SELLER_SAC'] || null },
        log: (l: string) => console.log(l),
      }
    : null;
// Pages (ADR-002, D-040): Next.js renders every non-/v1 path in this same process. PAGES=off runs the
// API alone. Pages read the API over loopback (SP_INTERNAL_ORIGIN); /v1/live passes through to apps/live.
let pages: ((req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>) | undefined;
let upgrade: ((req: import('node:http').IncomingMessage, socket: import('node:stream').Duplex, head: Buffer) => Promise<void>) | undefined;
if (process.env['PAGES'] !== 'off') {
  process.env['SP_INTERNAL_ORIGIN'] = `http://127.0.0.1:${port}`;
  type Handler = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>;
  type Upgrade = (req: import('node:http').IncomingMessage, socket: import('node:stream').Duplex, head: Buffer) => Promise<void>;
  const mod = (await import('next')) as unknown as {
    default: (o: { dev: boolean; dir: string }) => { prepare(): Promise<void>; getRequestHandler(): Handler; getUpgradeHandler(): Upgrade };
  };
  const site = mod.default({ dev: process.env['NODE_ENV'] !== 'production', dir: fileURLToPath(new URL('../..', import.meta.url)) });
  await site.prepare();
  const handle = site.getRequestHandler();
  pages = (req, res) => handle(req, res);
  upgrade = site.getUpgradeHandler();
}
const server = createApiServer(
  pool,
  { mailer, authSecret, google: googleClientId ? createGoogleVerifier(googleClientId) : null, billing },
  { ...(pages ? { pages } : {}), ...(process.env['LIVE_ORIGIN'] ? { liveOrigin: process.env['LIVE_ORIGIN'] } : {}) },
);
if (!billing) console.log('billing disabled: Razorpay or seller settings unset');
// Next.js development reload runs over a WebSocket; without it the page never hydrates.
if (upgrade) server.on('upgrade', (req, socket, head) => void upgrade(req, socket, head));
server.listen(port, () => console.log(`api listening on :${port}${googleClientId ? '' : ' (Google sign-in disabled: GOOGLE_CLIENT_ID unset)'}`));

const shutdown = () => server.close(() => void pool.end());
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
