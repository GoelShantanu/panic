import pg from 'pg';
import { startLiveServer } from '../live.ts';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}
const port = Number(process.env['PORT'] ?? 3001);

const pool = new pg.Pool({ connectionString: url, max: 5 });
const live = await startLiveServer({ pool, listenConnectionString: url }, port);
console.log(`live channel listening on :${live.port}/v1/live`);

const shutdown = async () => {
  await live.close();
  await pool.end();
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
