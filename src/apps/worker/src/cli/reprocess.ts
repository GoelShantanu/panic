import pg from 'pg';
import { writeFile } from 'node:fs/promises';
import { reanalyseStories } from '../pipeline/reprocess.ts';

const flags=process.argv.slice(2);
const option=(key:string, fallback:string)=>{const at=flags.indexOf(key);return at<0?fallback:flags[at+1]??'';};
const url=process.env['DATABASE_URL'];
const output=option('--output','');
if (!url || !output) throw new Error('usage: reprocess.ts --since ISO --output <new report.json> [--limit 1000] [--apply]; DATABASE_URL required');
await writeFile(output,'{"status":"started"}\n',{flag:'wx'});
const db=new pg.Client({connectionString:url});
await db.connect();
try {
  const report=await reanalyseStories(db,{since:new Date(option('--since','2026-10-07T00:00:00+05:30')),limit:Number(option('--limit','1000')),apply:flags.includes('--apply')});
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,changes:report.changes.length}));
} finally {await db.end();}
