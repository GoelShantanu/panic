import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newPublicId } from '@stockpanic/core';
import { createStory, emitStoryEvent, migrate, setHealthState, setStoryDerived } from '@stockpanic/db';
import { startLiveServer } from './live.ts';
import type { LiveServer } from './live.ts';

const adminUrl = process.env['TEST_DATABASE_URL'];

interface SseEvent {
  id: string | null;
  event: string | null;
  data: any;
  comment: boolean;
}

// Minimal SSE reader: collects events until `until` is satisfied or the timeout passes.
async function collect(url: string, until: (events: SseEvent[]) => boolean, headers: Record<string, string> = {}, timeoutMs = 4000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const events: SseEvent[] = [];
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (!until(events)) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev: SseEvent = { id: null, event: null, data: null, comment: false };
        for (const line of block.split('\n')) {
          if (line.startsWith(':')) ev.comment = true;
          else if (line.startsWith('id: ')) ev.id = line.slice(4);
          else if (line.startsWith('event: ')) ev.event = line.slice(7);
          else if (line.startsWith('data: ')) ev.data = JSON.parse(line.slice(6));
        }
        if (ev.comment || ev.event) events.push(ev);
      }
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') throw err;
  } finally {
    clearTimeout(timer);
    ctrl.abort();
  }
  return events;
}

describe.skipIf(!adminUrl)('live channel (SSE + LISTEN/NOTIFY)', () => {
  const dbName = `sp_live_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let db: pg.Client;
  let pool: pg.Pool;
  let live: LiveServer;
  let base = '';

  const newStory = async (headline: string) => {
    const { rows } = await db.query(
      `INSERT INTO item (public_id, kind, source_id, dedup_key, headline, url) VALUES ($1, 'article', 'src_desk', $2, $3, 'https://news.example.in/x') RETURNING id`,
      [newPublicId('it'), randomBytes(4).toString('hex'), headline],
    );
    await db.query('BEGIN');
    const id = await createStory(db, String(rows[0].id), new Date());
    await setStoryDerived(db, id, { primaryItemId: String(rows[0].id), sourceCount: 1, eventTypes: ['other'], tags: [], unresolved: [] });
    await emitStoryEvent(db, 'story.created', id);
    await db.query('COMMIT');
    return (await db.query('SELECT public_id FROM story WHERE id = $1', [id])).rows[0].public_id as string;
  };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    await migrate(db);
    await db.query(
      `INSERT INTO source (source_id, name, kind, tier, cadence) VALUES ('src_desk', 'Example Desk', 'article', 3, '{}')`,
    );
    await db.query(`INSERT INTO source_health (source_id) VALUES ('src_desk')`);
    pool = new pg.Pool({ connectionString: url.toString(), max: 4 });
    live = await startLiveServer({ pool, listenConnectionString: url.toString(), heartbeatMs: 150 });
    base = `http://127.0.0.1:${live.port}/v1/live`;
  });

  afterAll(async () => {
    await live?.close();
    await pool?.end();
    await db?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  it('sends heartbeats', async () => {
    const events = await collect(base, (e) => e.some((x) => x.comment));
    expect(events.some((x) => x.comment)).toBe(true);
  });

  it('broadcasts story.created with the full story card within seconds', async () => {
    const pending = collect(base, (e) => e.some((x) => x.event === 'story.created'));
    await new Promise((r) => setTimeout(r, 200)); // let the client connect
    const pub = await newStory('Asterion Industries board approves capex plan');
    const ev = (await pending).find((x) => x.event === 'story.created')!;
    expect(ev.data).toMatchObject({ type: 'story.created', story: { story_id: pub, headline: 'Asterion Industries board approves capex plan', event_types: ['other'] } });
    expect(ev.id).toMatch(/^\d+$/);
  });

  it('broadcasts the same payload to every client (ADR-005)', async () => {
    const a = collect(base, (e) => e.some((x) => x.event === 'story.created'));
    const b = collect(base, (e) => e.some((x) => x.event === 'story.created'));
    await new Promise((r) => setTimeout(r, 200));
    await newStory('Kestrel Power wins transmission order');
    const [ea, eb] = await Promise.all([a, b]);
    expect(ea.find((x) => x.event === 'story.created')!.data).toEqual(eb.find((x) => x.event === 'story.created')!.data);
  });

  it('replays missed events after Last-Event-ID, in order', async () => {
    const lastSeen = (await db.query('SELECT max(id)::text AS id FROM live_event')).rows[0].id;
    const p1 = await newStory('Meridian Textiles promoter releases pledge');
    const p2 = await newStory('Orion Cables to invest in new plant');
    await new Promise((r) => setTimeout(r, 300));
    const events = await collect(base, (e) => e.filter((x) => x.event === 'story.created').length >= 2, { 'last-event-id': lastSeen });
    expect(events.filter((x) => x.event === 'story.created').map((x) => x.data.story.story_id)).toEqual([p1, p2]);
  });

  it('asks the client to resync when the gap is older than retained events', async () => {
    await db.query(`DELETE FROM live_event WHERE id < (SELECT max(id) FROM live_event)`);
    const events = await collect(base, (e) => e.some((x) => x.event === 'resync'), { 'last-event-id': '0' });
    expect(events.some((x) => x.event === 'resync')).toBe(true);
  });

  it('broadcasts source health changes', async () => {
    const pending = collect(base, (e) => e.some((x) => x.event === 'source.health'));
    await new Promise((r) => setTimeout(r, 200));
    await setHealthState(db, 'src_desk', 'healthy', 'stale', new Date());
    const ev = (await pending).find((x) => x.event === 'source.health')!;
    expect(ev.data).toEqual({ type: 'source.health', source_id: 'src_desk', health: 'stale' });
  });

  it('unknown paths → 404', async () => {
    expect((await fetch(`http://127.0.0.1:${live.port}/nope`)).status).toBe(404);
  });
});
