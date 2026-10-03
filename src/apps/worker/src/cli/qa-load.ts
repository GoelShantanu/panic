import { randomBytes } from 'node:crypto';
import { request } from 'node:http';
import pg from 'pg';
import { newPublicId } from '@stockpanic/core';
import { createStory, emitStoryEvent, setStoryDerived } from '@stockpanic/db';

// Market-open load profile (WORKFLOW §8 exit; Research E5; D-049). Against a throwaway database:
// live-channel clients stay connected while fictional stories are created at a filings-burst rate
// and the stream API is read concurrently. Delivery latency (NFR-001.2) is measured from each
// story's first_seen_at, so listeners can run as separate processes and the load generator's own
// thread is not mistaken for the server. Never point this at a real database.
//   --role listen  --clients N --seconds S      open clients, report deliveries
//   --role drive   --stories N --rate R --api-rps Q   create stories and read the stream API
//   --role all     both in one process (small runs only)
const USAGE = 'usage: qa-load.ts --live http://host:port --api http://host:port [--role all|listen|drive] [--clients 1000] [--seconds 40] [--stories 300] [--rate 10] [--api-rps 40]';

const args = process.argv.slice(2);
const opt = (name: string, dflt?: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1]! : dflt;
};
const url = process.env['DATABASE_URL'];
const live = opt('--live');
const api = opt('--api');
const role = opt('--role', 'all')!;
if (!live || !api || !['all', 'listen', 'drive'].includes(role) || (role !== 'listen' && !url)) {
  console.error(USAGE);
  process.exit(2);
}
if (url && !/load/.test(url)) {
  console.error('refusing: DATABASE_URL must name a throwaway load-test database (contains "load")');
  process.exit(2);
}
const CLIENTS = Number(opt('--clients', '1000'));
const SECONDS = Number(opt('--seconds', '40'));
const STORIES = Number(opt('--stories', '300'));
const RATE = Number(opt('--rate', '10'));
const API_RPS = Number(opt('--api-rps', '40'));
const API_PATH = opt('--api-path', '/v1/stream')!;

const pct = (xs: number[], p: number) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
};
const max = (xs: number[]) => xs.reduce((a, b) => Math.max(a, b), 0);

// ---- listeners
const delivery: number[] = [];
let frames = 0;
let connected = 0;
let dropped = 0;
const sockets: { destroy(): void }[] = [];

function openClient(): Promise<void> {
  return new Promise((resolve) => {
    const req = request(`${live}/v1/live`, { headers: { accept: 'text/event-stream' }, agent: false }, (res) => {
      connected++;
      resolve();
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buf += chunk;
        let at: number;
        while ((at = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, at);
          buf = buf.slice(at + 2);
          if (!frame.includes('event: story.created')) continue;
          const m = /"first_seen_at":"([^"]+)"/.exec(frame);
          if (!m) continue;
          frames++;
          delivery.push(Date.now() - Date.parse(m[1]!));
        }
      });
      res.on('close', () => dropped++);
    });
    req.on('error', () => {
      dropped++;
      resolve();
    });
    req.end();
    sockets.push(req);
  });
}

async function listen(): Promise<void> {
  for (let i = 0; i < CLIENTS; i += 100) await Promise.all(Array.from({ length: Math.min(100, CLIENTS - i) }, openClient));
  console.log(`listener ${process.pid}: ${connected} connected`);
}

function reportListen(): void {
  console.log(`listener ${process.pid}: ${frames} story.created frames on ${connected} clients (${dropped} dropped); latency ms p50 ${pct(delivery, 50)}  p95 ${pct(delivery, 95)}  p99 ${pct(delivery, 99)}  max ${max(delivery)}`);
  console.log(`LISTEN_JSON ${JSON.stringify({ frames, connected, dropped, p50: pct(delivery, 50), p95: pct(delivery, 95), p99: pct(delivery, 99), max: max(delivery) })}`);
}

// ---- driver
const apiLatency: number[] = [];
let apiErrors = 0;
let apiShed = 0;
function apiTick(): void {
  const t0 = Date.now();
  const req = request(`${api}${API_PATH}`, { agent: false }, (res) => {
    res.resume();
    res.on('end', () => (res.statusCode === 200 ? apiLatency.push(Date.now() - t0) : res.statusCode === 503 ? apiShed++ : apiErrors++));
  });
  req.on('error', () => apiErrors++);
  req.end();
}

async function drive(): Promise<void> {
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  await db.query(`INSERT INTO source (source_id, name, kind, tier, cadence) VALUES ('src_qa_load', 'Load test (fictional)', 'filing', 1, '{}') ON CONFLICT DO NOTHING`);
  const apiTimer = setInterval(() => {
    for (let i = 0; i < API_RPS / 10; i++) apiTick();
  }, 100);
  const started = Date.now();
  for (let n = 0; n < STORIES; n++) {
    const wait = started + (n * 1000) / RATE - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const now = new Date();
    const item = await db.query(
      `INSERT INTO item (public_id, kind, source_id, dedup_key, headline, url, first_seen_at) VALUES ($1, 'article', 'src_qa_load', $2, $3, 'https://example.invalid/load', $4) RETURNING id`,
      [newPublicId('it'), randomBytes(6).toString('hex'), `Fictional load-test announcement ${n}`, now],
    );
    await db.query('BEGIN');
    const id = await createStory(db, String(item.rows[0].id), now);
    await setStoryDerived(db, id, { primaryItemId: String(item.rows[0].id), sourceCount: 1, eventTypes: ['other'], tags: [], unresolved: [] });
    await emitStoryEvent(db, 'story.created', id);
    await db.query('COMMIT');
  }
  const secs = (Date.now() - started) / 1000;
  await new Promise((r) => setTimeout(r, 2000));
  clearInterval(apiTimer);
  await db.end();
  console.log(`driver: ${STORIES} stories in ${secs.toFixed(1)} s (${(STORIES / secs).toFixed(1)}/s); stream API ${apiLatency.length} ok, ${apiShed} shed (503), ${apiErrors} errors; latency ms p50 ${pct(apiLatency, 50)}  p95 ${pct(apiLatency, 95)}  max ${max(apiLatency)}`);
}

if (role === 'listen') {
  await listen();
  await new Promise((r) => setTimeout(r, SECONDS * 1000));
  reportListen();
} else if (role === 'drive') {
  await drive();
} else {
  await listen();
  await drive();
  await new Promise((r) => setTimeout(r, 5000));
  reportListen();
}
for (const s of sockets) s.destroy();
process.exit(0);
