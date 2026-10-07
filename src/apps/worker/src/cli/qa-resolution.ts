import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { AliasIndex, normaliseForMatch, resolveArticle } from '@stockpanic/core';
import { loadAliasEntries } from '@stockpanic/db';

// Entity-resolution precision and recall on a labelled corpus (WORKFLOW §8 mandatory metric; D-049).
// Runs the same resolver the pipeline uses (AliasIndex over the registry valid on the date) against
// hand labels: <item id> TAB <NSE symbols, comma-separated>. Unlabelled items are expected to get no
// tags; with --labelled-only, only items listed in the file are scored (a sampled held-out set).
// Identical headlines (syndication across feeds) are counted once.
const USAGE = 'usage: qa-resolution.ts <gold.tsv> [--as-of YYYY-MM-DD] [--labelled-only] [--list]';

const url = process.env['DATABASE_URL'];
const [goldPath, ...flags] = process.argv.slice(2);
if (!url || !goldPath) {
  console.error(USAGE);
  process.exit(2);
}
const asOfAt = flags.indexOf('--as-of');
const asOf = asOfAt >= 0 ? flags[asOfAt + 1]! : new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

const gold = new Map<string, Set<string>>();
for (const line of (await readFile(goldPath, 'utf8')).split(/\r?\n/)) {
  const [id, codes] = line.split('\t');
  if (id && /^\d+$/.test(id)) gold.set(id, new Set((codes ?? '').split(',').map((c) => c.trim()).filter(Boolean)));
}

const db = new pg.Client({ connectionString: url });
await db.connect();
try {
  const index = new AliasIndex(await loadAliasEntries(db, asOf));
  const symbolOf = new Map((await db.query<{ isin: string; code: string }>(`SELECT isin::text, code FROM instrument_code WHERE exchange = 'NSE' AND valid @> $1::date`, [asOf])).rows.map((r) => [r.isin.trim(), r.code]));
  const items = (await db.query<{ id: string; headline: string; excerpt: string | null }>('SELECT id::text, headline, excerpt FROM item ORDER BY id')).rows;
  const seen = new Set<string>();
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let headlines = 0;
  let unresolvedMentions = 0;
  const errors: string[] = [];
  const labelledOnly = flags.includes('--labelled-only');
  for (const it of items) {
    if (labelledOnly && !gold.has(it.id)) continue;
    const key = normaliseForMatch(it.headline);
    if (seen.has(key)) continue;
    seen.add(key);
    headlines++;
    const r = resolveArticle(index, it.headline.replace(/&amp;/g, '&'), it.excerpt);
    unresolvedMentions += r.unresolved.length;
    const got = new Set(r.isins.map((i) => symbolOf.get(i) ?? i));
    const want = gold.get(it.id) ?? new Set<string>();
    for (const g of got) want.has(g) ? tp++ : (fp++, errors.push(`FP ${g.padEnd(12)} ${it.headline}`));
    for (const w of want) if (!got.has(w)) (fn++, errors.push(`FN ${w.padEnd(12)} ${it.headline}`));
  }
  const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}%`);
  console.log(`registry as of ${asOf}; ${headlines} unique headlines (${items.length} items); ${[...gold.values()].filter((g) => g.size > 0).length} labelled with companies`);
  console.log(`tags: ${tp + fp} (correct ${tp}, wrong ${fp}); labelled company mentions: ${tp + fn} (found ${tp}, missed ${fn}); unresolved mentions shown: ${unresolvedMentions}`);
  console.log(`precision ${pct(tp, tp + fp)}   recall ${pct(tp, tp + fn)}`);
  if (flags.includes('--list')) for (const e of errors.sort()) console.log(e);
} finally {
  await db.end();
}
