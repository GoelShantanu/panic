import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { istInstant, isinCheckDigit, newPublicId } from '@stockpanic/core';
import { addCalendarException, addHoliday, calendarDay, createStory, ensureCalendar, migrate, removeHoliday, runMaintenance, setStoryDerived } from '@stockpanic/db';
import { route } from './api.ts';

// All companies and headlines are fictional. The clock is fixed: Monday 5 October 2026, 11:00 IST.
const adminUrl = process.env['TEST_DATABASE_URL'];
const isin = (b: string) => `IN${b}${isinCheckDigit(`IN${b}`)}`;
const A = isin('E00AST101'); // busy during market hours
const K = isin('E00KES101'); // quiet
const M = isin('E00MER101'); // busy only after hours
const NOW = istInstant('2026-10-05', '11:00');
const EVENING = istInstant('2026-10-05', '21:00');

describe.skipIf(!adminUrl)('trading calendar and Trending (PostgreSQL)', () => {
  const dbName = `sp_trend_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let db: pg.Client;
  const get = (path: string, now: Date) => route(db, 'GET', new URL(`http://test${path}`), now);
  const b = (r: { body: unknown }) => r.body as any;
  let seq = 0;

  const story = async (tag: string | null, items: { source: string; at: Date }[], headline = `Invented story ${++seq}`) => {
    const ids: string[] = [];
    for (const it of items) {
      const r = await db.query(
        `INSERT INTO item (public_id, kind, source_id, dedup_key, headline, url, published_at, first_seen_at) VALUES ($1, 'article', $2, $3, $4, 'https://news.example.in/x', $5, $5) RETURNING id`,
        [newPublicId('it'), it.source, `k${randomBytes(6).toString('hex')}`, headline, it.at],
      );
      ids.push(String(r.rows[0].id));
    }
    await db.query('BEGIN');
    const id = await createStory(db, ids[0]!, items[0]!.at);
    for (const x of ids.slice(1)) await db.query('INSERT INTO story_item (item_id, story_id) VALUES ($1, $2)', [x, id]);
    await setStoryDerived(db, id, { primaryItemId: ids[0]!, sourceCount: new Set(items.map((i) => i.source)).size, eventTypes: ['other'], tags: tag ? [{ isin: tag, method: 'rule' }] : [], unresolved: [] });
    await db.query('COMMIT');
    return (await db.query('SELECT public_id FROM story WHERE id = $1', [id])).rows[0].public_id as string;
  };
  // A long-running background story whose items make up an instrument's baseline.
  const baseline = async (tag: string, hhmm: string, count: number) => {
    const at = (n: number) => new Date(istInstant('2026-09-07', hhmm).getTime() + (n % 27) * 86_400_000 + Math.floor(n / 27) * 60_000);
    await story(tag, Array.from({ length: count }, (_, n) => ({ source: `src_desk_${(n % 4) + 1}`, at: at(n) })), `Background ${tag}`);
  };
  const ago = (min: number, from = NOW) => new Date(from.getTime() - min * 60_000);

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    await migrate(db);
    await ensureCalendar(db, '2026-08-01', '2026-11-30');
    for (const i of [A, K, M]) await db.query(`INSERT INTO instrument (isin, segment) VALUES ($1, 'mainboard')`, [i]);
    const cadence = JSON.stringify(Object.fromEntries(['pre_open', 'open', 'closed', 'holiday', 'special', 'halted'].map((s) => [s, { poll_s: 60, expect: true }])));
    for (let n = 1; n <= 5; n++) {
      await db.query(`INSERT INTO source (source_id, name, kind, tier, access_basis, access_checked_on, enabled, cadence, adapter) VALUES ($1, $1, 'article', 3, 'test', current_date, false, $2, '{}')`, [`src_desk_${n}`, cadence]);
    }
  });

  afterAll(async () => {
    await db?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  describe('calendar', () => {
    it('session state follows the 2026 calendar, skipping midnights to the next real change', async () => {
      expect(b(await get('/v1/stream', NOW)).session).toMatchObject({ state: 'open', next_transition_at: istInstant('2026-10-05', '15:30') });
      expect(b(await get('/v1/stream', istInstant('2026-10-02', '12:00'))).session).toMatchObject({ state: 'holiday', next_transition_at: istInstant('2026-10-03', '00:00') });
      expect(b(await get('/v1/stream', istInstant('2026-10-09', '16:00'))).session).toMatchObject({ state: 'closed', next_transition_at: istInstant('2026-10-12', '09:00') });
      const muhurat = await calendarDay(db, '2026-11-08');
      expect(muhurat.periods.map((p: any) => p.session)).toEqual(['closed', 'special', 'closed']);
      expect(muhurat.periods[1].starts_at).toEqual(istInstant('2026-11-08', '18:00'));
    });

    it('holidays and halts rebuild the day; recurring holidays fill later years once', async () => {
      await addHoliday(db, '2026-10-07', 'Test holiday', new Date());
      expect((await calendarDay(db, '2026-10-07')).periods.map((p: any) => p.session)).toEqual(['holiday']);
      await removeHoliday(db, '2026-10-07', new Date());
      expect((await calendarDay(db, '2026-10-07')).periods.map((p: any) => p.session)).toEqual(['closed', 'pre_open', 'open', 'closed']);
      await addCalendarException(db, { date: '2026-10-08', session: 'halted', startsAt: istInstant('2026-10-08', '10:00'), endsAt: istInstant('2026-10-08', '10:45'), reason: 'Market-wide circuit breaker' }, new Date());
      expect(b(await get('/v1/stream', istInstant('2026-10-08', '10:10'))).session.state).toBe('halted');

      await ensureCalendar(db, '2027-01-25', '2027-01-27');
      expect((await calendarDay(db, '2027-01-26')).holiday).toEqual({ name: 'Republic Day', source: 'recurring' });
      await removeHoliday(db, '2027-01-26', new Date());
      await ensureCalendar(db, '2027-01-28', '2027-01-29');
      expect((await calendarDay(db, '2027-01-26')).holiday).toBeNull(); // removal sticks
    });

    it('maintenance keeps 60 days ahead and asks for next year’s official list from November', async () => {
      const r = await runMaintenance(db, istInstant('2026-11-15', '02:00'));
      expect(r.calendarWarnings).toEqual(['2027: enter the official holiday list (usually published in December)']);
      expect((await calendarDay(db, '2027-01-13')).periods.length).toBeGreaterThan(0);
    });
  });

  describe('Trending', () => {
    const ids: Record<string, string> = {};
    beforeAll(async () => {
      await baseline(A, '11:00', 400); // in-session history
      await baseline(M, '20:00', 400); // after-hours history only
      const three = (from = NOW) => [{ source: 'src_desk_1', at: ago(50, from) }, { source: 'src_desk_2', at: ago(30, from) }, { source: 'src_desk_3', at: ago(10, from) }];
      ids['A'] = await story(A, three(), 'Asterion wins order');
      ids['K'] = await story(K, three(), 'Kestrel wins order');
      ids['M'] = await story(M, three(), 'Meridian wins order');
      ids['U'] = await story(null, three(), 'Rupee slips against the dollar');
      ids['K2'] = await story(K, [{ source: 'src_desk_1', at: ago(40) }, { source: 'src_desk_2', at: ago(20) }], 'Kestrel board meets');
      ids['old'] = await story(K, [{ source: 'src_desk_1', at: ago(200) }, { source: 'src_desk_2', at: ago(190) }, { source: 'src_desk_3', at: ago(180) }], 'Kestrel older news');
      ids['Me'] = await story(M, three(EVENING), 'Meridian evening news');
      ids['Ke'] = await story(K, three(EVENING), 'Kestrel evening news');
    });

    it('needs 3 sources inside the 2-hour window; scores against the company’s own in-session normal', async () => {
      const r = b(await get('/v1/stream?view=trending', NOW));
      const order = r.stories.map((s: any) => s.story_id);
      expect(order).not.toContain(ids['K2']);
      expect(order).not.toContain(ids['old']);
      expect(new Set(order.slice(0, 3))).toEqual(new Set([ids['K'], ids['M'], ids['U']]));
      expect(order[3]).toBe(ids['A']); // the same activity is ordinary for a company that is always busy in market hours
      expect(r.stories[0].trending).toMatchObject({ score: 3, sources_in_window: 3, window_hours: 2 });
      expect(r.stories[3].trending.score).toBeLessThan(1);
      expect(r.next_cursor).toBeNull();
    });

    it('after hours, the after-hours normal applies (in-session and out-of-session never mix)', async () => {
      const order = b(await get('/v1/stream?view=trending', EVENING)).stories.map((s: any) => s.story_id);
      expect(order).toEqual([ids['Ke'], ids['Me']]);
    });

    it('votes never move the score (C-001.2)', async () => {
      const before = b(await get('/v1/stream?view=trending', NOW)).stories.find((s: any) => s.story_id === ids['A']).trending.score;
      const sid = (await db.query('SELECT id FROM story WHERE public_id = $1', [ids['A']])).rows[0].id;
      for (let n = 0; n < 5; n++) {
        const u = await db.query(
          `INSERT INTO app_user (public_id, username, email, email_verified_at, age_confirmed_at, terms_accepted_at, privacy_consent_at) VALUES ($1, $2, $3, now(), now(), now(), now()) RETURNING id`,
          [newPublicId('us'), `voter${n}`, `voter${n}@example.invalid`],
        );
        await db.query(`INSERT INTO vote_directional (story_id, user_id, direction) VALUES ($1, $2, 'bullish')`, [sid, u.rows[0].id]);
        await db.query(`INSERT INTO vote_quality (story_id, user_id, kind) VALUES ($1, $2, 'important')`, [sid, u.rows[0].id]);
      }
      const after = b(await get('/v1/stream?view=trending', NOW)).stories.find((s: any) => s.story_id === ids['A']).trending.score;
      expect(after).toBe(before);
    });

    it('filters apply as in the stream; Trending has no cursor', async () => {
      expect(b(await get('/v1/stream?view=trending&event_types=results', NOW)).stories).toEqual([]);
      expect((await get('/v1/stream?view=trending&cursor=eyJ0IjoiMjAyNi0xMC0wNVQwMDowMDowMFoiLCJpIjoiMSJ9', NOW)).status).toBe(400);
    });
  });
});
