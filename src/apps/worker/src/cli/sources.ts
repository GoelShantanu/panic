import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { validateFilingsSourceConfig, validateSourceAccessReview } from '@stockpanic/core';

const [command,file]=process.argv.slice(2);
if(!['validate','register','record-access','audit'].includes(command??'')) throw new Error('usage: sources.ts validate|register <config.json> | record-access <review.json> | audit [--production]');
const raw=command==='audit'?null:JSON.parse(await readFile(file??'','utf8'));
const review=command==='record-access'?validateSourceAccessReview(raw):null;
const config=command==='audit'||review?null:validateFilingsSourceConfig(raw);
if(command==='validate') {console.log(JSON.stringify({valid:true,sourceId:config!.source_id,enabled:config!.enabled}));}
else {
  const url=process.env['DATABASE_URL'];
  if(!url) throw new Error('DATABASE_URL is required');
  const db=new pg.Client({connectionString:url});await db.connect();
  try {
    if(command==='register') {
      const c=config!;
      for(const key of ['token_env','secret_env']) {
        const name=c.adapter[key];
        if(c.enabled&&typeof name==='string'&&!process.env[name]) throw new Error(`missing credential environment variable ${name}`);
      }
      const cadence=Object.fromEntries(['pre_open','open','special','halted','closed','holiday'].map(s=>[s,{poll_s:['open','pre_open','special','halted'].includes(s)?5:60,expect:true}]));
      await db.query(`INSERT INTO source (source_id,name,kind,tier,access_basis,access_checked_on,enabled,cadence,adapter)
        VALUES ($1,$2,'filing',1,$3,$4,$5,$6,$7)`,[c.source_id,c.name,c.access_basis,c.access_checked_on,c.enabled,cadence,c.adapter]);
      console.log(JSON.stringify({registered:c.source_id,enabled:c.enabled}));
    } else if(command==='record-access') {
      const r=review!;
      const result=await db.query(`UPDATE source SET access_basis=$2,access_checked_on=$3,excerpt_allowed=$4,
        adapter=jsonb_set(coalesce(adapter,'{}'::jsonb),'{access_reviewed}',$5::jsonb),enabled=enabled AND $6
        WHERE source_id=$1 RETURNING source_id,enabled`,[r.source_id,r.access_basis,r.access_checked_on,r.excerpt_allowed,JSON.stringify(r.access_approved),r.access_approved]);
      if(result.rowCount!==1) throw new Error('source not found; no access review recorded');
      console.log(JSON.stringify({recorded:r.source_id,approved:r.access_approved,enabled:result.rows[0].enabled}));
    } else {
      const sources=(await db.query(`SELECT source_id,kind,enabled,access_basis,access_checked_on::text,excerpt_allowed,
        adapter->>'type' adapter_type,coalesce((adapter->>'access_reviewed')::boolean,false) access_reviewed
        FROM source ORDER BY source_id`)).rows;
      const registry=(await db.query(`SELECT exchange,count(*)::int codes FROM instrument_code WHERE valid @> (now() AT TIME ZONE 'Asia/Kolkata')::date GROUP BY exchange`)).rows;
      const masters=(await db.query(`SELECT DISTINCT ON (entity_id) entity_id exchange, "after"->>'as_of' as_of,
        "after"->>'rows' rows,"after"->>'input_sha256' input_sha256,"after"->>'complete' complete
        FROM audit_log WHERE action='registry.master_applied' ORDER BY entity_id, id DESC`)).rows;
      const issues=sources.filter(s=>s.enabled&&!s.access_reviewed).map(s=>`${s.source_id}: production-use approval not recorded`);
      if(!sources.some(s=>s.enabled&&s.kind==='filing')) issues.push('No enabled authorised filings source');
      const bse=masters.find(m=>m.exchange==='BSE');
      const age=bse?Date.now()-Date.parse(bse.as_of+'T00:00:00+05:30'):Infinity;
      if(!bse||bse.complete!=='true'||!/^[a-f0-9]{64}$/.test(bse.input_sha256??'')||Number(bse.rows)!==registry.find(r=>r.exchange==='BSE')?.codes||age<0||age>48*3600_000) issues.push('Complete, fingerprinted, current BSE equity master has not been verified');
      console.log(JSON.stringify({sources,registry,masters,sourceReadinessChecksPassed:issues.length===0,issues},null,2));
      if(process.argv.includes('--production')&&issues.length) process.exitCode=1;
    }
  } finally {await db.end();}
}
