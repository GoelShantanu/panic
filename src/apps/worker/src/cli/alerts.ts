import { hostname } from 'node:os';
import pg from 'pg';
import { mailerFromEnv } from '@stockpanic/mail';
import { pusherFromEnv } from '@stockpanic/push';
import { drainAlertJobs, runDigests } from '../alerts/deliver.ts';

const url = process.env['DATABASE_URL'];
const authSecret = process.env['AUTH_SECRET'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}
if (!authSecret || authSecret.length < 32) {
  console.error('AUTH_SECRET must match the API server (signs unsubscribe links)');
  process.exit(2);
}
const once = process.argv.includes('--once');
const deps = {
  mailer: mailerFromEnv(),
  pusher: pusherFromEnv(),
  baseUrl: (process.env['PUBLIC_BASE_URL'] ?? 'http://localhost:3000').replace(/\/$/, ''),
  authSecret,
};
const workerId = `${hostname()}:${process.pid}`;
const DIGEST_EVERY_MS = 60_000;

const db = new pg.Client({ connectionString: url });
await db.connect();
let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});

try {
  let lastDigestRun = 0;
  do {
    const r = await drainAlertJobs(db, deps, workerId);
    if (r.stories || r.failed) console.log(`stories=${r.stories} individual=${r.individual} digest=${r.digest} failed=${r.failed}`);
    for (const e of r.errors) console.error(e);
    if (once || Date.now() - lastDigestRun > DIGEST_EVERY_MS) {
      const sent = await runDigests(db, deps, new Date());
      if (sent) console.log(`digests sent=${sent}`);
      lastDigestRun = Date.now();
    }
    if (!once && !stopping) await new Promise((res) => setTimeout(res, 2_000));
  } while (!once && !stopping);
} finally {
  await db.end();
}
