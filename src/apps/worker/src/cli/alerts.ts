import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { mailerFromEnv } from '@stockpanic/mail';
import { pusherFromEnv } from '@stockpanic/push';
import { drainAlertJobs, runDigests } from '../alerts/deliver.ts';

const IDLE_MS = 2_000;
const DIGEST_EVERY_MS = 60_000;

export async function startAlertsWorker(
  pool: pg.Pool,
  options: { once?: boolean; isStopping: () => boolean; workerId?: string; authSecret?: string; baseUrl?: string }
): Promise<void> {
  const authSecret = options.authSecret ?? process.env['AUTH_SECRET'];
  if (!authSecret || authSecret.length < 32) {
    console.error('AUTH_SECRET must match the API server (signs unsubscribe links)');
    process.exit(2);
  }
  const { once = false, isStopping, workerId = `${hostname()}:${process.pid}` } = options;
  const deps = {
    mailer: mailerFromEnv(),
    pusher: pusherFromEnv(),
    baseUrl: (options.baseUrl ?? process.env['PUBLIC_BASE_URL'] ?? 'http://localhost:3000').replace(/\/$/, ''),
    authSecret,
  };

  let lastDigestRun = 0;
  do {
    let client: pg.PoolClient | undefined;
    try {
      client = await pool.connect();
      const r = await drainAlertJobs(client, deps, workerId);
      if (r.stories || r.corrections || r.failed) {
        console.log(`stories=${r.stories} individual=${r.individual} digest=${r.digest} corrections=${r.corrections} failed=${r.failed}`);
      }
      for (const e of r.errors) console.error(e);
      if (once || Date.now() - lastDigestRun > DIGEST_EVERY_MS) {
        const sent = await runDigests(client, deps, new Date());
        if (sent) console.log(`digests sent=${sent}`);
        lastDigestRun = Date.now();
      }
    } catch (err) {
      console.error('alerts worker iteration error:', (err as Error).message);
    } finally {
      client?.release();
    }
    if (!once && !isStopping()) await new Promise((res) => setTimeout(res, IDLE_MS));
  } while (!once && !isStopping());
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(2);
  }
  const once = process.argv.includes('--once');
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  let stopping = false;
  process.on('SIGINT', () => { stopping = true; });
  process.on('SIGTERM', () => { stopping = true; });
  try {
    await startAlertsWorker(pool, { once, isStopping: () => stopping });
  } finally {
    await pool.end();
  }
}
