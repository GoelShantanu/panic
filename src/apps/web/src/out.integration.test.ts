import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken, isinCheckDigit, newPublicId, newToken } from '@stockpanic/core';
import { createSession, createStory, migrate, setStoryDerived } from '@stockpanic/db';
import { route } from './api.ts';

// Fictional data. Outbound click counting (D-042), follow state, primary item id on cards.
const adminUrl = process.env['TEST_DATABASE_URL'];
const isin = (b: string) => `IN${b}${isinCheckDigit(`IN${b}`)}`;
const A = isin('E00AST101');

describe.skipIf(!adminUrl)('outbound links and company follow state (PostgreSQL)', () => {
  const dbName = `sp_out_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let db: pg.Client;
  let token = '';
  let itemPublic = '';
  let removedPublic = '';
  const get = (path: string, t: string | null = null) => route(db, 'GET', new URL(`http://test${path}`), new Date(), { body: null, sessionToken: t });

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    await migrate(db);
    await db.query(`INSERT INTO instrument (isin, segment) VALUES ($1, 'mainboard')`, [A]);
    await db.query(`INSERT INTO instrument_name (isin, kind, name, valid) VALUES ($1, 'legal', 'Asterion Industries Limited', '[2020-01-01,)')`, [A]);
    await db.query(`INSERT INTO source (source_id, name, kind, tier, cadence) VALUES ('src_desk', 'Desk', 'article', 3, '{}')`);
    const mk = async (status: string) => {
      const r = await db.query(
        `INSERT INTO item (public_id, kind, source_id, dedup_key, headline, url, status) VALUES ($1, 'article', 'src_desk', $2, 'Asterion news', 'https://news.example.in/a', $3) RETURNING id, public_id`,
        [newPublicId('it'), randomBytes(4).toString('hex'), status],
      );
      return r.rows[0];
    };
    const live = await mk('live');
    const removed = await mk('removed_by_source');
    itemPublic = live.public_id;
    removedPublic = removed.public_id;
    await db.query('BEGIN');
    const sid = await createStory(db, String(live.id), new Date());
    await setStoryDerived(db, sid, { primaryItemId: String(live.id), sourceCount: 1, eventTypes: ['other'], tags: [{ isin: A, method: 'rule' }], unresolved: [] });
    await db.query('COMMIT');
    const u = await db.query(
      `INSERT INTO app_user (public_id, username, email, email_verified_at, age_confirmed_at, terms_accepted_at, privacy_consent_at) VALUES ($1, 'reader1', 'reader1@example.invalid', now(), now(), now(), now()) RETURNING id`,
      [newPublicId('us')],
    );
    token = newToken();
    await createSession(db, hashToken(token), String(u.rows[0].id), new Date());
    await db.query('INSERT INTO watchlist_entry (user_id, isin) VALUES ($1, $2)', [u.rows[0].id, A]);
  });

  afterAll(async () => {
    await db?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  it('redirects only to the item’s own URL and counts the click without identifying anyone', async () => {
    const r = await get(`/v1/out/${itemPublic}?from=story`);
    expect(r).toMatchObject({ status: 302, headers: { location: 'https://news.example.in/a' } });
    expect((await get(`/v1/out/${itemPublic}?from=https://evil.example`)).status).toBe(302); // the parameter never changes the target
    expect((await get('/v1/out/it_00000000000000000000000000')).status).toBe(404);
    expect((await get(`/v1/out/${removedPublic}`)).status).toBe(404);
    const clicks = await db.query(`SELECT surface FROM outbound_click ORDER BY id`);
    expect(clicks.rows.map((x) => x.surface)).toEqual(['story', 'other']);
    const cols = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'outbound_click' ORDER BY 1`);
    expect(cols.rows.map((x) => x.column_name)).toEqual(['clicked_at', 'id', 'item_id', 'surface']);
  });

  it('cards carry the primary item id; companies say whether the signed-in reader follows them', async () => {
    const stream = await get('/v1/stream');
    expect((stream.body as any).stories[0].primary_item.item_id).toBe(itemPublic);
    expect((await get(`/v1/companies/${A}`)).body).not.toHaveProperty('is_followed');
    expect((await get(`/v1/companies/${A}`, token)).body).toMatchObject({ is_followed: true });
  });
});
