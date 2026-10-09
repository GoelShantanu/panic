import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken, newPublicId, newToken } from '@stockpanic/core';
import { createSession, migrate } from '@stockpanic/db';
import { route } from './api.ts';

// Saved views (paid, up to 10, kept on downgrade) and the marketing opt-in (PRD-007).
const adminUrl = process.env['TEST_DATABASE_URL'];

describe.skipIf(!adminUrl)('saved views and account preferences (PostgreSQL)', () => {
  const dbName = `sp_sv_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let db: pg.Client;
  let token = '';
  let userId = '';
  const call = (method: string, path: string, body: unknown = null) => route(db, method, new URL(`http://test${path}`), new Date(), { body, sessionToken: token });
  const b = (r: { body: unknown }) => r.body as any;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    await migrate(db);
    const u = await db.query(
      `INSERT INTO app_user (public_id, username, email, email_verified_at, age_confirmed_at, terms_accepted_at, privacy_consent_at) VALUES ($1, 'viewer1', 'viewer1@example.invalid', now(), now(), now(), now()) RETURNING id`,
      [newPublicId('us')],
    );
    userId = String(u.rows[0].id);
    token = newToken();
    await createSession(db, hashToken(token), userId, new Date());
  });

  afterAll(async () => {
    await db?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  const params = { view: 'latest', event_types: ['results'], filings_only: true };

  it('free accounts get the upgrade response', async () => {
    expect(b(await call('GET', '/v1/saved-views'))).toEqual({ views: [], limit: 0, disabled: true });
    expect(await call('POST', '/v1/saved-views', { name: 'Results', params })).toMatchObject({ status: 402, body: { error: 'upgrade_required', feature: 'saved_views' } });
  });

  it('paid: create, validate, unique names, at most 10, delete; kept but disabled after downgrade', async () => {
    await db.query(`INSERT INTO trial (user_id, started_at, ends_at) VALUES ($1, now(), now() + interval '14 days')`, [userId]);
    expect((await call('POST', '/v1/saved-views', { name: 'Results', params })).status).toBe(201);
    expect(b(await call('POST', '/v1/saved-views', { name: 'Results', params }))).toEqual({ error: 'name_taken' });
    expect(b(await call('POST', '/v1/saved-views', { name: 'Bad', params: { view: 'everything' } }))).toMatchObject({ param: 'params' });
    expect(b(await call('POST', '/v1/saved-views', { name: 'Bad', params: { event_types: ['made_up'] } }))).toMatchObject({ param: 'params' });
    expect(b(await call('POST', '/v1/saved-views', { name: '', params }))).toMatchObject({ param: 'name' });
    for (let i = 2; i <= 10; i++) expect((await call('POST', '/v1/saved-views', { name: `View ${i}`, params })).status).toBe(201);
    expect(b(await call('POST', '/v1/saved-views', { name: 'Eleventh', params }))).toEqual({ error: 'saved_view_limit', limit: 10 });
    const list = b(await call('GET', '/v1/saved-views'));
    expect(list).toMatchObject({ limit: 10, disabled: false });
    expect(list.views[0]).toMatchObject({ name: 'Results', params });
    expect((await call('DELETE', `/v1/saved-views/${list.views[0].id}`)).status).toBe(204);
    expect((await call('DELETE', `/v1/saved-views/${list.views[0].id}`)).status).toBe(404);
    expect((await call('DELETE', '/v1/saved-views/not-a-number')).status).toBe(404);

    await db.query(`UPDATE trial SET started_at = now() - interval '30 days', ends_at = now() - interval '1 day' WHERE user_id = $1`, [userId]);
    expect(b(await call('GET', '/v1/saved-views'))).toMatchObject({ disabled: true, limit: 0 });
    expect(b(await call('GET', '/v1/saved-views')).views).toHaveLength(9);
  });

  it('marketing email is a separate opt-in that can be changed; /v1/me reports it and sign-in methods', async () => {
    expect(b(await call('GET', '/v1/me'))).toMatchObject({ marketing_opt_in: false, sign_in_methods: [] });
    expect(b(await call('PATCH', '/v1/me', { marketing_opt_in: true }))).toMatchObject({ marketing_opt_in: true, username: 'viewer1' });
    expect((await call('PATCH', '/v1/me', { marketing_opt_in: 'yes' })).status).toBe(400);
  });
});
