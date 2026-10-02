import pg from 'pg';
import { tick } from '../ingestion/scheduler.ts';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}
const once = process.argv.includes('--once');
const TICK_MS = 5_000;

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
  do {
    const result = await tick(db, new Date());
    if (result.calendarMissing) console.warn('WARN no trading-calendar row covers now; using "closed" cadence');
    for (const f of result.fetched) {
      console.log(
        `${f.sourceId}: ${f.outcome} inserted=${f.inserted} dup=${f.duplicates} non_en=${f.discardedNonEnglish} invalid=${f.discardedInvalid}` +
          (f.error ? ` error="${f.error}"` : '') +
          ` next=${f.nextFetchAt.toISOString()}`,
      );
    }
    for (const h of result.healthChanges) console.log(`${h.sourceId}: health ${h.from} -> ${h.to}`);
    if (!once && !stopping) await new Promise((r) => setTimeout(r, TICK_MS));
  } while (!once && !stopping);
} finally {
  await db.end();
}
