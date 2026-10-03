import pg from 'pg';
import { grantRole, setSettingFromCli } from '@stockpanic/db';

// Usage:
//   node admin.ts grant-role <username> <user|operator|admin>
//   node admin.ts set-setting <key> <json value>        e.g. set-setting ai_enabled true
const url = process.env['DATABASE_URL'];
const [command, a, b] = process.argv.slice(2);
const usage = 'usage: admin.ts grant-role <username> <user|operator|admin> | set-setting <key> <json>';
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}
let value: unknown;
if (command === 'set-setting') {
  try {
    value = JSON.parse(b ?? '');
  } catch {
    console.error(`${usage}\n<json> must be valid JSON (strings need quotes)`);
    process.exit(2);
  }
}
if (!((command === 'grant-role' && a && (b === 'user' || b === 'operator' || b === 'admin')) || (command === 'set-setting' && a))) {
  console.error(usage);
  process.exit(2);
}
const db = new pg.Client({ connectionString: url });
await db.connect();
try {
  if (command === 'grant-role') {
    const r = await grantRole(db, a!, b as 'user' | 'operator' | 'admin', new Date());
    if (r === 'granted') console.log(`${a} is now ${b}`);
    else {
      console.error(r === 'unknown_user' ? `no user named ${a}` : `${a} must enrol an authenticator app first (POST /v1/me/totp/enrol, then /confirm)`);
      process.exitCode = 1;
    }
  } else if (await setSettingFromCli(db, a!, value, new Date())) console.log(`${a} = ${JSON.stringify(value)}`);
  else {
    console.error(`no setting named ${a}`);
    process.exitCode = 1;
  }
} finally {
  await db.end();
}
