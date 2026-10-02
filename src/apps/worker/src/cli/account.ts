import { hostname } from 'node:os';
import pg from 'pg';
import { drainAccountJobs } from '../account/runner.ts';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}
const once = process.argv.includes('--once');
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
    const r = await drainAccountJobs(db, `${hostname()}:${process.pid}`);
    if (r.deleted || r.exported || r.failed) console.log(`deleted=${r.deleted} exported=${r.exported} failed=${r.failed}`);
    for (const e of r.errors) console.error(e);
    if (!once && !stopping) await new Promise((res) => setTimeout(res, 10_000));
  } while (!once && !stopping);
} finally {
  await db.end();
}
