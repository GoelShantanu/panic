import pg from 'pg';
import { startIngestWorker } from './ingest.ts';
import { startPipelineWorker } from './pipeline.ts';
import { startAccountWorker } from './account.ts';
import { startAlertsWorker } from './alerts.ts';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}
const authSecret = process.env['AUTH_SECRET'];
if (!authSecret || authSecret.length < 32) {
  console.error('AUTH_SECRET must be set to at least 32 characters');
  process.exit(2);
}

const once = process.argv.includes('--once');
const pool = new pg.Pool({ connectionString: url, max: 6 });

let stopping = false;
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down unified worker...');
  stopping = true;
});
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down unified worker...');
  stopping = true;
});

console.log('Unified worker running (ingest, pipeline, account, alerts)...');

try {
  await Promise.all([
    startIngestWorker(pool, { once, isStopping: () => stopping }),
    startPipelineWorker(pool, { once, isStopping: () => stopping }),
    startAccountWorker(pool, { once, isStopping: () => stopping }),
    startAlertsWorker(pool, { once, isStopping: () => stopping, authSecret }),
  ]);
} finally {
  await pool.end();
}
