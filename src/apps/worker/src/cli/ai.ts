import { hostname } from 'node:os';
import pg from 'pg';
import { aiSettings } from '@stockpanic/db';
import { mailerFromEnv } from '@stockpanic/mail';
import { AnthropicAiClient } from '../ai/client.ts';
import { HttpDocumentFetcher } from '../ai/documents.ts';
import { drainAi } from '../ai/runner.ts';

// Needs Anthropic API credentials (ANTHROPIC_API_KEY, or an `ant auth login` profile) and the
// `ai_enabled` setting on. OPS_EMAIL receives spend and withhold-rate alerts.
const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}
const once = process.argv.includes('--once');
const db = new pg.Client({ connectionString: url });
await db.connect();
let stopping = false;
process.on('SIGINT', () => (stopping = true));
process.on('SIGTERM', () => (stopping = true));

try {
  const settings = await aiSettings(db);
  if (!settings.enabled) console.log('ai_enabled is off: queued jobs complete without calling the model');
  const deps = {
    client: new AnthropicAiClient(settings.model),
    documents: new HttpDocumentFetcher(),
    mailer: process.env['OPS_EMAIL'] ? mailerFromEnv(process.env) : null,
    opsEmail: process.env['OPS_EMAIL'] ?? null,
    log: (line: string) => console.log(line),
  };
  do {
    const r = await drainAi(db, deps, { workerId: `${hostname()}:${process.pid}` });
    if (Object.keys(r.counts).length) console.log(Object.entries(r.counts).map(([k, v]) => `${k}=${v}`).join(' '));
    for (const e of r.errors) console.error(e);
    if (!once && !stopping) await new Promise((res) => setTimeout(res, 2_000));
  } while (!once && !stopping);
} finally {
  await db.end();
}
