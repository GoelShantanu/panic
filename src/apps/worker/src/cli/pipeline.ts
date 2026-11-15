import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { releaseStuckJobs, sweepExpiredBands } from '@stockpanic/db';
import { buildPipelineContext, drainPipeline } from '../pipeline/runner.ts';

const IDLE_MS = 2_000;
const CONTEXT_REFRESH_MS = 10 * 60_000;
const STUCK_LOCK_SECONDS = 5 * 60;

export async function startPipelineWorker(
  pool: pg.Pool,
  options: { once?: boolean; isStopping: () => boolean; workerId?: string }
): Promise<void> {
  const { once = false, isStopping, workerId = `${hostname()}:${process.pid}` } = options;
  let ctx: Awaited<ReturnType<typeof buildPipelineContext>> | null = null;
  let builtAt = 0;

  do {
    let client: pg.PoolClient | undefined;
    try {
      client = await pool.connect();
      if (!ctx || Date.now() - builtAt > CONTEXT_REFRESH_MS) {
        ctx = await buildPipelineContext(client, new Date());
        builtAt = Date.now();
        console.log(`pipeline worker ${workerId}: ${ctx.aliases.size} alias keys, thresholds ${JSON.stringify(ctx.thresholds)}`);
      }
      const released = await releaseStuckJobs(client, STUCK_LOCK_SECONDS);
      if (released) console.warn(`released ${released} stuck job(s)`);
      const r = await drainPipeline(client, ctx, { workerId, newsOnly: true });
      if (r.processed || r.failed || r.retried) {
        console.log(
          `processed=${r.processed} created=${r.created} joined=${r.joined} skipped=${r.skipped} retried=${r.retried} failed=${r.failed}`,
        );
        for (const e of r.errors) console.error(e);
      }
      await sweepExpiredBands(client);
    } catch (err) {
      console.error('pipeline iteration error:', (err as Error).message);
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
    await startPipelineWorker(pool, { once, isStopping: () => stopping });
  } finally {
    await pool.end();
  }
}
