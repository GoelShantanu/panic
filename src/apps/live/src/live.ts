// SSE live channel (ADR-005): broadcast identical events to every client; clients filter to
// their view. Replays from Last-Event-ID out of live_event (ADR-004); a gap older than the
// retained events gets a `resync` event so the client re-fetches (PRD-001 US-001.2 AC-4).

import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import pg from 'pg';
import { LIVE_CHANNEL, liveEventBounds, liveEventsAfter, loadStoryCards, storyIdByPublicId } from '@stockpanic/db';
import type { LiveEventRow } from '@stockpanic/db';

export interface LiveServerOptions {
  pool: pg.Pool;
  listenConnectionString: string;
  heartbeatMs?: number;
  replayLimit?: number;
  coalesceMs?: number;
}

export interface LiveServer {
  port: number;
  clientCount(): number;
  close(): Promise<void>;
}

interface Frame {
  id: bigint;
  text: string;
}

interface Client {
  res: ServerResponse;
  lastSent: bigint;
  ready: boolean;
  queue: Frame[];
}

const HEARTBEAT_MS = 15_000;
const REPLAY_LIMIT = 1_000;
// Events committed within this window go to each client in one write. Per-socket writes, not bytes,
// bound fan-out (QA load test, D-049); the frames and their order are unchanged.
const COALESCE_MS = 250;

async function toFrame(db: pg.ClientBase, row: LiveEventRow): Promise<Frame | null> {
  let data: Record<string, unknown>;
  if (row.type === 'story.created' || row.type === 'story.updated') {
    const publicId = row.payload['story_id'];
    const id = typeof publicId === 'string' ? await storyIdByPublicId(db, publicId) : null;
    const card = id ? (await loadStoryCards(db, [id])).get(id) : undefined;
    if (!card) return null;
    if (row.type === 'story.created') {
      data = { type: row.type, story: card };
    } else {
      const { story_id, ...changes } = card;
      data = { type: row.type, story_id, changes };
    }
  } else if (row.type === 'session.changed') {
    data = { type: row.type, session: row.payload };
  } else {
    data = { type: row.type, ...row.payload };
  }
  return { id: BigInt(row.id), text: `id: ${row.id}\nevent: ${row.type}\ndata: ${JSON.stringify(data)}\n\n` };
}

export async function startLiveServer(opts: LiveServerOptions, port = 0): Promise<LiveServer> {
  const clients = new Set<Client>();
  let lastBroadcast = BigInt((await withClient(opts.pool, (db) => liveEventBounds(db))).max ?? '0');
  let chain: Promise<void> = Promise.resolve();
  let listener: pg.Client | null = null;
  let closing = false;
  let pending: ReturnType<typeof setTimeout> | null = null;

  function send(client: Client, frame: Frame) {
    if (frame.id <= client.lastSent) return;
    client.res.write(frame.text);
    client.lastSent = frame.id;
  }

  // One write per client for a run of frames.
  function sendAll(client: Client, batch: Frame[]) {
    const fresh = batch.filter((f) => f.id > client.lastSent);
    if (fresh.length === 0) return;
    client.res.write(fresh.map((f) => f.text).join(''));
    client.lastSent = fresh[fresh.length - 1]!.id;
  }

  // Catch up from the table rather than trusting notification payloads: no gaps, strict order.
  function catchUp(): Promise<void> {
    chain = chain.then(async () => {
      await withClient(opts.pool, async (db) => {
        for (;;) {
          const rows = await liveEventsAfter(db, lastBroadcast.toString(), REPLAY_LIMIT);
          if (rows.length === 0) break;
          const batch: Frame[] = [];
          for (const row of rows) {
            const frame = await toFrame(db, row);
            lastBroadcast = BigInt(row.id);
            if (frame) batch.push(frame);
          }
          for (const c of clients) c.ready ? sendAll(c, batch) : c.queue.push(...batch);
        }
      });
    }).catch((err) => console.error('live catch-up failed:', err));
    return chain;
  }

  async function connectListener(): Promise<void> {
    while (!closing) {
      try {
        const l = new pg.Client({ connectionString: opts.listenConnectionString });
        await l.connect();
        await l.query(`LISTEN ${LIVE_CHANNEL}`);
        l.on('notification', () => {
          if (pending) return;
          pending = setTimeout(() => {
            pending = null;
            void catchUp();
          }, opts.coalesceMs ?? COALESCE_MS);
        });
        l.on('error', (err) => {
          console.error('live listener error:', err.message);
          if (listener === l) {
            listener = null;
            void l.end().catch(() => undefined);
            if (!closing) setTimeout(() => void connectListener(), 1_000);
          }
        });
        listener = l;
        await catchUp(); // anything committed while we were disconnected
        return;
      } catch (err) {
        console.error('live listener connect failed:', (err as Error).message);
        await new Promise((r) => setTimeout(r, 1_000));
      }
    }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method !== 'GET' || url.pathname !== '/v1/live') {
      res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not_found"}');
      return;
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('retry: 3000\n\n');

    const lastEventId = req.headers['last-event-id'] ?? url.searchParams.get('last_event_id');
    const resumeFrom = typeof lastEventId === 'string' && /^\d+$/.test(lastEventId) ? BigInt(lastEventId) : null;
    const client: Client = { res, lastSent: resumeFrom ?? lastBroadcast, ready: resumeFrom === null, queue: [] };
    clients.add(client);
    req.on('close', () => clients.delete(client));

    if (resumeFrom !== null) {
      await (chain = chain.then(async () => {
        await withClient(opts.pool, async (db) => {
          const bounds = await liveEventBounds(db);
          if (bounds.min !== null && resumeFrom < BigInt(bounds.min) - 1n) {
            res.write(`event: resync\ndata: {"type":"resync"}\n\n`);
            client.lastSent = lastBroadcast;
            return;
          }
          let after = resumeFrom;
          while (after < lastBroadcast) {
            const rows = await liveEventsAfter(db, after.toString(), REPLAY_LIMIT);
            if (rows.length === 0) break;
            for (const row of rows) {
              if (BigInt(row.id) > lastBroadcast) break;
              const frame = await toFrame(db, row);
              if (frame) send(client, frame);
              after = BigInt(row.id);
            }
          }
          client.lastSent = client.lastSent > lastBroadcast ? client.lastSent : lastBroadcast;
        });
        for (const f of client.queue) send(client, f);
        client.queue = [];
        client.ready = true;
      }).catch((err) => console.error('live replay failed:', err)));
    }
  });

  const heartbeat = setInterval(() => {
    for (const c of clients) c.res.write(': heartbeat\n\n');
  }, opts.heartbeatMs ?? HEARTBEAT_MS);

  await connectListener();
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  const address = server.address();

  return {
    port: typeof address === 'object' && address ? address.port : port,
    clientCount: () => clients.size,
    async close() {
      closing = true;
      clearInterval(heartbeat);
      if (pending) clearTimeout(pending);
      for (const c of clients) c.res.end();
      clients.clear();
      await new Promise((r) => server.close(r));
      await listener?.end().catch(() => undefined);
      await chain;
    },
  };
}

async function withClient<T>(pool: pg.Pool, fn: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    return await fn(db);
  } finally {
    db.release();
  }
}
