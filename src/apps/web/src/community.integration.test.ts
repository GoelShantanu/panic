import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { base32Decode, hashToken, isinCheckDigit, newPublicId, newToken, totpAt } from '@stockpanic/core';
import { createSession, createStory, grantRole, migrate, runMaintenance, setStoryDerived } from '@stockpanic/db';
import { MemoryMailer } from '@stockpanic/mail';
import { route } from './api.ts';
import type { AuthDeps } from './auth.ts';

// All companies, people and comments are fictional.
const adminUrl = process.env['TEST_DATABASE_URL'];
const isin = (b: string) => `IN${b}${isinCheckDigit(`IN${b}`)}`;
const A = isin('E00AST101');

describe.skipIf(!adminUrl)('votes, comments, grievances, moderation (PostgreSQL)', () => {
  const dbName = `sp_comm_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let db: pg.Client;
  const deps: AuthDeps = { mailer: new MemoryMailer(), authSecret: 'test-secret-that-is-at-least-32-chars!!', google: null };
  const tokens: Record<string, string> = {};
  const ids: Record<string, { id: string; publicId: string }> = {};
  let s1 = '';
  let s2 = '';
  const call = (who: string | null, method: string, path: string, body: unknown = null, now: Date = new Date(), ip: string | null = '203.0.113.7') =>
    route(db, method, new URL(`http://test${path}`), now, { body, sessionToken: who ? tokens[who]! : null, ip }, deps);
  const b = (r: { body: unknown }) => r.body as any;

  const story = async (headline: string) => {
    const item = await db.query(
      `INSERT INTO item (public_id, kind, source_id, dedup_key, headline, url, first_seen_at) VALUES ($1, 'article', 'src_desk', $2, $3, 'https://example.invalid/a', now()) RETURNING id`,
      [newPublicId('it'), randomBytes(4).toString('hex'), headline],
    );
    await db.query('BEGIN');
    const id = await createStory(db, String(item.rows[0].id), new Date());
    await setStoryDerived(db, id, { primaryItemId: String(item.rows[0].id), sourceCount: 1, eventTypes: ['results'], tags: [{ isin: A, method: 'rule' }], unresolved: [] });
    await db.query('COMMIT');
    return (await db.query('SELECT public_id FROM story WHERE id = $1', [id])).rows[0].public_id as string;
  };

  const user = async (name: string, ageDays: number) => {
    const u = await db.query(
      `INSERT INTO app_user (public_id, username, email, email_verified_at, age_confirmed_at, terms_accepted_at, privacy_consent_at, created_at)
       VALUES ($1, $2, $3, now(), now(), now(), now(), now() - make_interval(days => $4)) RETURNING id, public_id`,
      [newPublicId('us'), name, `${name}@example.invalid`, ageDays],
    );
    ids[name] = { id: String(u.rows[0].id), publicId: u.rows[0].public_id };
    tokens[name] = newToken();
    await createSession(db, hashToken(tokens[name]!), ids[name]!.id, new Date());
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
    await db.query(`INSERT INTO instrument (isin, segment) VALUES ($1, 'mainboard')`, [A]);
    await db.query(`INSERT INTO instrument_name (isin, kind, name, valid) VALUES ($1, 'legal', 'Asterion Industries Limited', '[2020-01-01,)')`, [A]);
    await db.query(`INSERT INTO source (source_id, name, kind, tier, cadence) VALUES ('src_desk', 'Example Desk', 'article', 3, '{}')`);
    s1 = await story('Asterion Industries reports quarterly results');
    s2 = await story('Asterion Industries board meeting scheduled');
    await user('veteran', 60);
    await user('newbie', 2);
    await user('second', 30);
    await user('mod', 90);
  });

  afterAll(async () => {
    await db?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  describe('votes (PRD-005 §9.2)', () => {
    it('anonymous, new account, unknown vote', async () => {
      expect((await call(null, 'PUT', `/v1/stories/${s1}/votes/directional`, { vote: 'bullish' })).status).toBe(401);
      const r = await call('newbie', 'PUT', `/v1/stories/${s1}/votes/directional`, { vote: 'bullish' });
      expect(r.status).toBe(403);
      expect(b(r)).toMatchObject({ error: 'not_eligible', reason: 'account_too_new' });
      expect(b(r).eligible_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect((await call('veteran', 'PUT', `/v1/stories/${s1}/votes/directional`, { vote: 'up' })).status).toBe(400);
      expect((await call('veteran', 'PUT', `/v1/stories/st_00000000000000000000000000/votes/directional`, { vote: 'bullish' })).status).toBe(404);
    });

    it('cast, change, remove — each audited with the IP kept apart', async () => {
      let r = await call('veteran', 'PUT', `/v1/stories/${s1}/votes/directional`, { vote: 'bullish' });
      expect(r.status).toBe(200);
      expect(b(r).votes).toMatchObject({ directional: { state: 'few', total: 1 }, mine: { directional: 'bullish', quality: [] }, can_vote: { directional: true, quality: true, reason: null } });
      r = await call('veteran', 'PUT', `/v1/stories/${s1}/votes/directional`, { vote: 'bearish' });
      expect(b(r).votes.mine.directional).toBe('bearish');
      r = await call('veteran', 'DELETE', `/v1/stories/${s1}/votes/directional`);
      expect(b(r).votes).toMatchObject({ directional: { state: 'none' }, mine: { directional: null } });
      const audit = await db.query(`SELECT a.action, host(i.ip) AS ip FROM audit_log a LEFT JOIN ip_log i ON i.audit_id = a.id WHERE a.entity_id = $1 AND a.action LIKE 'vote.%' ORDER BY a.id`, [s1]);
      expect(audit.rows).toEqual([
        { action: 'vote.cast', ip: '203.0.113.7' },
        { action: 'vote.changed', ip: '203.0.113.7' },
        { action: 'vote.removed', ip: '203.0.113.7' },
      ]);
    });

    it('quality votes: new accounts may; wrong_stock needs an ISIN', async () => {
      expect((await call('newbie', 'PUT', `/v1/stories/${s1}/votes/quality/important`)).status).toBe(200);
      expect((await call('newbie', 'PUT', `/v1/stories/${s1}/votes/quality/wrong_stock`, {})).status).toBe(400);
      expect((await call('newbie', 'PUT', `/v1/stories/${s1}/votes/quality/wrong_stock`, { detail: { isin: A } })).status).toBe(200);
      expect((await call('newbie', 'PUT', `/v1/stories/${s1}/votes/quality/hot`)).status).toBe(400);
      const story = await call('newbie', 'GET', `/v1/stories/${s1}`);
      expect(b(story).votes).toMatchObject({ important_count: 1, mine: { quality: ['important', 'wrong_stock'] }, can_vote: { directional: false, quality: true, reason: 'account_too_new' } });
      expect(b(await call(null, 'GET', `/v1/stories/${s1}`)).votes.mine).toBeUndefined();
      const stream = await call('newbie', 'GET', '/v1/stream');
      expect(b(stream).stories.find((s: any) => s.story_id === s1).votes.mine.quality).toEqual(['important', 'wrong_stock']);
    });

    it('60 votes per hour', async () => {
      for (let i = 0; i < 60; i++) {
        await db.query(`INSERT INTO audit_log (at, actor_type, actor_id, action, entity_type, entity_id) VALUES (now() - interval '10 minutes', 'user', $1, 'vote.cast', 'story', $2)`, [ids['second']!.id, s2]);
      }
      const r = await call('second', 'PUT', `/v1/stories/${s2}/votes/directional`, { vote: 'neutral' });
      expect(r.status).toBe(429);
      expect(b(r).retry_after_s).toBeGreaterThan(2000);
      expect(b(await call('second', 'GET', `/v1/stories/${s2}`)).votes.can_vote.reason).toBe('rate_limited');
    });
  });

  describe('comments (PRD-006 §7)', () => {
    let top = '';
    let reply = '';
    it('eligibility, validation, posting, threading', async () => {
      expect((await call('newbie', 'POST', `/v1/stories/${s1}/comments`, { body: 'hello' })).status).toBe(403);
      expect((await call('veteran', 'POST', `/v1/stories/${s1}/comments`, { body: '   ' })).status).toBe(400);
      expect((await call('veteran', 'POST', `/v1/stories/${s1}/comments`, { body: 'x'.repeat(2001) })).status).toBe(400);
      let r = await call('veteran', 'POST', `/v1/stories/${s1}/comments`, { body: 'Margins look better than last quarter.' });
      expect(r.status).toBe(201);
      top = b(r).comment.comment_id;
      expect((await call('veteran', 'POST', `/v1/stories/${s1}/comments`, { body: 'again' })).status).toBe(429); // 30 s interval
      r = await call('second', 'POST', `/v1/stories/${s1}/comments`, { body: 'Agreed, though costs rose.', parent_id: top });
      expect(b(r).comment.depth).toBe(2);
      reply = b(r).comment.comment_id;
      expect((await call('second', 'POST', `/v1/stories/${s2}/comments`, { body: 'wrong story', parent_id: top }, new Date(Date.now() + 60_000))).status).toBe(400);
      const l3 = await call('veteran', 'POST', `/v1/stories/${s1}/comments`, { body: 'Level three', parent_id: reply }, new Date(Date.now() + 60_000));
      const l4 = await call('second', 'POST', `/v1/stories/${s1}/comments`, { body: 'Placed at three', parent_id: b(l3).comment.comment_id }, new Date(Date.now() + 120_000));
      expect(b(l4).comment.depth).toBe(3);

      const list = await call(null, 'GET', `/v1/stories/${s1}/comments`);
      expect(b(list).comments).toHaveLength(1);
      const t = b(list).comments[0];
      expect(t).toMatchObject({ comment_id: top, parent_id: null, author: { username: 'veteran' }, state: 'visible', edited: false });
      expect(t.replies[0]).toMatchObject({ comment_id: reply, parent_id: top, depth: 2 });
      expect(t.replies[0].replies[0].replies[0]).toBeUndefined();
      expect(t.replies[0].replies.length).toBe(2);
      expect(b(list).posting).toEqual({ enabled: true });
      expect(b(await call('newbie', 'GET', `/v1/stories/${s1}/comments`)).posting).toMatchObject({ enabled: true, can_post: false, reason: 'account_too_new' });
    });

    it('edit within 10 minutes only, by the author only; delete leaves a placeholder', async () => {
      expect((await call('second', 'PATCH', `/v1/comments/${top}`, { body: 'hijack' })).status).toBe(403);
      expect((await call('veteran', 'PATCH', `/v1/comments/${top}`, { body: 'Margins look much better than last quarter.' })).status).toBe(200);
      expect((await call('veteran', 'PATCH', `/v1/comments/${top}`, { body: 'late' }, new Date(Date.now() + 11 * 60_000))).status).toBe(409);
      expect((await db.query('SELECT count(*)::int AS n FROM comment_revision')).rows[0].n).toBe(1);
      expect((await call('second', 'DELETE', `/v1/comments/${reply}`)).status).toBe(204);
      const t = b(await call(null, 'GET', `/v1/stories/${s1}/comments`)).comments[0];
      expect(t.edited).toBe(true);
      expect(t.replies[0]).toMatchObject({ state: 'deleted_by_author', body: null });
      expect(t.replies[0].replies.length).toBe(2); // replies stay
    });

    it('replies and notifications', async () => {
      expect(b(await call('veteran', 'GET', '/v1/me/notifications')).unread_replies).toBe(false); // the only reply was deleted
      await call('second', 'POST', `/v1/stories/${s1}/comments`, { body: 'One more thought.', parent_id: top }, new Date(Date.now() + 5 * 60_000));
      const n = await call('veteran', 'GET', '/v1/me/notifications');
      expect(b(n).unread_replies).toBe(true);
      const r = await call('veteran', 'GET', '/v1/me/replies', null, new Date(Date.now() + 10 * 60_000));
      expect(b(r).replies).toHaveLength(1);
      expect(b(await call('veteran', 'GET', '/v1/me/notifications')).unread_replies).toBe(false);
    });

    it('reports open a grievance with a reference; one report per user', async () => {
      expect((await call('newbie', 'POST', `/v1/comments/${top}/reports`, { reason: 'i_disagree' })).status).toBe(400);
      const r = await call('newbie', 'POST', `/v1/comments/${top}/reports`, { reason: 'defamation', detail: 'Names a private person.' });
      expect(r.status).toBe(201);
      expect(b(r).reference).toMatch(/^GR-\d{4}-\d{6}$/);
      expect((await call('newbie', 'POST', `/v1/comments/${top}/reports`, { reason: 'spam' })).status).toBe(409);
      await call('second', 'POST', `/v1/comments/${top}/reports`, { reason: 'obscene' });
      const g = await db.query(`SELECT source, urgent, resolve_due_at - received_at AS window FROM grievance WHERE comment_id = (SELECT id FROM comment WHERE public_id = $1)`, [top]);
      expect(g.rows).toHaveLength(1);
      expect(g.rows[0]).toMatchObject({ source: 'report', urgent: true });
      expect((await db.query('SELECT reference FROM grievance WHERE source = $1', ['report'])).rows[0].reference).toBe(b(r).reference);
    });

    it('public grievance form needs no account', async () => {
      expect((await call(null, 'POST', '/v1/grievances', { email: 'nope', details: 'x' })).status).toBe(400);
      const r = await call(null, 'POST', '/v1/grievances', { email: 'complainant@example.invalid', details: 'A comment misstates facts about me.', comment_id: top });
      expect(r.status).toBe(201);
      expect(b(r).reference).toMatch(/^GR-/);
    });

    it('profiles: comments only, noindex', async () => {
      const r = await call(null, 'GET', '/v1/users/veteran');
      expect(r.headers?.['x-robots-tag']).toBe('noindex');
      expect(Object.keys(b(r)).sort()).toEqual(['comments', 'joined', 'username']);
      expect((await call(null, 'GET', '/v1/users/nobody_here')).status).toBe(404);
    });
  });

  describe('operator 2FA and moderation (PRD-007 US-007.5, PRD-006 US-006.8)', () => {
    let secret = '';
    const code = (offsetMs = 0) => totpAt(base32Decode(secret), Math.floor((Date.now() + offsetMs) / 30_000));

    it('a role cannot be granted before enrolment', async () => {
      expect(await grantRole(db, 'mod', 'operator', new Date())).toBe('totp_required');
      await expect(db.query(`UPDATE app_user SET role = 'operator' WHERE id = $1`, [ids['mod']!.id])).rejects.toThrow(/check/i);
    });

    it('enrol, confirm, grant, gate', async () => {
      const e = await call('mod', 'POST', '/v1/me/totp/enrol');
      secret = b(e).secret;
      expect(b(e).otpauth_uri).toContain('otpauth://totp/StockPanic:mod');
      const stored = (await db.query('SELECT totp_secret_enc FROM app_user WHERE id = $1', [ids['mod']!.id])).rows[0].totp_secret_enc;
      expect(stored).not.toContain(secret);
      expect(b(await call('mod', 'POST', '/v1/me/totp/confirm', { code: '000000' })).error).toBe('invalid_code');
      expect((await call('mod', 'POST', '/v1/me/totp/confirm', { code: code() })).status).toBe(200);
      expect(await grantRole(db, 'mod', 'operator', new Date())).toBe('granted');

      expect(b(await call('veteran', 'GET', '/v1/admin/grievances')).error).toBe('forbidden');
      expect((await call('mod', 'GET', '/v1/admin/grievances')).status).toBe(200); // confirm marked this session
      await db.query('UPDATE user_session SET mfa_verified_at = NULL WHERE user_id = $1', [ids['mod']!.id]);
      expect(b(await call('mod', 'GET', '/v1/admin/grievances')).error).toBe('mfa_required');
      expect((await call('mod', 'POST', '/v1/auth/mfa', { code: code() })).status).toBe(200);
      expect((await call('mod', 'GET', '/v1/admin/grievances')).status).toBe(200);
      expect(b(await call('mod', 'GET', '/v1/admin/grievances', null, new Date(Date.now() + 13 * 3600_000))).error).toBe('mfa_required');
    });

    it('five wrong codes lock MFA for 15 minutes', async () => {
      await user('locked', 90);
      const enrol = await call('locked', 'POST', '/v1/me/totp/enrol');
      await call('locked', 'POST', '/v1/me/totp/confirm', { code: totpAt(base32Decode(b(enrol).secret), Math.floor(Date.now() / 30_000)) });
      for (let i = 0; i < 5; i++) await call('locked', 'POST', '/v1/auth/mfa', { code: '000000' });
      expect((await call('locked', 'POST', '/v1/auth/mfa', { code: '000000' })).status).toBe(429);
    });

    it('takedown keeps the text 180 days apart, notifies the author; legal reasons need a grievance', async () => {
      const top = (await db.query(`SELECT public_id FROM comment WHERE parent_id IS NULL AND story_id = (SELECT id FROM story WHERE public_id = $1)`, [s1])).rows[0].public_id;
      expect((await call('mod', 'POST', `/v1/admin/comments/${top}/takedown`, { reason: 'court_order' })).status).toBe(400);
      // the second reporter's own reference resolves to the shared grievance
      const ref = (await db.query(`SELECT reference FROM comment_report ORDER BY id DESC LIMIT 1`)).rows[0].reference;
      const r = await call('mod', 'POST', `/v1/admin/comments/${top}/takedown`, { reason: 'defamation', grievance_id: ref });
      expect(b(r)).toEqual({ comment_id: top, state: 'removed', removed_reason: 'defamation' });
      const kept = await db.query(`SELECT purge_after - removed_at AS keep FROM removed_content`);
      expect(kept.rows[0].keep.days).toBe(180);
      const t = b(await call(null, 'GET', `/v1/stories/${s1}/comments`)).comments[0];
      expect(t).toMatchObject({ state: 'removed', removed_reason: 'defamation', body: null });
      const notices = b(await call('veteran', 'GET', '/v1/me/notifications')).notices;
      expect(notices[0]).toMatchObject({ kind: 'comment_removed', comment_id: top, reason: 'defamation' });
      expect(b(await call('veteran', 'GET', '/v1/me/notifications')).notices).toEqual([]);
    });

    it('grievance queue, acknowledge, resolve', async () => {
      const q = b(await call('mod', 'GET', '/v1/admin/grievances')).grievances;
      expect(q.length).toBeGreaterThanOrEqual(2);
      const ref = q[0].reference;
      expect((await call('mod', 'POST', `/v1/admin/grievances/${ref}`, { status: 'resolved' })).status).toBe(400);
      expect((await call('mod', 'POST', `/v1/admin/grievances/${ref}`, { status: 'acknowledged' })).status).toBe(200);
      expect((await call('mod', 'POST', `/v1/admin/grievances/${ref}`, { status: 'resolved', decision: 'Removed as defamatory.' })).status).toBe(200);
      expect((await call('mod', 'POST', '/v1/admin/grievances/GR-2000-000001', { status: 'acknowledged' })).status).toBe(404);
    });

    it('suspension, revocation, discounting, kill switches; reason mandatory', async () => {
      const second = ids['second']!.publicId;
      expect((await call('mod', 'POST', `/v1/admin/users/${second}/comment-suspension`, { suspended: true })).status).toBe(400);
      expect((await call('mod', 'POST', `/v1/admin/users/${second}/comment-suspension`, { suspended: true, reason: 'Repeated abuse.' })).status).toBe(200);
      expect(b(await call('second', 'POST', `/v1/stories/${s2}/comments`, { body: 'hi' }, new Date(Date.now() + 600_000))).reason).toBe('suspended');

      await call('veteran', 'PUT', `/v1/stories/${s2}/votes/directional`, { vote: 'bullish' });
      expect((await db.query('SELECT bullish FROM story_vote_count WHERE story_id = (SELECT id FROM story WHERE public_id = $1)', [s2])).rows[0].bullish).toBe(1);
      const d = await call('mod', 'POST', `/v1/admin/users/${ids['veteran']!.publicId}/vote-discount`, { discounted: true, reason: 'Brigading.' });
      expect(b(d).votes_affected).toBeGreaterThan(0);
      expect((await db.query('SELECT bullish FROM story_vote_count WHERE story_id = (SELECT id FROM story WHERE public_id = $1)', [s2])).rows[0].bullish).toBe(0);

      await call('mod', 'POST', `/v1/admin/users/${ids['veteran']!.publicId}/voting`, { revoked: true, reason: 'Brigading.' });
      expect(b(await call('veteran', 'PUT', `/v1/stories/${s2}/votes/directional`, { vote: 'bearish' })).reason).toBe('revoked');

      expect((await call('mod', 'PUT', '/v1/admin/settings/comments', { posting: false, visible: true, story_id: s2, reason: 'Heated thread.' })).status).toBe(200);
      expect((await call('mod', 'POST', `/v1/stories/${s2}/comments`, { body: 'test' })).status).toBe(423);
      await call('mod', 'PUT', '/v1/admin/settings/comments', { posting: true, visible: false, story_id: null, reason: 'Incident.' });
      expect(b(await call(null, 'GET', `/v1/stories/${s1}/comments`))).toMatchObject({ comments: [], hidden: true });
      await call('mod', 'PUT', '/v1/admin/settings/comments', { posting: true, visible: true, story_id: null, reason: 'Resolved.' });

      await call('mod', 'PUT', '/v1/admin/settings/directional-voting', { enabled: false, reason: 'Review.' });
      expect((await call('newbie', 'PUT', `/v1/stories/${s1}/votes/directional`, { vote: 'bullish' })).status).toBe(404);
      await call('mod', 'PUT', '/v1/admin/settings/directional-voting', { enabled: true, reason: 'Done.' });
    });

    it('voters list is operator-only and audited (D-021)', async () => {
      expect((await call('veteran', 'GET', `/v1/admin/stories/${s2}/voters?vote=bullish`)).status).toBe(403);
      const r = await call('mod', 'GET', `/v1/admin/stories/${s2}/voters?vote=bullish`);
      expect(b(r).voters[0]).toMatchObject({ username: 'veteran', discounted: true });
      expect((await db.query(`SELECT count(*)::int AS n FROM audit_log WHERE action = 'voters.viewed' AND actor_type = 'operator'`)).rows[0].n).toBe(1);
      expect((await call('mod', 'GET', '/v1/admin/abuse')).status).toBe(200);
    });
  });

  describe('maintenance (partitioning.md §3)', () => {
    it('drops expired partitions and purges expired content', async () => {
      await db.query(`CREATE TABLE ip_log_202501 PARTITION OF ip_log FOR VALUES FROM ('2025-01-01') TO ('2025-02-01')`);
      await db.query(`CREATE TABLE live_event_20250101 PARTITION OF live_event FOR VALUES FROM ('2025-01-01') TO ('2025-01-02')`);
      await db.query(`INSERT INTO ip_log_default (audit_id, at, ip) VALUES (1, '2024-06-01', '198.51.100.1')`);
      await db.query(`UPDATE removed_content SET removed_at = now() - interval '200 days', purge_after = now() - interval '1 day'`);
      const r = await runMaintenance(db, new Date());
      expect(r.dropped.sort()).toEqual(['ip_log_202501', 'live_event_20250101']);
      expect(r.defaultRowsPurged).toBe(1);
      expect(r.removedContent).toBe(1);
      const left = await db.query(`SELECT count(*)::int AS n FROM pg_class WHERE relname LIKE 'ip_log_2%'`);
      expect(left.rows[0].n).toBeGreaterThanOrEqual(4); // current month + 3 ahead
    });
  });
});
