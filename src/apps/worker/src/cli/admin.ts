import pg from 'pg';
import { grantRole } from '@stockpanic/db';

// Usage: node admin.ts grant-role <username> <user|operator|admin>
const url = process.env['DATABASE_URL'];
const [command, username, role] = process.argv.slice(2);
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}
if (command !== 'grant-role' || !username || (role !== 'user' && role !== 'operator' && role !== 'admin')) {
  console.error('usage: admin.ts grant-role <username> <user|operator|admin>');
  process.exit(2);
}
const db = new pg.Client({ connectionString: url });
await db.connect();
try {
  const r = await grantRole(db, username, role, new Date());
  if (r === 'granted') console.log(`${username} is now ${role}`);
  else {
    console.error(r === 'unknown_user' ? `no user named ${username}` : `${username} must enrol an authenticator app first (POST /v1/me/totp/enrol, then /confirm)`);
    process.exitCode = 1;
  }
} finally {
  await db.end();
}
