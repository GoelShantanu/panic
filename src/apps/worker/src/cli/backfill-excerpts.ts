import pg from 'pg';
import { cleanExcerpt } from '@stockpanic/core';
import { conditionalGet } from '../ingestion/http.ts';
import { parseFeed } from '../ingestion/rss.ts';

const url = process.env['DATABASE_URL'] || 'postgres://postgres:stockpanic_dev_only@127.0.0.1:5432/stockpanic';
const db = new pg.Client({ connectionString: url });
await db.connect();

console.log('Fetching enabled RSS sources...');
const { rows: sources } = await db.query<{ source_id: string; name: string; url: string }>(`
  SELECT source_id, name, adapter->>'url' AS url
    FROM source
   WHERE enabled AND kind = 'article'
`);

let totalUpdated = 0;

for (const s of sources) {
  try {
    console.log(`Fetching ${s.name} (${s.url})...`);
    const res = await conditionalGet(s.url, { etag: null, lastModified: null, timeoutMs: 15000 });
    if (res.status !== 'ok') {
      console.log(`  Skip: status ${res.status}`);
      continue;
    }
    const entries = parseFeed(res.body);
    console.log(`  Got ${entries.length} entries from feed`);
    let sourceUpdated = 0;
    for (const e of entries) {
      if (!e.description || !e.title) continue;
      const excerpt = cleanExcerpt(e.description, e.title);
      if (!excerpt) continue;

      const r = await db.query(
        `UPDATE item
            SET excerpt = $1
          WHERE source_id = $2
            AND (url = $3 OR headline ILIKE $4)
            AND excerpt IS NULL`,
        [excerpt, s.source_id, e.link, e.title.trim()],
      );
      if (r.rowCount && r.rowCount > 0) {
        sourceUpdated += r.rowCount;
        await db.query(
          `UPDATE article_relevance_candidate
              SET excerpt = $1
            WHERE source_id = $2
              AND (url = $3 OR headline ILIKE $4)
              AND excerpt IS NULL`,
          [excerpt, s.source_id, e.link, e.title.trim()],
        );
      }
    }
    console.log(`  Updated ${sourceUpdated} items with excerpts`);
    totalUpdated += sourceUpdated;
  } catch (err: any) {
    console.error(`  Error processing ${s.name}: ${err.message}`);
  }
}

console.log(`\nTotal items updated with ~100-word excerpts: ${totalUpdated}`);

const { rows: status } = await db.query(`
  SELECT count(*) as total, count(excerpt) as with_excerpt
    FROM item
   WHERE kind = 'article'
`);
console.log('Article items in DB:', status[0]);

await db.end();
