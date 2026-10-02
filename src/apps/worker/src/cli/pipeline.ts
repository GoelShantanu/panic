import { hostname } from 'node:os';
import pg from 'pg';
import { releaseStuckJobs, sweepExpiredBands } from '@stockpanic/db';
import { buildPipelineContext, drainPipeline } from '../pipeline/runner.ts';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}
const once = process.argv.includes('--once');
const IDLE_MS = 2_000;
const CONTEXT_REFRESH_MS = 10 * 60_000;
const STUCK_LOCK_SECONDS = 5 * 60;
const workerId = `${hostname()}:${process.pid}`;

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
  let ctx = await buildPipelineContext(db, new Date());
  let builtAt = Date.now();
  console.log(`pipeline worker ${workerId}: ${ctx.aliases.size} alias keys, thresholds ${JSON.stringify(ctx.thresholds)}`);
  do {
    if (Date.now() - builtAt > CONTEXT_REFRESH_MS) {
      ctx = await buildPipelineContext(db, new Date());
      builtAt = Date.now();
    }
    const released = await releaseStuckJobs(db, STUCK_LOCK_SECONDS);
    if (released) console.warn(`released ${released} stuck job(s)`);
    const r = await drainPipeline(db, ctx, { workerId });
    if (r.processed || r.failed || r.retried) {
      console.log(
        `processed=${r.processed} created=${r.created} joined=${r.joined} skipped=${r.skipped} retried=${r.retried} failed=${r.failed}`,
      );
      for (const e of r.errors) console.error(e);
    }
    await sweepExpiredBands(db);
    if (!once && !stopping) await new Promise((res) => setTimeout(res, IDLE_MS));
  } while (!once && !stopping);
} finally {
  await db.end();
}
