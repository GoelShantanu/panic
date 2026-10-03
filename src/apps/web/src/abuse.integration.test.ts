import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken, isinCheckDigit, newPublicId, newToken } from '@stockpanic/core';
import { abuseReport, createSession, createStory, discountUserVotes, migrate, setStoryDerived } from '@stockpanic/db';
import { route } from './api.ts';

// Security review: coordinated-voting abuse vector (WORKFLOW §9 exit; Research R6; docs/security/review.md §4).
// Each scenario records which detection signal fires and what an operator can do. All fictional.
const adminUrl = process.env['TEST_DATABASE_URL'];
const isin = (b: string) => `IN${b}${isinCheckDigit(`IN${b}`)}`;
const SME = isin('E00PMP101');

describe.skipIf(!adminUrl)('abuse vectors: coordinated voting (PostgreSQL)', () => {
  const dbName = `sp_abuse_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let db: pg.Client;
  const tokens = new Map<string, string>();
  const ids = new Map<string, string>();
  let opId = '';

  const call = (who: string | null, method: string, path: string, body: unknown, now: Date, ip: string) =>
    route(db, method, new URL(`http://test${path}`), now, { body, sessionToken: who ? tokens.get(who)! : null, ip }, null);
  const b = (r: { body: unknown }) => r.body as any;

  const account = async (name: string, ageDays: number) => {
    const u = await db.query(
      `INSERT INTO app_user (public_id, username, email, email_verified_at, age_confirmed_at, terms_accepted_at, privacy_consent_at, created_at)
       VALUES ($1, $2, $3, now(), now(), now(), now(), now() - make_interval(days => $4)) RETURNING id`,
      [newPublicId('us'), name, `${name}@example.invalid`, ageDays],
    );
    ids.set(name, String(u.rows[0].id));
    const t = newToken();
    tokens.set(name, t);
    await createSession(db, hashToken(t), String(u.rows[0].id), new Date());
  };

  const pumpStory = async (headline: string) => {
    const item = await db.query(
      `INSERT INTO item (public_id, kind, source_id, dedup_key, headline, url, first_seen_at) VALUES ($1, 'article', 'src_desk', $2, $3, 'https://example.invalid/p', now()) RETURNING id`,
      [newPublicId('it'), randomBytes(4).toString('hex'), headline],
    );
    await db.query('BEGIN');
    const id = await createStory(db, String(item.rows[0].id), new Date());
    await setStoryDerived(db, id, { primaryItemId: String(item.rows[0].id), sourceCount: 1, eventTypes: ['order_contract'], tags: [{ isin: SME, method: 'rule' }], unresolved: [] });
    await db.query('COMMIT');
    return (await db.query('SELECT public_id FROM story WHERE id = $1', [id])).rows[0].public_id as string;
  };

  const inBullishView = async (storyId: string) => b(await call(null, 'GET', '/v1/stream?view=bullish', null, new Date(), '192.0.2.1')).stories.some((s: any) => s.story_id === storyId);

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    await migrate(db);
    await db.query(`INSERT INTO instrument (isin, segment) VALUES ($1, 'sme')`, [SME]);
    await db.query(`INSERT INTO instrument_name (isin, kind, name, valid) VALUES ($1, 'legal', 'Pumpkin Fintech Limited', '[2020-01-01,)')`, [SME]);
    await db.query(`INSERT INTO source (source_id, name, kind, tier, cadence) VALUES ('src_desk', 'Example Desk', 'article', 3, '{}')`);
    await account('operator_one', 120);
    opId = ids.get('operator_one')!;
  });

  afterAll(async () => {
    await db?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  it('a fast brigade of young accounts from one address is flagged twice; discounting undoes it', async () => {
    const story = await pumpStory('Pumpkin Fintech bags huge order, shares to fly');
    const now = new Date();
    for (let i = 0; i < 24; i++) {
      await account(`farm_${i}`, 10); // past the 7-day voting bar, under the 30-day "new account" line
      const r = await call(`farm_${i}`, 'PUT', `/v1/stories/${story}/votes/directional`, { vote: 'bullish' }, new Date(now.getTime() + i * 5000), '198.51.100.23');
      expect(r.status).toBe(200);
    }
    expect(await inBullishView(story)).toBe(true); // the brigade works until an operator acts
    const report = await abuseReport(db, new Date(now.getTime() + 150_000));
    expect(report.vote_bursts).toContainEqual(expect.objectContaining({ story_id: story, votes: 24, new_account_votes: 24 }));
    expect(report.shared_ips).toContainEqual(expect.objectContaining({ story_id: story, ip: '198.51.100.23', accounts: 24 }));
    for (let i = 0; i < 24; i++) await discountUserVotes(db, ids.get(`farm_${i}`)!, true, opId, 'Brigade: 24 young accounts, one address', new Date());
    expect(await inBullishView(story)).toBe(false);
  });

  it('a patient brigade (old accounts, spread out, one address each) evades every automatic signal', async () => {
    const story = await pumpStory('Pumpkin Fintech management upbeat on outlook');
    const start = new Date();
    for (let i = 0; i < 24; i++) {
      await account(`sleeper_${i}`, 90);
      await call(`sleeper_${i}`, 'PUT', `/v1/stories/${story}/votes/directional`, { vote: 'bullish' }, new Date(start.getTime() + i * 20 * 60_000), `203.0.113.${i + 1}`);
    }
    const report = await abuseReport(db, new Date(start.getTime() + 24 * 20 * 60_000));
    expect(report.vote_bursts.some((x: any) => x.story_id === story)).toBe(false);
    expect(report.shared_ips.some((x: any) => x.story_id === story)).toBe(false);
    expect(report.concentrated_voters.some((x: any) => x.user_id.startsWith('us_'))).toBe(false);
    expect(await inBullishView(story)).toBe(true); // residual risk, accepted with the controls in review.md §4
    expect(report.sme_bullish_stories).toContainEqual(expect.objectContaining({ story_id: story, bullish: 24, voters_under_90_days: 0 })); // listed for an operator to read
  });

  it('the directional kill switch removes the Bullish and Bearish views entirely (PRD-005 US-005.7)', async () => {
    await db.query(`UPDATE setting SET value = 'false' WHERE key = 'directional_voting_enabled'`);
    try {
      expect((await call(null, 'GET', '/v1/stream?view=bullish', null, new Date(), '192.0.2.1')).status).toBe(404);
    } finally {
      await db.query(`UPDATE setting SET value = 'true' WHERE key = 'directional_voting_enabled'`);
    }
  });
});
