import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { tick } from '../ingestion/scheduler.ts';

const TICK_MS = 5_000;

export async function runIngestTick(db: pg.ClientBase): Promise<void> {
  const result = await tick(db, new Date());
  if (result.calendarMissing) console.warn('WARN no trading-calendar row covers now; using "closed" cadence');
  for (const f of result.fetched) {
    console.log(
      `${f.sourceId}: ${f.outcome} inserted=${f.inserted} dup=${f.duplicates} non_en=${f.discardedNonEnglish} invalid=${f.discardedInvalid}` +
        (f.error ? ` error="${f.error}"` : '') +
        ` next=${f.nextFetchAt.toISOString()}`,
    );
  }
  if (result.inbox.payloads) console.log(`inbox: payloads=${result.inbox.payloads} inserted=${result.inbox.inserted}`);
  for (const e of result.inbox.errors) console.error(`inbox: ${e}`);
  for (const h of result.healthChanges) console.log(`${h.sourceId}: health ${h.from} -> ${h.to}`);
}

export async function startIngestWorker(pool: pg.Pool, options: { once?: boolean; isStopping: () => boolean }): Promise<void> {
  const { once = false, isStopping } = options;
  do {
    let client: pg.PoolClient | undefined;
    try {
      client = await pool.connect();
      await runIngestTick(client);
    } catch (err) {
      console.error('ingest tick failed:', (err as Error).message);
    } finally {
      client?.release();
    }
    if (!once && !isStopping()) await new Promise((r) => setTimeout(r, TICK_MS));
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
    await startIngestWorker(pool, { once, isStopping: () => stopping });
  } finally {
    await pool.end();
  }
}
