import pg from 'pg';
import { addRssSource } from '@stockpanic/db';
import { conditionalGet } from '../ingestion/http.ts';
import { MONEYCONTROL_GOOGLE_FEED, MONEYCONTROL_GOOGLE_MAX_ITEMS, moneycontrolGoogleEntries } from '../ingestion/google-news.ts';
import { parseFeed, toCandidates } from '../ingestion/rss.ts';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length && args[0] !== '--activate')) throw new Error('usage: moneycontrol.ts [--activate]');
const response = await conditionalGet(MONEYCONTROL_GOOGLE_FEED, {
  etag: null, lastModified: null, headers: { 'user-agent': 'Bazaar Updates RSS reader (+https://bazaarnews.duckdns.org/)' },
});
if (response.status !== 'ok') throw new Error(`Moneycontrol fallback check failed: ${response.status === 'error' ? response.message : response.status}`);
const feed = moneycontrolGoogleEntries(parseFeed(response.body), MONEYCONTROL_GOOGLE_FEED, new Date());
const candidates = toCandidates(feed.entries, 'business').candidates;
const kept = candidates.filter(c => c.relevance?.decision === 'keep').sort((a,b) => b.publishedAt!.getTime()-a.publishedAt!.getTime()).slice(0,MONEYCONTROL_GOOGLE_MAX_ITEMS);
if (!kept.length) throw new Error('No recent eligible Moneycontrol articles; source configuration was not changed');
console.log(JSON.stringify({ source: 'Moneycontrol via Google News', recentItems: candidates.length, selectedItems: kept.length, importLimit: MONEYCONTROL_GOOGLE_MAX_ITEMS,
  latestFeedPublication: feed.latestPublishedAt, sample: kept.slice(0,3).map(c => c.headline), activated: false }));
if (args[0] === '--activate') {
  if (!process.env['DATABASE_URL']) throw new Error('DATABASE_URL is required');
  const db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
  await db.connect();
  try {
    await db.query('BEGIN');
    const legacy = ['src_mc_business', 'src_mc_latest', 'src_mc_marketreports'];
    const previous = (await db.query('SELECT source_id,kind FROM source WHERE source_id = ANY($1::text[]) FOR UPDATE', [legacy])).rows;
    if (previous.length !== 3 || previous.some(s => s.kind !== 'article')) throw new Error('Expected three existing Moneycontrol article sources');
    const existing = (await db.query("SELECT adapter FROM source WHERE source_id='src_mc_google_news' FOR UPDATE")).rows[0];
    if (!existing) await addRssSource(db, {
      sourceId: 'src_mc_google_news', name: 'Moneycontrol via Google News', tier: 3, articleScope: 'business',
      url: MONEYCONTROL_GOOGLE_FEED, accessBasis: 'Public Google News RSS search of Moneycontrol business news; indirect, headlines only (D-086)',
    });
    else if (existing.adapter.url !== MONEYCONTROL_GOOGLE_FEED || existing.adapter.format !== 'moneycontrol_google_news') throw new Error('Existing fallback source has unexpected configuration');
    const cadence = Object.fromEntries(['pre_open','open','closed','holiday','special','halted'].map(s => [s, { poll_s: 300, expect: true }]));
    await db.query(`UPDATE source SET name='Moneycontrol via Google News', enabled=true, excerpt_allowed=false,
      article_scope='business',cadence=$1,adapter=$2 WHERE source_id='src_mc_google_news'`,
      [cadence, { type: 'rss', url: MONEYCONTROL_GOOGLE_FEED, format: 'moneycontrol_google_news' }]);
    await db.query('UPDATE source SET enabled=false WHERE source_id = ANY($1::text[]) AND enabled', [legacy]);
    await db.query(`UPDATE source_fetch_state SET etag=NULL,last_modified=NULL,next_fetch_at=now(),
      latest_published_at=NULL,publication_observed_at=NULL WHERE source_id='src_mc_google_news'`);
    await db.query(`INSERT INTO audit_log(actor_type,action,entity_type,entity_id,after)
      VALUES ('system','source.fallback_activated','source','src_mc_google_news',$1)`,
      [{ reason: 'D-086: frozen April 2024 direct feeds replaced by explicitly attributed public Google News fallback',
        paused_sources: legacy, verified_recent_items: candidates.length, import_limit: MONEYCONTROL_GOOGLE_MAX_ITEMS,
        selected_items: kept.length, latest_published_at: feed.latestPublishedAt }]);
    await db.query('COMMIT');
    console.log('Activated Moneycontrol via Google News; three frozen feeds paused, historical articles retained.');
  } catch (err) { await db.query('ROLLBACK'); throw err; }
  finally { await db.end(); }
}
