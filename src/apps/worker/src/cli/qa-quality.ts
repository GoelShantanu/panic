import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { AliasIndex, articleCandidateBands, classifyHeadline, classifyMarketRelevance, extractNumbers, headlineShingles, jaccard, normaliseForMatch, pairScore, resolveArticle } from '@stockpanic/core';
import type { AliasEntry, ArticleScope } from '@stockpanic/core';
import { loadAliasEntries } from '@stockpanic/db';

interface Article {
  id: string; headline: string; excerpt: string | null; url: string; source: string;
  scope: ArticleScope; at: string; firstSeen: string; story: string | null;
}
interface Snapshot {
  version: 1; capturedAt: string; since: string; asOf: string; seed: string;
  aliases: AliasEntry[]; symbols: Record<string, string>; mergeThreshold: number;
  items: Article[]; sample: string[]; pairs: [string, string][];
}
interface Gold {
  items: Record<string, { symbols: string[] | null; relevant: boolean; note?: string }>;
  pairs: Record<string, boolean | 'uncertain'>;
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const [command, directory, ...flags] = process.argv.slice(2);
if (!directory || !['capture', 'score'].includes(command ?? '')) throw new Error('usage: qa-quality.ts capture|score <directory> [--since ISO] [--n 150]');
const out = path.resolve(directory);
const option = (name: string, fallback: string) => {
  const i = flags.indexOf(name);
  return i < 0 ? fallback : flags[i + 1] ?? '';
};

if (command === 'capture') {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL required; capture is read-only');
  const since = option('--since', '2026-10-07T00:00:00+05:30');
  if (!Number.isFinite(Date.parse(since))) throw new Error('Invalid --since');
  const n = Number(option('--n', '150'));
  if (!Number.isInteger(n) || n < 1) throw new Error('Invalid --n');
  const asOf = new Date(Date.parse(since) + 5.5 * 3600_000).toISOString().slice(0, 10);
  const seed = 'quality-2026-10-08-v1';
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const rows = (await db.query<Article>(
      `SELECT i.id::text, i.headline, i.excerpt, i.url, s.name AS source, s.article_scope AS scope,
              coalesce(i.published_at,i.first_seen_at)::text AS at, i.first_seen_at::text AS "firstSeen", si.story_id::text AS story
         FROM item i JOIN source s USING(source_id) LEFT JOIN story_item si ON si.item_id=i.id
        WHERE i.kind='article' AND i.first_seen_at >= $1
        UNION ALL
       SELECT 'q'||c.id::text,c.headline,c.excerpt,c.url,s.name,c.source_scope,
              coalesce(c.published_at,c.created_at)::text,c.created_at::text,NULL
         FROM article_relevance_candidate c JOIN source s USING(source_id)
        WHERE c.item_id IS NULL AND c.created_at >= $1
        ORDER BY "firstSeen",id`, [since])).rows;
    const previous = new Set((await db.query<{ headline: string }>('SELECT headline FROM item WHERE first_seen_at < $1 UNION SELECT headline FROM article_relevance_candidate WHERE created_at < $1', [since])).rows.map(r => normaliseForMatch(r.headline)));
    const seen = new Set<string>();
    const items = rows.filter(r => { const key = normaliseForMatch(r.headline); if (previous.has(key) || seen.has(key)) return false; seen.add(key); return true; });
    const aliases = await loadAliasEntries(db, asOf);
    const symbols = Object.fromEntries((await db.query<{ isin: string; code: string }>("SELECT isin::text,code FROM instrument_code WHERE exchange='NSE' AND valid @> $1::date", [asOf])).rows.map(r => [r.isin.trim(), r.code]));
    const threshold = (await db.query<{ value: number }>("SELECT value FROM setting WHERE key='cluster_merge_threshold'")).rows[0]?.value;
    if (typeof threshold !== 'number') throw new Error('Merge threshold missing');
    // Sampling never uses company predictions, relevance decisions, or stored clusters.
    const sample = [...items].sort((a,b) => hash(seed+a.id).localeCompare(hash(seed+b.id))).slice(0,n).map(r => r.id);
    const shingles = new Map(items.map(r => [r.id, headlineShingles(r.headline)]));
    const possible: { ids: [string,string]; similarity: number }[] = [];
    for (let i=0;i<items.length;i++) for (let j=i+1;j<items.length;j++) {
      const a=items[i]!,b=items[j]!;
      if (Math.abs(Date.parse(a.at)-Date.parse(b.at)) > 48*3600_000) continue;
      const similarity=jaccard(shingles.get(a.id)!,shingles.get(b.id)!);
      if (similarity>0) possible.push({ids:[a.id,b.id],similarity});
    }
    // Deliberately enriched challenge set; pair metrics are not population estimates.
    possible.sort((a,b) => b.similarity-a.similarity || hash(seed+a.ids.join(':')).localeCompare(hash(seed+b.ids.join(':'))));
    const template = (p: typeof possible[number]) => p.ids.every(id => /Share Price Live Updates/i.test(items.find(i=>i.id===id)!.headline));
    const pairs=[...possible.filter(template).slice(0,20),...possible.filter(p=>!template(p)).slice(0,30)].map(p=>p.ids);
    const selected = new Set(pairs.map(p => p.join(':')));
    pairs.push(...possible.filter(p => !selected.has(p.ids.join(':'))&&!template(p)).sort((a,b) => hash(seed+a.ids.join(':')).localeCompare(hash(seed+b.ids.join(':')))).slice(0,10).map(p => p.ids));
    pairs.sort((a,b)=>hash(seed+a.join(':')).localeCompare(hash(seed+b.join(':'))));
    const snapshot: Snapshot = {version:1,capturedAt:new Date().toISOString(),since,asOf,seed,aliases,symbols,mergeThreshold:threshold,items,sample,pairs};
    await mkdir(out,{recursive:true});
    // Exclusive creation prevents overwriting labels or silently changing an evaluated corpus.
    await writeFile(path.join(out,'snapshot.json'),JSON.stringify(snapshot,null,2)+'\n',{flag:'wx'});
    const gold = { items:Object.fromEntries(sample.map(id => [id,{symbols:null,relevant:null}])),pairs:Object.fromEntries(pairs.map(p=>[p.join(':'),null])) };
    await writeFile(path.join(out,'gold.json'),JSON.stringify(gold,null,2)+'\n',{flag:'wx'});
    const blind = {items:items.filter(i=>sample.includes(i.id)).map(({story,...rest})=>rest),pairs:pairs.map(([a,b])=>({key:`${a}:${b}`,a:items.find(i=>i.id===a)!.headline,b:items.find(i=>i.id===b)!.headline}))};
    await writeFile(path.join(out,'blind.json'),JSON.stringify(blind,null,2)+'\n',{flag:'wx'});
    await db.query('COMMIT');
    console.log(JSON.stringify({items:items.length,sample:sample.length,pairs:pairs.length,out}));
  } finally { await db.end(); }
} else {
  const raw=await readFile(path.join(out,'snapshot.json'),'utf8');
  const snapshot=JSON.parse(raw) as Snapshot;
  const gold=JSON.parse(await readFile(path.join(out,'gold.json'),'utf8')) as Gold;
  const split=option('--split','all');
  if (!['all','calibration','validation'].includes(split)) throw new Error('Invalid --split');
  const half=Math.floor(snapshot.sample.length/2),pairHalf=Math.floor(snapshot.pairs.length/2);
  const sample=split==='calibration'?snapshot.sample.slice(0,half):split==='validation'?snapshot.sample.slice(half):snapshot.sample;
  const selectedPairs=split==='calibration'?snapshot.pairs.slice(0,pairHalf):split==='validation'?snapshot.pairs.slice(pairHalf):snapshot.pairs;
  const known=new Set(Object.values(snapshot.symbols));
  for (const id of sample) {
    const label=gold.items[id];
    if (!label || typeof label.relevant!=='boolean' || (label.symbols===null?!label.note:!Array.isArray(label.symbols)||label.symbols.some(s=>!known.has(s)))) throw new Error(`Missing/invalid gold for ${id}; use only registry symbols; uncertain tags require a note`);
    if (label.symbols && new Set(label.symbols).size!==label.symbols.length) throw new Error(`Duplicate gold symbol for ${id}`);
  }
  for (const p of selectedPairs) if (typeof gold.pairs[p.join(':')]!=='boolean'&&gold.pairs[p.join(':')]!=='uncertain') throw new Error(`Missing pair label ${p.join(':')}`);
  const aliasPath=option('--aliases','');
  const aliasRaw=aliasPath?await readFile(aliasPath,'utf8'):null;
  const extraAliases: AliasEntry[]=[];
  for (const line of aliasRaw?.split(/\r?\n/)??[]) {
    const [code,text,expectedIsin,...flags]=line.split(',').map(s=>s.trim());
    if (!code || code.startsWith('#') || code==='symbol') continue;
    const isin=Object.entries(snapshot.symbols).find(([,s])=>s===code)?.[0];
    if (!text || !isin || isin!==expectedIsin) throw new Error(`Alias ISIN mismatch in frozen registry: ${code}`);
    extraAliases.push({isin,text,source:'alias',ambiguous:flags.includes('ambiguous'),commonWord:flags.includes('common_word')});
  }
  const aliases=new AliasIndex([...snapshot.aliases,...extraAliases]);
  const predictions=snapshot.items.map(item => {
    const resolved=resolveArticle(aliases,item.headline,item.excerpt);
    const isins=resolved.isins;
    const features={headline:item.headline,excerpt:item.excerpt,isins,shingles:headlineShingles(item.headline),numbers:extractNumbers(item.headline),eventTypes:classifyHeadline(item.headline),at:new Date(item.at)};
    return {item,symbols:isinSymbols(isins),headlineSymbols:isinSymbols(aliases.resolve(item.headline).isins),relevance:classifyMarketRelevance(item.headline,item.scope).decision,features};
  });
  function isinSymbols(isins: string[]) { return isins.map(i=>snapshot.symbols[i]??i); }
  let tp=0,fp=0,fn=0;
  const errors: unknown[]=[];
  const relevance={keepRelevant:0,keepOffTopic:0,reviewRelevant:0,reviewOffTopic:0,discardRelevant:0,discardOffTopic:0};
  for (const id of sample) {
    const p=predictions.find(p=>p.item.id===id)!;
    const symbols=gold.items[id]!.symbols;
    if (symbols!==null) {
      const want=new Set(symbols);
      for (const s of p.symbols) if(want.has(s)) tp++; else { fp++; errors.push({id,type:'false_tag',symbol:s}); }
      for (const s of want) if(!p.symbols.includes(s)) { fn++; errors.push({id,type:'missed_tag',symbol:s}); }
    }
    const relevant=gold.items[id]!.relevant;
    relevance[`${p.relevance}${relevant?'Relevant':'OffTopic'}`]++;
    if ((p.relevance==='keep'&&!relevant)||(p.relevance==='discard'&&relevant)) errors.push({id,type:'relevance',predicted:p.relevance,relevant});
  }
  const pairs=selectedPairs.map(([a,b])=>{
    const x=predictions.find(p=>p.item.id===a)!,y=predictions.find(p=>p.item.id===b)!;
    const score=pairScore(x.features,y.features);
    const candidate=x.features.isins.some(i=>y.features.isins.includes(i))||articleCandidateBands(x.item.headline).some(v=>articleCandidateBands(y.item.headline).includes(v));
    return {key:`${a}:${b}`,same:gold.pairs[`${a}:${b}`]!,score,candidate,modelMerge:candidate&&score!==null&&score>=snapshot.mergeThreshold,storedMerge:!!x.item.story&&x.item.story===y.item.story,published:!!x.item.story&&!!y.item.story};
  });
  const ratio=(n:number,d:number)=>d?n/d:null;
  const pairMetrics=(field:'modelMerge'|'storedMerge')=>{
    const eligible=field==='storedMerge'?pairs.filter(p=>p.published):pairs;
    const same=eligible.filter(p=>p.same===true),different=eligible.filter(p=>p.same===false);
    return {same:same.length,different:different.length,unpublishedExcluded:field==='storedMerge'?pairs.length-eligible.length:0,uncertain:eligible.filter(p=>p.same==='uncertain').length,falseMerges:different.filter(p=>p[field]).length,falseSplits:same.filter(p=>!p[field]).length};
  };
  const implementationSha256=Object.fromEntries(await Promise.all(['resolution.ts','relevance.ts','clustering.ts','text.ts'].map(async file=>[file,hash(await readFile(new URL(`../../../../packages/core/src/${file}`,import.meta.url),'utf8'))])));
  const report={split,snapshotSha256:hash(raw),goldSha256:hash(await readFile(path.join(out,'gold.json'),'utf8')),implementationSha256,articles:sample.length,tagUncertain:sample.filter(id=>gold.items[id]!.symbols===null),tags:{tp,fp,fn,precision:ratio(tp,tp+fp),recall:ratio(tp,tp+fn),zeroErrorOneSided95LowerBound:fp===0&&tp?Math.pow(0.05,1/tp):null},relevance,pairs:{model:pairMetrics('modelMerge'),stored:pairMetrics('storedMerge')},errors,pairDetails:pairs,itemPredictions:predictions.filter(p=>sample.includes(p.item.id)).map(p=>({id:p.item.id,symbols:p.symbols,headlineSymbols:p.headlineSymbols,relevance:p.relevance}))};
  Object.assign(report,{extraAliasSha256:aliasRaw?hash(aliasRaw):null});
  const reportFile=option('--report',`report-${split}.json`);
  if (!/^[a-zA-Z0-9_-]+\.json$/.test(reportFile)) throw new Error('Invalid --report filename');
  await writeFile(path.join(out,reportFile),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,pairDetails:undefined,itemPredictions:undefined},null,2));
  if (flags.includes('--require-tag-target') && (report.tags.precision===null || report.tags.precision<0.995 || report.tags.zeroErrorOneSided95LowerBound===null || report.tags.zeroErrorOneSided95LowerBound<0.995)) {
    console.error('Tagging target not demonstrated: requires 99.5% precision and a one-sided 95% lower confidence bound of at least 99.5%.');
    process.exitCode=1;
  }
}
