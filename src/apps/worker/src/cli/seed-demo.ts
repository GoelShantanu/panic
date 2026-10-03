import pg from 'pg';
import { isinCheckDigit, newPublicId } from '@stockpanic/core';
import { ensureCalendar } from '@stockpanic/db';
import { buildPipelineContext, drainPipeline } from '../pipeline/runner.ts';

// Fictional demo data for frontend development and screenshots. Every company, filing and headline is
// invented. Refuses to run on a database that has any non-demo source, so it cannot mix with real data.
const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}
const db = new pg.Client({ connectionString: url });
await db.connect();

const real = await db.query(`SELECT count(*)::int AS n FROM source WHERE source_id NOT LIKE 'src_demo_%'`);
if (real.rows[0].n > 0) {
  console.error('refusing: this database has non-demo sources');
  process.exit(1);
}

const isin = (b: string) => `IN${b}${isinCheckDigit(`IN${b}`)}`;
const COMPANIES = [
  ['E00AST101', 'Asterion Industries Limited', 'ASTERION', '500101', 'Asterion'],
  ['E00KES101', 'Kestrel Power Limited', 'KESTREL', '500202', 'Kestrel Power'],
  ['E00MER101', 'Meridian Textiles Limited', 'MERIDIAN', '500303', 'Meridian Textiles'],
  ['E00ORI101', 'Orion Cables Limited', 'ORIONCAB', '500404', 'Orion Cables'],
  ['E00VEL101', 'Velora Pharma Limited', 'VELORA', '500505', 'Velora Pharma'],
  ['E00TRI101', 'Trident Finserv Limited', 'TRIFIN', '500606', 'Trident Finserv'],
  ['E00SAF101', 'Saffron Foods Limited', 'SAFFRON', '500707', 'Saffron Foods'],
  ['E00NIM101', 'Nimbus Infra Projects Limited', 'NIMBUS', '500808', 'Nimbus Infra'],
] as const;

for (const [b, name, nse, bse, alias] of COMPANIES) {
  const i = isin(b);
  await db.query(`INSERT INTO instrument (isin, segment) VALUES ($1, 'mainboard') ON CONFLICT DO NOTHING`, [i]);
  await db.query(`INSERT INTO instrument_name (isin, kind, name, valid) VALUES ($1, 'legal', $2, '[2020-01-01,)') ON CONFLICT DO NOTHING`, [i, name]);
  await db.query(`INSERT INTO instrument_code (isin, exchange, code, valid) VALUES ($1, 'NSE', $2, '[2020-01-01,)'), ($1, 'BSE', $3, '[2020-01-01,)') ON CONFLICT DO NOTHING`, [i, nse, bse]);
  await db.query(`INSERT INTO instrument_alias (isin, alias, alias_norm, kind, common_word, valid) VALUES ($1, $2, lower($2), 'curated', false, '[2020-01-01,)') ON CONFLICT DO NOTHING`, [i, alias]);
}
const cadence = JSON.stringify(Object.fromEntries(['pre_open', 'open', 'closed', 'holiday', 'special', 'halted'].map((s) => [s, { poll_s: 300, expect: false }])));
for (const [id, name, kind, tier] of [
  ['src_demo_bse', 'BSE Announcements (demo)', 'filing', 1],
  ['src_demo_nse', 'NSE Announcements (demo)', 'filing', 1],
  ['src_demo_wire', 'Example Wire', 'article', 2],
  ['src_demo_desk1', 'Example Markets Desk', 'article', 3],
  ['src_demo_desk2', 'Example Business Daily', 'article', 3],
  ['src_demo_desk3', 'Example Investor News', 'article', 3],
] as const) {
  await db.query(
    `INSERT INTO source (source_id, name, kind, tier, access_basis, access_checked_on, enabled, cadence, adapter)
     VALUES ($1, $2, $3, $4, 'demo data', current_date, false, $5, '{}') ON CONFLICT DO NOTHING`,
    [id, name, kind, tier, cadence],
  );
}

