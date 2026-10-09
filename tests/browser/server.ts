// This fixture is a separate executable. None of these endpoints or providers ship in the app.
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { hashPassword, newPublicId, razorpaySignature } from '@stockpanic/core';
import { migrate } from '@stockpanic/db';
import { MemoryMailer } from '@stockpanic/mail';
import { createApiServer } from '../../src/apps/web/src/server.ts';
import { handleWebhook } from '../../src/apps/web/src/billing.ts';
import type { BillingDeps } from '../../src/apps/web/src/billing.ts';

const adminUrl = process.env['TEST_DATABASE_URL'];
if (!adminUrl) throw new Error('TEST_DATABASE_URL is required; use a disposable PostgreSQL service. Never use DATABASE_URL.');
const parsed = new URL(adminUrl);
if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || parsed.pathname !== '/postgres') throw new Error('Browser fixtures require a loopback PostgreSQL admin URL ending /postgres');
const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production', NEXT_DIST_DIR: '.next-browser', NEXT_TELEMETRY_DISABLED: '1', SP_INTERNAL_ORIGIN: 'http://127.0.0.1:3102' };
Object.assign(process.env, env);
const build = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build', 'src/apps/web'], { env, stdio: 'inherit' });
if (build.status !== 0) throw new Error('Browser production build failed');
const dbName = `sp_browser_${randomBytes(6).toString('hex')}`;
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
await admin.query(`CREATE DATABASE ${dbName}`);
parsed.pathname = `/${dbName}`;
const pool = new pg.Pool({ connectionString: parsed.toString() });
let cleaned = false;
async function cleanup() {
  if (cleaned) return;
  await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  cleaned = true;
}
try {
  const db = await pool.connect();
  try { await migrate(db); } finally { db.release(); }
  const seed = spawnSync(process.execPath, ['src/apps/worker/src/cli/seed-demo.ts'], { env: { ...env, DATABASE_URL: parsed.toString() }, stdio: 'inherit' });
  if (seed.status !== 0) throw new Error('Browser seed failed');
  for (const name of ['reader', 'other', 'payerdesktop', 'payermobile', 'recoverydesktop', 'recoverymobile']) {
    await pool.query(`INSERT INTO app_user (public_id, username, email, password_hash, email_verified_at, age_confirmed_at, terms_accepted_at, privacy_consent_at)
      VALUES ($1,$2,$3,$4,now(),now(),now(),now())`, [newPublicId('us'), name, `${name}@example.invalid`, await hashPassword('A unique browser testing passphrase!')]);
  }
  const story = (await pool.query('SELECT public_id FROM story ORDER BY first_seen_at DESC LIMIT 1')).rows[0].public_id as string;
  const mailer = new MemoryMailer();
  const webhookSecret = 'browser-only-fake-provider-secret';
  const billing: BillingDeps = {
    provider: {
      async createSubscription() { const id = `sub_BROWSER${randomBytes(4).toString('hex')}`; return { id, shortUrl: `http://127.0.0.1:3102/__test/checkout/${id}` }; },
      async cancelAtCycleEnd() {}, async changePlanAtCycleEnd() {},
    },
    keyId: 'rzp_browser_fixture', planIds: { monthly: 'plan_BROWSERMONTHLY', yearly: 'plan_BROWSERYEARLY' }, webhookSecret,
    seller: { name: 'Fictional Browser Tests', address: 'Test fixtures only', gstin: null, sac: null },
  };
  const streams = new Set<ServerResponse>();
  const connections: string[] = [];
  let disconnected = false;
  const live = createServer((req, res) => {
    connections.push(req.url ?? '/');
    if (disconnected) { res.writeHead(503); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    res.write(`id: browser-1\nevent: story.updated\ndata: ${JSON.stringify({ story_id: story, changes: { comment_count: 99 } })}\n\n`);
    streams.add(res);
    req.on('close', () => streams.delete(res));
  });
  await new Promise<void>(resolve => live.listen(3103, '127.0.0.1', resolve));
  type Handler = (req: import('node:http').IncomingMessage, res: ServerResponse) => Promise<void>;
  const next = (await import('next')).default as unknown as (options: { dev: boolean; dir: string }) => { prepare(): Promise<void>; getRequestHandler(): Handler };
  const site = next({ dev: false, dir: fileURLToPath(new URL('../../src/apps/web', import.meta.url)) });
  await site.prepare();
  const handle = site.getRequestHandler();
  const metrics: Record<string, number> = {};
  const server = createApiServer(pool, { mailer, authSecret: 'browser-fixture-secret-at-least-32-characters', google: null, billing }, {
    liveOrigin: 'http://127.0.0.1:3103',
    pages: async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1:3102');
      if (!url.pathname.startsWith('/__test/')) return handle(req, res);
      res.setHeader('content-type', 'application/json');
      if (url.pathname === '/__test/cleanup' && req.method === 'POST') { await cleanup(); res.end('{}'); return; }
      if (url.pathname === '/__test/mail') {
        const message = [...mailer.sent].reverse().find(m => m.to === url.searchParams.get('email'));
        res.end(JSON.stringify({ code: message?.text.match(/\b\d{6}\b/)?.[0] ?? null })); return;
      }
      if (url.pathname === '/__test/metrics') {
        const snapshot = { ...metrics };
        if (req.method === 'DELETE') for (const key of Object.keys(metrics)) delete metrics[key];
        res.end(JSON.stringify(snapshot)); return;
      }
      if (url.pathname === '/__test/live') {
        if (req.method === 'POST') {
          disconnected = url.searchParams.get('down') === '1';
          if (disconnected) for (const stream of streams) stream.end();
        }
        res.end(JSON.stringify({ connections })); return;
      }
      if (url.pathname === '/__test/payment' && req.method === 'POST') {
        const id = url.searchParams.get('id');
        const createdAt = Math.floor(Date.now() / 1000);
        const body = JSON.stringify({ entity: 'event', event: 'subscription.charged', created_at: createdAt, payload: {
          subscription: { entity: { id, plan_id: billing.planIds.monthly, status: 'active', current_end: createdAt + 30 * 86400 } },
          payment: { entity: { id: `pay_BROWSER${randomBytes(4).toString('hex')}`, amount: 99900, currency: 'INR', status: 'captured' } },
        } });
        const db = await pool.connect();
        try { const result = await handleWebhook(db, body, razorpaySignature(webhookSecret, body), `evt_${randomBytes(4).toString('hex')}`, billing, new Date()); res.statusCode = result.status; res.end(JSON.stringify(result.body)); }
        finally { db.release(); }
        return;
      }
      if (url.pathname === '/__test/ready') { res.end('{}'); return; }
      res.statusCode = 404; res.end('{}');
    },
  });
  server.on('request', req => { const path = new URL(req.url ?? '/', 'http://test').pathname; if (path.startsWith('/v1/')) metrics[path] = (metrics[path] ?? 0) + 1; });
  server.listen(3102, '127.0.0.1', () => console.log('Browser fixture ready on 3102 (fictional data, fake payment provider, memory email)'));
  const stop = async () => { for (const stream of streams) stream.end(); live.close(); server.close(); await cleanup(); process.exit(); };
  process.on('SIGINT', () => void stop()); process.on('SIGTERM', () => void stop());
} catch (error) { await cleanup(); throw error; }
