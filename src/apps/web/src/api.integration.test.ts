import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isinCheckDigit, newPublicId, upgradeRequired } from '@stockpanic/core';
import { addItemToStory, createStory, migrate, setStoryDerived } from '@stockpanic/db';
import { route } from './api.ts';
import { clientIp, createApiServer } from './server.ts';

// All companies, headlines and ISINs are fictional.
const adminUrl = process.env['TEST_DATABASE_URL'];
const isin = (b: string) => `IN${b}${isinCheckDigit(`IN${b}`)}`;
const A = isin('E00AST101');
const K = isin('E00KES101');
const UNKNOWN = isin('E00ZZZ999');

describe.skipIf(!adminUrl)('read API (PostgreSQL)', () => {
  const dbName = `sp_api_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let db: pg.Client;
  const now = new Date();
  const ago = (h: number) => new Date(now.getTime() - h * 3600_000);
  const ids: Record<string, { id: string; pub: string }> = {};
  const get = async (path: string) => route(db, 'GET', new URL(`http://test${path}`), now);
  const body = (r: { body: unknown }) => r.body as any;

  const item = async (kind: 'filing' | 'article', sourceId: string, key: string, headline: string, at: Date) => {
    const { rows } = await db.query(
      `INSERT INTO item (public_id, kind, source_id, dedup_key, headline, url, published_at, first_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING id`,
      [newPublicId('it'), kind, sourceId, key, headline, `https://news.example.in/${key}`, at],
    );
    return String(rows[0].id);
  };

  const story = async (name: string, itemIds: string[], at: Date, derived: Parameters<typeof setStoryDerived>[2]) => {
    await db.query('BEGIN');
    const id = await createStory(db, itemIds[0]!, at);
    for (const extra of itemIds.slice(1)) await addItemToStory(db, id, extra);
    await setStoryDerived(db, id, derived);
    await db.query('COMMIT');
    const pub = (await db.query('SELECT public_id FROM story WHERE id = $1', [id])).rows[0].public_id;
    ids[name] = { id, pub };
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

    for (const [i, name, nseOld, nse, bse] of [
      [A, 'Asterion Industries Limited', 'OLDAST', 'ASTERION', '500101'],
      [K, 'Kestrel Power Limited', null, 'KESTREL', '500102'],
    ] as const) {
      await db.query(`INSERT INTO instrument (isin, segment) VALUES ($1, 'mainboard')`, [i]);
      await db.query(`INSERT INTO instrument_name (isin, kind, name, valid) VALUES ($1, 'legal', $2, '[2020-01-01,)')`, [i, name]);
      if (nseOld) {
        await db.query(`INSERT INTO instrument_code (isin, exchange, code, valid) VALUES ($1, 'NSE', $2, '[2020-01-01,2026-01-01)')`, [i, nseOld]);
        await db.query(`INSERT INTO instrument_code (isin, exchange, code, valid) VALUES ($1, 'NSE', $2, '[2026-01-01,)')`, [i, nse]);
      } else {
        await db.query(`INSERT INTO instrument_code (isin, exchange, code, valid) VALUES ($1, 'NSE', $2, '[2020-01-01,)')`, [i, nse]);
      }
      await db.query(`INSERT INTO instrument_code (isin, exchange, code, valid) VALUES ($1, 'BSE', $2, '[2020-01-01,)')`, [i, bse]);
    }
    const cadence = JSON.stringify(Object.fromEntries(['pre_open', 'open', 'closed', 'holiday', 'special', 'halted'].map((s) => [s, { poll_s: 60, expect: true }])));
    await db.query(
      `INSERT INTO source (source_id, name, kind, tier, access_basis, access_checked_on, enabled, cadence, adapter) VALUES
       ('src_desk', 'Example Desk', 'article', 3, 'test', current_date, true, $1, '{"type":"rss","url":"https://example.invalid"}'),
       ('src_bse_ann', 'BSE Announcements', 'filing', 1, 'test', current_date, true, $1, '{"type":"rss","url":"https://example.invalid"}')`,
      [cadence],
    );
    await db.query(`INSERT INTO source_health (source_id) VALUES ('src_desk'), ('src_bse_ann')`);

    for (let u = 1; u <= 4; u++) {
      await db.query(
        `INSERT INTO app_user (public_id, username, email, email_verified_at, age_confirmed_at, terms_accepted_at, privacy_consent_at)
         VALUES ($1, $2, $3, now(), now(), now(), now())`,
        [newPublicId('us'), `voter_${u}`, `voter${u}@example.invalid`],
      );
    }

    const f1 = await item('filing', 'src_bse_ann', 'BSE:1', 'Financial Results for the quarter ended September 30, 2026', ago(3));
    await db.query(`INSERT INTO filing_detail (item_id, exchange, announcement_id, scrip_code, category) VALUES ($1, 'BSE', '1', '500101', 'Result')`, [f1]);
    const a1 = await item('article', 'src_desk', 'ast-q2', 'Asterion Industries Q2 profit rises 18%', ago(2.9));
    await story('S1', [f1, a1], ago(3), {
      primaryItemId: f1,
      sourceCount: 2,
      eventTypes: ['results'],
      tags: [{ isin: A, method: 'exchange_code' }],
      unresolved: [],
    });
    const a2 = await item('article', 'src_desk', 'kes-order', 'Kestrel Power wins ₹900 crore transmission order', ago(2));
    await story('S2', [a2], ago(2), { primaryItemId: a2, sourceCount: 1, eventTypes: ['order_contract'], tags: [{ isin: K, method: 'rule' }], unresolved: [] });
    const a3 = await item('article', 'src_desk', 'halcyon', 'Halcyon plans ₹10,000 crore investment', ago(1));
    await story('S3', [a3], ago(1), { primaryItemId: a3, sourceCount: 1, eventTypes: ['other'], tags: [], unresolved: ['Halcyon'] });
    const a4 = await item('article', 'src_desk', 'ast-old', 'Asterion Industries opens new plant', ago(40 * 24));
    await story('S4', [a4], ago(40 * 24), { primaryItemId: a4, sourceCount: 1, eventTypes: ['other'], tags: [{ isin: A, method: 'rule' }], unresolved: [] });
    const merged = await db.query(`INSERT INTO story (public_id, first_seen_at, merged_into) VALUES ($1, $2, $3) RETURNING public_id`, [
      newPublicId('st'),
      ago(2.5),
      ids['S1']!.id,
    ]);
    ids['S5'] = { id: '', pub: merged.rows[0].public_id };

    await db.query(
      `INSERT INTO vote_directional (story_id, user_id, direction) VALUES ($1, 1, 'bullish'), ($1, 2, 'bullish'), ($1, 3, 'bullish'), ($1, 4, 'bearish')`,
      [ids['S2']!.id],
    );
    await db.query(`INSERT INTO vote_quality (story_id, user_id, kind) VALUES ($1, 1, 'important'), ($1, 2, 'important'), ($1, 3, 'important')`, [
      ids['S1']!.id,
    ]);
    await db.query(
      `INSERT INTO story_summary (story_id, source_item_id, body, citations, checks, model_id, prompt_version, ai_call_id)
       VALUES ($1, $2, 'The board approved results for the quarter ended 30 September 2026.', '[]', '{}', 'claude-haiku-4-5', 'p1', 1)`,
      [ids['S1']!.id, f1],
    );
    await db.query(`INSERT INTO comment (public_id, story_id, user_id, body) VALUES ($1, $2, 1, 'A comment')`, [newPublicId('cm'), ids['S1']!.id]);
  });

  afterAll(async () => {
    await db?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  describe('source status and sitemaps (PRD-001 US-001.6 AC-4, PRD-004 US-004.3 AC-8)', () => {
    it('every enabled source with its state; error text stays internal', async () => {
      await db.query(`UPDATE source_health SET state = 'stale', last_error = 'HTTP 503 from upstream', changed_at = now() WHERE source_id = 'src_desk'`);
      const s = body(await get('/v1/sources/status')).sources;
      expect(s.map((x: any) => x.source_id)).toEqual(['src_bse_ann', 'src_desk']); // tier order
      expect(s[1]).toMatchObject({ name: 'Example Desk', tier: 3, health: 'stale' });
      expect(JSON.stringify(s)).not.toContain('503');
      await db.query(`UPDATE source_health SET state = 'healthy', last_error = NULL WHERE source_id = 'src_desk'`);
    });

    it('companies with canonical slugs; months and their live stories, merged ones excluded', async () => {
      const companies = body(await get('/v1/sitemap/companies')).companies;
      expect(companies).toContainEqual({ isin: A, slug: 'asterion-industries' });
      const months = body(await get('/v1/sitemap/months')).months;
      expect(months[0]).toMatch(/^\d{4}-\d{2}$/);
      const all = (await Promise.all(months.map(async (m: string) => body(await get(`/v1/sitemap/stories?month=${m}`)).stories))).flat();
      const listed = all.map((x: any) => x.story_id);
      expect(listed).toEqual(expect.arrayContaining([ids['S1']!.pub, ids['S2']!.pub, ids['S4']!.pub]));
      expect(listed).not.toContain(ids['S5']!.pub); // merged
      expect((await get('/v1/sitemap/stories?month=2026-13')).status).toBe(400);
    });
  });

  describe('GET /v1/stream (PRD-001)', () => {
    it('latest: newest first; merged and out-of-depth stories excluded', async () => {
      const r = await get('/v1/stream');
      expect(r.status).toBe(200);
      expect(body(r).stories.map((s: any) => s.story_id)).toEqual([ids['S3']!.pub, ids['S2']!.pub, ids['S1']!.pub]);
      expect(body(r).next_cursor).toBeNull();
    });

    it('story card matches the contract', async () => {
      const s1 = body(await get('/v1/stream')).stories[2];
      expect(s1).toMatchObject({
        story_id: ids['S1']!.pub,
        headline: 'Financial Results for the quarter ended September 30, 2026',
        primary_item: { kind: 'filing', source: { source_id: 'src_bse_ann', name: 'BSE Announcements', tier: 1 } },
        source_count: 2,
        instruments: [{ isin: A, display_symbol: 'ASTERION', exchange_codes: { nse: 'ASTERION', bse: '500101' }, resolution: 'resolved', confidence: 1 }],
        unresolved_mentions: [],
        event_types: ['results'],
        votes: { directional: { state: 'none', label: 'Community opinion' }, important_count: 3 },
        comment_count: 1,
      });
      expect(body(await get('/v1/stream')).stories[0].unresolved_mentions).toEqual(['Halcyon']);
    });

    it('keyset pagination with an opaque cursor', async () => {
      const p1 = body(await get('/v1/stream?limit=2'));
      expect(p1.stories).toHaveLength(2);
      expect(p1.next_cursor).toEqual(expect.any(String));
      const p2 = body(await get(`/v1/stream?limit=2&cursor=${p1.next_cursor}`));
      expect(p2.stories.map((s: any) => s.story_id)).toEqual([ids['S1']!.pub]);
      expect(p2.next_cursor).toBeNull();
    });

    it('C-001.1: no tone or sentiment field anywhere', async () => {
      const keys: string[] = [];
      const walk = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (keys.push(k), walk(x));
      };
      walk(body(await get('/v1/stream')));
      expect(keys.filter((k) => /(^|_)(tone|sentiment)(_|$)/i.test(k))).toEqual([]);
    });

    it('C-005.2: vote objects have no percentage, ratio, score or consensus', async () => {
      const votes = body(await get('/v1/stream')).stories.map((s: any) => s.votes);
      expect(JSON.stringify(votes)).not.toMatch(/pct|percent|ratio|score|consensus/i);
    });

    it('vote views use PRD-005 thresholds', async () => {
      expect(body(await get('/v1/stream?view=important')).stories.map((s: any) => s.story_id)).toEqual([ids['S1']!.pub]);
      expect(body(await get('/v1/stream?view=bullish')).stories.map((s: any) => s.story_id)).toEqual([ids['S2']!.pub]);
      expect(body(await get('/v1/stream?view=bearish')).stories).toEqual([]);
      const s2 = body(await get('/v1/stream?view=bullish')).stories[0];
      expect(s2.votes.directional).toEqual({ state: 'counts', total: 4, bullish: 3, bearish: 1, neutral: 0, label: 'Community opinion' });
    });

    it('one event type is free; several, or the stream filings-only toggle, need paid (402)', async () => {
      expect(body(await get('/v1/stream?event_types=results')).stories.map((s: any) => s.story_id)).toEqual([ids['S1']!.pub]);
      const multi = await get('/v1/stream?event_types=results,other');
      expect(multi).toMatchObject({ status: 402, body: upgradeRequired('multi_event_filter') });
      expect((await get('/v1/stream?filings_only=true')).status).toBe(402);
    });

    it('error codes per the contract', async () => {
      expect(await get('/v1/stream?view=hot')).toMatchObject({ status: 400, body: { error: 'invalid_param', param: 'view' } });
      expect(body(await get('/v1/stream?limit=0')).param).toBe('limit');
      expect(body(await get('/v1/stream?limit=101')).param).toBe('limit');
      expect(body(await get('/v1/stream?cursor=garbage')).param).toBe('cursor');
      expect(body(await get('/v1/stream?event_types=order_win')).param).toBe('event_types');
      expect(await get('/v1/stream?view=watchlist')).toMatchObject({ status: 401, body: { error: 'auth_required' } });
      expect((await get('/v1/stream?view=trending')).status).toBe(200); // B4b: served once the calendar exists (D-038)
    });

    it('session and stale tier-1 sources are reported', async () => {
      const r1 = body(await get('/v1/stream'));
      expect(r1.session.state).toBe('closed'); // no calendar loaded
      expect(r1.stale_sources).toEqual([]);
      await db.query(`UPDATE source_health SET state = 'stale' WHERE source_id = 'src_bse_ann'`);
      expect(body(await get('/v1/stream')).stale_sources).toEqual([expect.objectContaining({ source_id: 'src_bse_ann', health: 'stale' })]);
      await db.query(`UPDATE source_health SET state = 'healthy' WHERE source_id = 'src_bse_ann'`);
    });
  });

  describe('GET /v1/stories/{id} (PRD-004 §6.1)', () => {
    it('returns items filing-first, the summary, named instruments and related stories', async () => {
      const r = await get(`/v1/stories/${ids['S1']!.pub}`);
      expect(r.status).toBe(200);
      const b = body(r);
      expect(b.items.map((i: any) => i.kind)).toEqual(['filing', 'article']);
      expect(b.summary).toMatchObject({ label: 'AI summary of the BSE filing', text: expect.stringContaining('board approved') });
      expect(b.instruments[0]).toMatchObject({ isin: A, name: 'Asterion Industries Limited' });
      expect(b.related).toEqual({ [A]: [ids['S4']!.pub] });
      expect(b.primary_item_id).toBe(b.items[0].item_id);
    });

    it('a merged story redirects to the survivor (301)', async () => {
      const r = await get(`/v1/stories/${ids['S5']!.pub}`);
      expect(r).toMatchObject({ status: 301, headers: { location: `/v1/stories/${ids['S1']!.pub}` } });
    });

    it('unknown story → 404', async () => {
      expect((await get(`/v1/stories/${newPublicId('st')}`)).status).toBe(404);
    });
  });

  describe('companies (PRD-004 §6.2)', () => {
    it('company page with community opinion over the last 7 days', async () => {
      const r = body(await get(`/v1/companies/${K}`));
      expect(r).toMatchObject({ isin: K, name: 'Kestrel Power Limited', slug: 'kestrel-power', display_symbol: 'KESTREL', status: 'listed' });
      expect(r.community_opinion).toEqual({
        window_days: 7,
        label: 'Community opinion on stories about KESTREL, last 7 days',
        display: { state: 'counts', total: 4, bullish: 3, bearish: 1, neutral: 0, label: 'Community opinion' },
      });
      expect(r).not.toHaveProperty('price');
    });

    it('timeline respects free history depth and says older stories exist', async () => {
      const r = body(await get(`/v1/companies/${A}/timeline`));
      expect(r.stories.map((s: any) => s.story_id)).toEqual([ids['S1']!.pub]);
      expect(r.depth_limit_reached).toBe(true);
      expect(body(await get(`/v1/companies/${K}/timeline`)).depth_limit_reached).toBe(false);
    });

    it('company filings-only toggle is free', async () => {
      expect((await get(`/v1/companies/${A}/timeline?filings_only=true`)).status).toBe(200);
    });

    it('invalid or unknown ISIN → 404', async () => {
      expect((await get('/v1/companies/INE000A01019')).status).toBe(404);
      expect((await get(`/v1/companies/${UNKNOWN}`)).status).toBe(404);
    });
  });

  describe('kill switch (PRD-005 US-005.7, C-001.3)', () => {
    it('removes directional data and views without a deploy', async () => {
      await db.query(`UPDATE setting SET value = 'false' WHERE key = 'directional_voting_enabled'`);
      try {
        expect((await get('/v1/stream?view=bullish')).status).toBe(404);
        const s2 = body(await get('/v1/stream')).stories.find((s: any) => s.story_id === ids['S2']!.pub);
        expect(s2.votes).toEqual({ important_count: 0 });
        expect(body(await get(`/v1/companies/${K}`))).not.toHaveProperty('community_opinion');
      } finally {
        await db.query(`UPDATE setting SET value = 'true' WHERE key = 'directional_voting_enabled'`);
      }
    });
  });

  describe('instruments (PRD-002 §8.3, PRD-003 US-003.1)', () => {
    it('as-of lookup returns the symbol valid on that date', async () => {
      expect(body(await get(`/v1/instruments/${A}?as_of=2025-06-01`)).display_symbol).toBe('OLDAST');
      expect(body(await get(`/v1/instruments/${A}`)).display_symbol).toBe('ASTERION');
      expect(body(await get(`/v1/instruments/${A}?as_of=06-01-2025`)).param).toBe('as_of');
    });

    it('search by partial name, symbol, scrip code or ISIN', async () => {
      expect(body(await get('/v1/instruments/search?q=aster')).results[0].isin).toBe(A);
      expect(body(await get('/v1/instruments/search?q=KESTREL')).results[0].isin).toBe(K);
      expect(body(await get('/v1/instruments/search?q=500101')).results[0].isin).toBe(A);
      expect(body(await get(`/v1/instruments/search?q=${K}`)).results[0].isin).toBe(K);
      expect((await get('/v1/instruments/search?q=a')).status).toBe(400);
    });
  });

  it('GET /v1/event-types lists the taxonomy (PRD-004 §6.3)', async () => {
    const r = body(await get('/v1/event-types'));
    expect(r.version).toBe(1);
    expect(r.types).toHaveLength(20);
    expect(r.types[0]).toEqual({ code: 'results', label: 'Results', alert_default: true });
  });

  it('unknown routes and methods', async () => {
    expect((await get('/v1/nope')).status).toBe(404);
    expect((await route(db, 'POST', new URL('http://test/v1/stream'))).status).toBe(405);
  });

  it('article tags can be switched off after a failed audit; filing tags stay (US-002.8 AC-5, D-051)', async () => {
    await db.query(`UPDATE setting SET value = 'false' WHERE key = 'article_tags_enabled'`);
    try {
      expect(body(await get(`/v1/stories/${ids['S2']!.pub}`)).instruments).toEqual([]); // rule tag hidden
      expect(body(await get(`/v1/stories/${ids['S1']!.pub}`)).instruments.map((i: any) => i.isin)).toEqual([A]); // exchange code stays
      expect(body(await get(`/v1/companies/${K}/timeline`)).stories).toEqual([]);
    } finally {
      await db.query(`UPDATE setting SET value = 'true' WHERE key = 'article_tags_enabled'`);
    }
    expect(body(await get(`/v1/stories/${ids['S2']!.pub}`)).instruments.map((i: any) => i.isin)).toEqual([K]);
  });

  it('client IP: the socket, or the last X-Forwarded-For hop when our proxy is trusted (D-053)', () => {
    const req = (fwd: string | undefined, addr: string) => ({ headers: fwd ? { 'x-forwarded-for': fwd } : {}, socket: { remoteAddress: addr } }) as never;
    expect(clientIp(req('198.51.100.7', '::ffff:127.0.0.1'), false)).toBe('127.0.0.1'); // header ignored unless trusted
    expect(clientIp(req('spoofed, 198.51.100.7', '127.0.0.1'), true)).toBe('198.51.100.7'); // client-supplied entries ignored
    expect(clientIp(req(undefined, '203.0.113.9'), true)).toBe('203.0.113.9');
  });

  it('HTTP server: the anonymous first page of Latest is shared for 2 s; past capacity it fails fast (D-050)', async () => {
    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    const pool = new pg.Pool({ connectionString: url.toString(), max: 2 });
    const open = async (opts: Parameters<typeof createApiServer>[2]) => {
      const server = createApiServer(pool, null, opts);
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise((r) => server.close(r)) };
    };
    const s = await open({});
    try {
      const headlines = async (path = '/v1/stream', headers: Record<string, string> = {}) => ((await (await fetch(s.base + path, { headers })).json()) as any).stories.map((x: any) => x.headline);
      const before = await headlines();
      const h = (await fetch(s.base + '/v1/session')).headers; // security headers on every response (D-053)
      expect(h.get('x-frame-options')).toBe('DENY');
      expect(h.get('x-content-type-options')).toBe('nosniff');
      expect(h.get('content-security-policy')).toContain("frame-ancestors 'none'");
      const a = await item('article', 'src_desk', 'cache-1', 'Fictional cache probe story', new Date());
      await story('C1', [a], new Date(), { primaryItemId: a, sourceCount: 1, eventTypes: ['other'], tags: [], unresolved: [] });
      expect(await headlines()).toEqual(before); // shared copy
      expect((await headlines('/v1/stream?view=latest'))[0]).toBe('Fictional cache probe story'); // any parameter: computed
      expect((await headlines('/v1/stream', { cookie: 'sp_session=not-a-real-session' }))[0]).toBe('Fictional cache probe story'); // a session: computed
      await new Promise((r) => setTimeout(r, 2100));
      expect((await headlines())[0]).toBe('Fictional cache probe story');
    } finally {
      await s.close();
    }
    const shed = await open({ maxDbQueue: 0 });
    try {
      const r = await fetch(`${shed.base}/v1/session`);
      expect(r.status).toBe(503);
      expect(r.headers.get('retry-after')).toBe('2');
      expect(await r.json()).toEqual({ error: 'overloaded' });
    } finally {
      await shed.close();
      await pool.end();
    }
  });
});
