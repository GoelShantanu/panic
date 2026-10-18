import pg from 'pg';
import { addRssSource } from '@stockpanic/db';
import { conditionalGet } from '../ingestion/http.ts';
import { parseFeed, toCandidates } from '../ingestion/rss.ts';
import { ZEE_BUSINESS_FEED, ZEE_BUSINESS_MAX_ITEMS, zeeBusinessEntries } from '../ingestion/zee-business.ts';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length && args[0] !== '--activate')) throw new Error('usage: zee-business.ts [--activate]');
const response = await conditionalGet(ZEE_BUSINESS_FEED, {
  etag: null, lastModified: null, headers: { 'user-agent': 'BazaarPanic RSS reader (+https://bazaarpanic.com/)' },
});
if (response.status !== 'ok') throw new Error(`Zee Business check failed: ${response.status === 'error' ? response.message : response.status}`);
const feed = zeeBusinessEntries(parseFeed(response.body), ZEE_BUSINESS_FEED, new Date());
const kept = toCandidates(feed.entries, 'markets').candidates.filter(c => c.relevance?.decision === 'keep')
  .sort((a,b) => b.publishedAt!.getTime() - a.publishedAt!.getTime()).slice(0,ZEE_BUSINESS_MAX_ITEMS);
if (!kept.length) throw new Error('No recent eligible Zee Business articles; source configuration was not changed');
console.log(JSON.stringify({ source: 'Zee Business Markets', selectedItems: kept.length, importLimit: ZEE_BUSINESS_MAX_ITEMS,
  latestFeedPublication: feed.latestPublishedAt, sample: kept.slice(0,3).map(c => c.headline), activated: false }));
if (args[0] === '--activate') {
  if (!process.env['DATABASE_URL']) throw new Error('DATABASE_URL is required');
  const db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
  await db.connect();
  try {
    await db.query('BEGIN');
    const existing = (await db.query("SELECT adapter,kind FROM source WHERE source_id='src_zee_markets' FOR UPDATE")).rows[0];
    if (!existing) await addRssSource(db, {
      sourceId: 'src_zee_markets', name: 'Zee Business Markets', tier: 3, articleScope: 'markets', url: ZEE_BUSINESS_FEED,
      accessBasis: 'Public publisher RSS, filtered to market-news/stocks/IPO routes; headlines only. Terms reviewed: https://www.zeebiz.com/terms-conditions (D-087; no republication permission asserted)',
    });
    else if (existing.kind !== 'article' || existing.adapter.url !== ZEE_BUSINESS_FEED || existing.adapter.format !== 'zee_business_markets') {
      throw new Error('Existing Zee Business source has unexpected configuration');
    }
    const cadence = Object.fromEntries(['pre_open','open','closed','holiday','special','halted'].map(s => [s,{poll_s:300,expect:true}]));
    await db.query(`UPDATE source SET enabled=true,excerpt_allowed=false,article_scope='markets',cadence=$1,adapter=$2
      WHERE source_id='src_zee_markets'`, [cadence,{type:'rss',url:ZEE_BUSINESS_FEED,format:'zee_business_markets'}]);
    await db.query("UPDATE source_fetch_state SET etag=NULL,last_modified=NULL,next_fetch_at=now() WHERE source_id='src_zee_markets'");
    await db.query(`INSERT INTO audit_log(actor_type,action,entity_type,entity_id,after)
      VALUES ('system','source.zee_business_activated','source','src_zee_markets',$1)`,
      [{reason:'D-087: filtered public Zee Business RSS',import_limit:ZEE_BUSINESS_MAX_ITEMS,selected_items:kept.length,latest_published_at:feed.latestPublishedAt}]);
    await db.query('COMMIT');
    console.log('Activated Zee Business Markets; existing sources and historical articles retained.');
  } catch (err) { await db.query('ROLLBACK'); throw err; }
  finally { await db.end(); }
}
