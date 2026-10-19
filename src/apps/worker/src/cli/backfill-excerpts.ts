import pg from 'pg';
import { canonicalUrl, cleanExcerpt, normaliseHeadline } from '@stockpanic/core';
import { conditionalGet } from '../ingestion/http.ts';
import { parseFeed } from '../ingestion/rss.ts';

const url = process.env['DATABASE_URL'] || 'postgres://postgres:stockpanic_dev_only@127.0.0.1:5432/stockpanic';
const db = new pg.Client({ connectionString: url });
await db.connect();

console.log('Fetching enabled RSS sources...');
const { rows: sources } = await db.query<{ source_id: string; name: string; url: string; excerpt_allowed: boolean }>(`
  SELECT source_id, name, adapter->>'url' AS url, excerpt_allowed
    FROM source
   WHERE enabled AND kind = 'article'
`);

let totalUpdated = 0;

for (const s of sources) {
  try {
    if (!s.url) continue;

    // Enable excerpts so PostgreSQL trigger allows item.excerpt updates and read.ts serves excerpts
    if (!s.excerpt_allowed) {
      await db.query(`UPDATE source SET excerpt_allowed = true WHERE source_id = $1`, [s.source_id]);
      console.log(`  Enabled excerpt permission for ${s.name} (${s.source_id})`);
    }

    console.log(`Fetching ${s.name} (${s.url})...`);
    const res = await conditionalGet(s.url, {
      etag: null,
      lastModified: null,
      timeoutMs: 15000,
      headers: { 'user-agent': 'BazaarPanic RSS reader (+https://bazaarpanic.com/)' },
    });
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

      const cUrl = e.link ? canonicalUrl(e.link) : null;
      const rawUrl = e.link ? e.link.trim() : null;
      const normHeadline = normaliseHeadline(e.title);
      const rawHeadline = e.title.trim();
      const dedupKey = e.guid ? `guid:${e.guid.trim()}` : (cUrl ? `url:${cUrl}` : null);

      const r = await db.query(
        `UPDATE item
            SET excerpt = $1
          WHERE source_id = $2
            AND (
              ($3::text IS NOT NULL AND dedup_key = $3)
              OR ($4::text IS NOT NULL AND url = $4)
              OR ($5::text IS NOT NULL AND url = $5)
              OR headline = $6
              OR headline ILIKE $7
            )
            AND excerpt IS NULL`,
        [excerpt, s.source_id, dedupKey, cUrl, rawUrl, normHeadline, rawHeadline],
      );
      if (r.rowCount && r.rowCount > 0) {
        sourceUpdated += r.rowCount;
        await db.query(
          `UPDATE article_relevance_candidate
              SET excerpt = $1
            WHERE source_id = $2
              AND (
                ($3::text IS NOT NULL AND dedup_key = $3)
                OR ($4::text IS NOT NULL AND url = $4)
                OR ($5::text IS NOT NULL AND url = $5)
                OR headline = $6
                OR headline ILIKE $7
              )
              AND excerpt IS NULL`,
          [excerpt, s.source_id, dedupKey, cUrl, rawUrl, normHeadline, rawHeadline],
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
