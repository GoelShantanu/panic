import pg from 'pg';
import { createApiServer } from '../server.ts';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}
const port = Number(process.env['PORT'] ?? 3000);

const pool = new pg.Pool({ connectionString: url, max: 10 });
const server = createApiServer(pool);
server.listen(port, () => console.log(`api listening on :${port}`));

const shutdown = () => server.close(() => void pool.end());
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
