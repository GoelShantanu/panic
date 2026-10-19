import pg from 'pg';
import { addRssSource } from '@stockpanic/db';
import { conditionalGet } from '../ingestion/http.ts';
import { MONEYCONTROL_MARKETS_URL, MONEYCONTROL_MAX_ITEMS, moneycontrolMarketEntries } from '../ingestion/moneycontrol.ts';
import { toCandidates } from '../ingestion/rss.ts';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length && args[0] !== '--activate')) throw new Error('usage: moneycontrol.ts [--activate]');

const response = await conditionalGet(MONEYCONTROL_MARKETS_URL, {
  etag: null,
  lastModified: null,
  headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
});
if (response.status !== 'ok') throw new Error(`Moneycontrol check failed: ${response.status === 'error' ? response.message : response.status}`);

const feed = moneycontrolMarketEntries(response.body, MONEYCONTROL_MARKETS_URL, new Date());
const candidates = toCandidates(feed.entries, 'markets').candidates;
const kept = candidates.filter(c => c.relevance?.decision === 'keep').slice(0, MONEYCONTROL_MAX_ITEMS);
if (!kept.length) throw new Error('No recent eligible Moneycontrol articles; source configuration was not changed');

console.log(JSON.stringify({
  source: 'Moneycontrol Markets',
  recentItems: candidates.length,
  selectedItems: kept.length,
  importLimit: MONEYCONTROL_MAX_ITEMS,
  latestFeedPublication: feed.latestPublishedAt,
  sample: kept.slice(0, 3).map(c => ({ headline: c.headline, excerpt: c.excerpt, url: c.url })),
  activated: false,
}, null, 2));

if (args[0] === '--activate') {
  if (!process.env['DATABASE_URL']) throw new Error('DATABASE_URL is required');
  const db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
  await db.connect();
  try {
    await db.query('BEGIN');
    const pausedSources = ['src_mc_business', 'src_mc_latest', 'src_mc_marketreports', 'src_mc_google_news'];
    const existing = (await db.query("SELECT adapter FROM source WHERE source_id='src_mc_markets' FOR UPDATE")).rows[0];
    if (!existing) {
      await addRssSource(db, {
        sourceId: 'src_mc_markets',
        name: 'Moneycontrol Markets',
        tier: 3,
        articleScope: 'markets',
        url: MONEYCONTROL_MARKETS_URL,
        accessBasis: 'Direct Moneycontrol Markets web section (canonical URLs, full editorial blurbs)',
        excerptAllowed: true,
      });
    }
    const cadence = Object.fromEntries(['pre_open', 'open', 'closed', 'holiday', 'special', 'halted'].map(s => [s, { poll_s: 300, expect: true }]));
    await db.query(
      `UPDATE source SET name='Moneycontrol Markets', enabled=true, excerpt_allowed=true,
        article_scope='markets', cadence=$1, adapter=$2 WHERE source_id='src_mc_markets'`,
      [cadence, { type: 'rss', url: MONEYCONTROL_MARKETS_URL, format: 'moneycontrol_markets' }],
    );
    await db.query('UPDATE source SET enabled=false WHERE source_id = ANY($1::text[]) AND enabled', [pausedSources]);
    await db.query(
      `UPDATE source_fetch_state SET etag=NULL, last_modified=NULL, next_fetch_at=now(),
        latest_published_at=NULL, publication_observed_at=NULL WHERE source_id='src_mc_markets'`,
    );
    await db.query(
      `INSERT INTO audit_log(actor_type, action, entity_type, entity_id, after)
        VALUES ('system', 'source.direct_activated', 'source', 'src_mc_markets', $1)`,
      [{
        reason: 'Direct Moneycontrol Markets HTML section adapter with canonical URLs and editorial excerpts',
        paused_sources: pausedSources,
        verified_recent_items: candidates.length,
        import_limit: MONEYCONTROL_MAX_ITEMS,
        selected_items: kept.length,
      }],
    );
    await db.query('COMMIT');
    console.log('Activated Moneycontrol Markets (src_mc_markets); Google News fallback and legacy feeds paused.');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    await db.end();
  }
}
