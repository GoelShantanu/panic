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
        mailer,
        log: (l: string) => console.log(l),
      }
    : null;
const server = createApiServer(pool, {
  mailer,
  authSecret,
  google: googleClientId ? createGoogleVerifier(googleClientId) : null,
  billing,
});
if (!billing) console.log('billing disabled: Razorpay or seller settings unset');
server.listen(port, () => console.log(`api listening on :${port}${googleClientId ? '' : ' (Google sign-in disabled: GOOGLE_CLIENT_ID unset)'}`));

const shutdown = () => server.close(() => void pool.end());
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
