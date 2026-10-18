import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { addRssSource,listEnabledSources,migrate } from '@stockpanic/db';
import { fetchSourceOnce } from './run-source.ts';
import { ZEE_BUSINESS_FEED } from './zee-business.ts';

const adminUrl=process.env['TEST_DATABASE_URL'];
describe.skipIf(!adminUrl)('Zee Business ingestion (PostgreSQL)',()=>{
  const name=`sp_zee_${randomBytes(4).toString('hex')}`;
  let admin:pg.Client; let db:pg.Client;
  const now=new Date(Math.floor(Date.now()/1000)*1000);
  const item=(id:number,route='market-news',title=`Example ${id} shares rise after Q2 results`,date=new Date(now.getTime()-id*60000))=>
    `<item><title>${title}</title><link>https://www.zeebiz.com/${route}/news-example-${id}-404050</link><guid>zee-${id}</guid><pubDate>${date.toUTCString()}</pubDate><description>Must not be retained.</description></item>`;
  const xml=`<rss version="2.0"><channel>${Array.from({length:16},(_,i)=>item(i+1)).reverse().join('')}
    ${item(30,'automobile','New car launch')}${item(31,'trending/entertainment','Film premiere')}
    ${item(32,'market-news','New office opens in Mumbai')}${item(33,'market-news','Future shares results',new Date(now.getTime()+60000))}</channel></rss>`;
  beforeAll(async()=>{
    admin=new pg.Client({connectionString:adminUrl});await admin.connect();await admin.query(`CREATE DATABASE ${name}`);
    const url=new URL(adminUrl!);url.pathname=`/${name}`;db=new pg.Client({connectionString:url.toString()});await db.connect();await migrate(db);
    await addRssSource(db,{sourceId:'src_zee_markets',name:'Zee Business Markets',tier:3,articleScope:'markets',url:ZEE_BUSINESS_FEED,accessBasis:'Disposable test',excerptAllowed:true});
    await db.query("UPDATE source SET adapter=adapter || '{\"format\":\"zee_business_markets\"}'::jsonb WHERE source_id='src_zee_markets'");
  });
  afterAll(async()=>{await db?.end();await admin?.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);await admin?.end();});
  it('imports only the newest ten, never stores excerpts or unrelated/review items, and replays without backfilling',async()=>{
    const source=(await listEnabledSources(db)).find(s=>s.sourceId==='src_zee_markets')!;
    const deps={jitter:()=>1,fetchImpl:async(input:string,init?:RequestInit)=>{
      expect(input).toBe(ZEE_BUSINESS_FEED);
      expect(new Headers(init?.headers).get('user-agent')).toContain('BazaarPanic RSS reader');
      return new Response(xml,{headers:{'content-type':'application/rss+xml',etag:'"zee-v1"'}});
    }};
    expect(await fetchSourceOnce(db,source,'open',now,deps)).toMatchObject({inserted:10,duplicates:0,heldForReview:0});
    const saved=(await db.query("SELECT dedup_key,excerpt FROM item WHERE source_id='src_zee_markets'")).rows;
    expect(saved.map(r=>r.dedup_key).sort()).toEqual(Array.from({length:10},(_,i)=>`guid:zee-${i+1}`).sort());
    expect(saved.every(r=>r.excerpt===null)).toBe(true);
    expect((await db.query("SELECT count(*)::int n FROM article_relevance_candidate WHERE source_id='src_zee_markets'")).rows[0].n).toBe(10);
    expect((await db.query("SELECT count(*)::int n FROM job WHERE queue='pipeline'")).rows[0].n).toBe(10);
    expect(await fetchSourceOnce(db,source,'open',now,deps)).toMatchObject({inserted:0,duplicates:10,heldForReview:0});
    expect((await db.query("SELECT count(*)::int n FROM item WHERE source_id='src_zee_markets'")).rows[0].n).toBe(10);
    expect((await db.query("SELECT latest_published_at FROM source_fetch_state WHERE source_id='src_zee_markets'")).rows[0].latest_published_at)
      .toEqual(new Date(now.getTime()-60000));
  });
  it('records an invalid adapter URL as a source failure without inserting articles',async()=>{
    const source=(await listEnabledSources(db)).find(s=>s.sourceId==='src_zee_markets')!;
    source.adapter['url']='https://example.org/latest.xml';
    const result=await fetchSourceOnce(db,source,'open',now,{jitter:()=>1,fetchImpl:async()=>new Response(xml)});
    expect(result).toMatchObject({outcome:'error',inserted:0,error:'unexpected Zee Business feed URL'});
  });
});