const now = Date.now();
const ago = (min: number) => new Date(now - min * 60_000);
let n = 0;
async function filing(minAgo: number, exchange: 'BSE' | 'NSE', company: number, subject: string, category: string) {
  const c = COMPANIES[company]!;
  const r = await db.query(
    `INSERT INTO item (public_id, kind, source_id, dedup_key, headline, url, published_at, first_seen_at)
     VALUES ($1, 'filing', $2, $3, $4, $5, $6, $6) RETURNING id`,
    [newPublicId('it'), exchange === 'BSE' ? 'src_demo_bse' : 'src_demo_nse', `${exchange}:demo-${++n}`, subject, `https://example.invalid/${exchange}/${n}`, ago(minAgo)],
  );
  await db.query(`INSERT INTO filing_detail (item_id, exchange, announcement_id, scrip_code, category) VALUES ($1, $2, $3, $4, $5)`, [
    r.rows[0].id, exchange, `demo-${n}`, exchange === 'BSE' ? c[3] : c[2], category,
  ]);
  await db.query(`INSERT INTO job (queue, priority, payload) VALUES ('pipeline', 10, $1)`, [{ item_id: r.rows[0].id }]);
}
async function article(minAgo: number, source: string, headline: string) {
  const r = await db.query(
    `INSERT INTO item (public_id, kind, source_id, dedup_key, headline, url, published_at, first_seen_at)
     VALUES ($1, 'article', $2, $3, $4, $5, $6, $6) RETURNING id`,
    [newPublicId('it'), source, `demo-${++n}`, headline, `https://example.invalid/news/${n}`, ago(minAgo)],
  );
  await db.query(`INSERT INTO job (queue, priority, payload) VALUES ('pipeline', 0, $1)`, [{ item_id: r.rows[0].id }]);
}

// Oldest first, so stories form as they would live.
await filing(2600, 'BSE', 4, 'Outcome of Board Meeting - Approval of Audited Financial Results', 'Result');
await article(2590, 'src_demo_desk1', 'Velora Pharma reports quarterly results, board recommends dividend');
await filing(2200, 'NSE', 5, 'Intimation of Credit Rating', 'Credit Rating');
await article(1900, 'src_demo_wire', 'Rupee ends weaker against the dollar as crude prices firm');
await filing(1500, 'BSE', 6, 'Disclosure under Regulation 30 - Award of Order', 'Company Update');
await article(1495, 'src_demo_desk2', 'Saffron Foods wins export order from Gulf distributor');
await article(1490, 'src_demo_desk3', 'Saffron Foods bags export order from Gulf distributor');
await filing(900, 'BSE', 7, 'Intimation of Board Meeting to consider fund raising', 'Board Meeting');
await filing(400, 'BSE', 0, 'Outcome of Board Meeting held on today - Interim Dividend', 'Board Meeting');
await filing(399, 'NSE', 0, 'Outcome of Board Meeting held on today - Interim Dividend', 'Board Meeting');
await article(380, 'src_demo_wire', 'Asterion Industries board approves interim dividend');
await article(370, 'src_demo_desk1', 'Asterion Industries board approves interim dividend of Rs 4');
await filing(200, 'BSE', 2, 'Disclosure of creation of pledge by promoter group', 'Insider Trading / SAST');
await article(150, 'src_demo_desk2', 'Sensex and Nifty open higher; banking stocks lead');
await filing(95, 'BSE', 1, 'Disclosure under Regulation 30 - Receipt of Letter of Award', 'Company Update');
await article(80, 'src_demo_wire', 'Kestrel Power wins Rs 900 crore transmission order');
await article(60, 'src_demo_desk1', 'Kestrel Power secures Rs 900 crore transmission order');
await article(40, 'src_demo_desk3', 'Kestrel Power bags Rs 900 crore transmission order');
await filing(25, 'BSE', 3, 'Board approves capital expenditure plan', 'Board Meeting');
await article(12, 'src_demo_desk2', 'Orion Cables board approves Rs 250 crore capex plan');
await article(6, 'src_demo_desk3', 'Nimbus Infra Projects shares in focus after fund raising plan');

const today = new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10);
await ensureCalendar(db, new Date(now - 30 * 86_400_000 + 5.5 * 3600_000).toISOString().slice(0, 10), today);
const r = await drainPipeline(db, await buildPipelineContext(db, new Date()), { workerId: 'seed-demo' });
console.log(`demo data: ${COMPANIES.length} companies, ${n} items → processed=${r.processed} created=${r.created} joined=${r.joined}`);
await db.end();
