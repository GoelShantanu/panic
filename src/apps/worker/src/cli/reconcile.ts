import pg from 'pg';
import { listEnabledSources } from '@stockpanic/db';
import { mailerFromEnv } from '@stockpanic/mail';
import { reconcileFilings } from '../ingestion/filings.ts';

// Daily filings reconciliation (ingestion.md §3.1). Run from the host scheduler at 23:30 IST for
// the day, and at 07:30 IST with --date for the previous day. OPS_EMAIL receives coverage alerts.
//   node reconcile.ts [--date YYYY-MM-DD]
const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}
const i = process.argv.indexOf('--date');
const date = i > 0 ? process.argv[i + 1] : new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('usage: reconcile.ts [--date YYYY-MM-DD]');
  process.exit(2);
}
const db = new pg.Client({ connectionString: url });
await db.connect();
try {
  const sources = (await listEnabledSources(db)).filter((s) => s.kind === 'filing' && typeof s.adapter['reconcile_url'] === 'string');
  if (sources.length === 0) console.log('no filing source has a reconcile_url');
  const alerts: string[] = [];
  for (const s of sources) {
    const r = await reconcileFilings(db, s, date, new Date());
    if (r.error) {
      console.error(`${s.sourceId}: reconciliation failed: ${r.error}`);
      alerts.push(`${s.sourceId}: reconciliation failed for ${date}: ${r.error}`);
      continue;
    }
    for (const x of r.byExchange) {
      console.log(`${s.sourceId} ${x.exchange} ${date}: expected=${x.expected} ingested=${x.ingested} backfilled=${x.backfilled} coverage=${(x.coverage * 100).toFixed(2)}%`);
      if (x.alert) alerts.push(`${x.exchange} filings coverage ${(x.coverage * 100).toFixed(2)}% on ${date} (below 99.5%); ${x.backfilled} backfilled.`);
    }
    for (const l of r.latency) console.log(`latency ${date} ${l.session}: filings=${l.filings} p50=${l.p50_s?.toFixed(1)}s p95=${l.p95_s?.toFixed(1)}s`);
  }
  if (alerts.length) {
    console.log(`ALERT ${alerts.join(' | ')}`);
    if (process.env['OPS_EMAIL']) await mailerFromEnv().send({ to: process.env['OPS_EMAIL'], subject: `[StockPanic] Filings reconciliation ${date}`, text: alerts.join('\n') });
    process.exitCode = 1;
  }
} finally {
  await db.end();
}
