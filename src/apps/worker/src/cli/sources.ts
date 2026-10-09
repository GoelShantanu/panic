import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { validateFilingsSourceConfig, validateSourceAccessReview } from '@stockpanic/core';

const [command,file]=process.argv.slice(2);
if(!['validate','register','record-access','audit'].includes(command??'')) throw new Error('usage: sources.ts validate|register <config.json> | record-access <review.json> | audit [--production]');
if(command==='register') throw new Error('This source integration has been retired; registration is unavailable.');
const raw=command==='audit'?null:JSON.parse(await readFile(file??'','utf8'));
const review=command==='record-access'?validateSourceAccessReview(raw):null;
const config=command==='audit'||review?null:validateFilingsSourceConfig(raw);
if(command==='validate') {console.log(JSON.stringify({valid:true,sourceId:config!.source_id,enabled:config!.enabled}));}
else {
  const url=process.env['DATABASE_URL'];
  if(!url) throw new Error('DATABASE_URL is required');
  const db=new pg.Client({connectionString:url});await db.connect();
  try {
    if(command==='record-access') {
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
      const issues=sources.filter(s=>s.kind==='article'&&s.enabled&&!s.access_reviewed).map(s=>`${s.source_id}: production-use approval not recorded`);
      console.log(JSON.stringify({sources,registry,masters,sourceReadinessChecksPassed:issues.length===0,issues},null,2));
      if(process.argv.includes('--production')&&issues.length) process.exitCode=1;
    }
  } finally {await db.end();}
}
