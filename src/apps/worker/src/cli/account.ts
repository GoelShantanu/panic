import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { mailerFromEnv } from '@stockpanic/mail';
import { drainAccountJobs } from '../account/runner.ts';

const IDLE_MS = 10_000;

export async function startAccountWorker(
  pool: pg.Pool,
  options: { once?: boolean; isStopping: () => boolean; workerId?: string }
): Promise<void> {
  const { once = false, isStopping, workerId = `${hostname()}:${process.pid}` } = options;
  const mailer = mailerFromEnv();

  do {
    let client: pg.PoolClient | undefined;
    try {
      client = await pool.connect();
      const r = await drainAccountJobs(client, workerId, () => new Date(), mailer);
      if (r.deleted || r.exported || r.emailed || r.failed) {
        console.log(`deleted=${r.deleted} exported=${r.exported} emailed=${r.emailed} failed=${r.failed}`);
      }
      for (const e of r.errors) console.error(e);
    } catch (err) {
      console.error('account worker iteration error:', (err as Error).message);
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
    await startAccountWorker(pool, { once, isStopping: () => stopping });
  } finally {
    await pool.end();
  }
}
