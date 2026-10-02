import pg from 'pg';
import { migrate } from '../migrate.ts';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const ran = await migrate(client);
  console.log(ran.length ? `applied: ${ran.join(', ')}` : 'up to date');
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await client.end();
}
