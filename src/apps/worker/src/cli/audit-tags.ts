import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { setSettingFromCli } from '@stockpanic/db';

// Weekly tagging audit (PRD-002 US-002.8 AC-5; D-051).
//   sample: a random sample of displayed article tags (resolver methods) from the last 7 days, written
//           as a TSV for an operator to mark: verdict y (right company) or n (wrong); "missed" lists
//           any NSE symbols the headline is about but did not get.
//   score:  precision and recall from the marked file. Below 99.5% precision, article tags are switched
//           off at once (article_tags_enabled = false); filing and operator tags stay.
const TARGET = 0.995;
const MIN_SAMPLE = 500;
const USAGE = `usage: audit-tags.ts sample <out.tsv> [--n 500] [--days 7]
       audit-tags.ts score <marked.tsv>`;

const url = process.env['DATABASE_URL'];
const [command, file, ...flags] = process.argv.slice(2);
if (!url || !file || !['sample', 'score'].includes(command ?? '')) {
  console.error(USAGE);
  process.exit(2);
}
const opt = (name: string, dflt: number) => {
  const i = flags.indexOf(name);
  return i >= 0 ? Number(flags[i + 1]) : dflt;
};

const db = new pg.Client({ connectionString: url });
await db.connect();
try {
  if (command === 'sample') {
    const { rows } = await db.query(
      `SELECT s.public_id AS story_id, d.isin::text, c.code AS symbol, p.headline
         FROM story_tag_display d
         JOIN story_tag t ON t.story_id = d.story_id AND t.isin = d.isin
         JOIN story s ON s.id = d.story_id AND s.merged_into IS NULL
         JOIN item p ON p.id = s.primary_item_id
         LEFT JOIN instrument_code c ON c.isin = d.isin AND c.exchange = 'NSE' AND c.valid @> (now() AT TIME ZONE 'Asia/Kolkata')::date
        WHERE d.method IN ('rule', 'model') AND t.story_first_seen_at > now() - make_interval(days => $1)
        ORDER BY random() LIMIT $2`,
      [opt('--days', 7), opt('--n', MIN_SAMPLE)],
    );
    const tsv = ['story_id\tisin\tsymbol\theadline\tverdict\tmissed', ...rows.map((r) => [r.story_id, r.isin.trim(), r.symbol ?? '', r.headline.replace(/\t/g, ' '), '', ''].join('\t'))];
    await writeFile(file, tsv.join('\n') + '\n');
    console.log(`${rows.length} displayed article tags written to ${file}${rows.length < MIN_SAMPLE ? ` (fewer than the ${MIN_SAMPLE} the audit requires)` : ''}`);
  } else {
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/).slice(1).filter((l) => l.trim() !== '');
    let right = 0;
    let wrong = 0;
    let missed = 0;
    const unmarked: number[] = [];
    lines.forEach((l, i) => {
      const [, , , , verdict = '', miss = ''] = l.split('\t');
      const v = verdict.trim().toLowerCase();
      if (v === 'y') right++;
      else if (v === 'n') wrong++;
      else unmarked.push(i + 2);
      missed += miss.split(',').filter((x) => x.trim()).length;
    });
    if (unmarked.length > 0) {
      console.error(`unmarked rows (verdict must be y or n): ${unmarked.slice(0, 20).join(', ')}${unmarked.length > 20 ? ' …' : ''}`);
      process.exit(2);
    }
    const n = right + wrong;
    const precision = n === 0 ? 1 : right / n;
    console.log(`audit: ${n} tags, ${wrong} wrong; precision ${(100 * precision).toFixed(2)}% (target ${100 * TARGET}%); recall on the sample ${(100 * right / Math.max(1, right + missed)).toFixed(1)}%`);
    if (n < MIN_SAMPLE) console.log(`note: ${n} tags is below the ${MIN_SAMPLE} the audit requires; the result is indicative`);
    await db.query(
      `INSERT INTO audit_log (actor_type, action, entity_type, entity_id, after) VALUES ('system', 'tags.audited', 'audit', to_char(now(), 'IYYY-"W"IW'), $1)`,
      [JSON.stringify({ tags: n, wrong, precision, missed })],
    );
    if (precision < TARGET) {
      await setSettingFromCli(db, 'article_tags_enabled', false, new Date());
      console.log('BELOW TARGET: article tags switched off (article_tags_enabled = false). Filing and operator tags stay. Fix the causes, re-audit, then turn them back on with admin.ts set-setting article_tags_enabled true.');
      process.exitCode = 1;
    }
  }
} finally {
  await db.end();
}
