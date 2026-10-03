import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newPublicId } from '@stockpanic/core';
import { changeSetting } from './community.ts';
import { setSettingFromCli } from './maintenance.ts';
import { migrate } from './migrate.ts';

// GUARDRAILS §4.8 / §4.9 enforced by the database (migration 0012).
const adminUrl = process.env['TEST_DATABASE_URL'];

describe.skipIf(!adminUrl)('audit hardening (PostgreSQL)', () => {
  const dbName = `sp_audit_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let db: pg.Client;
  const audits = async (action: string, entity: string) =>
    (await db.query('SELECT actor_type, before, after FROM audit_log WHERE action = $1 AND entity_id = $2 ORDER BY id', [action, entity])).rows;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    await migrate(db);
  });

  afterAll(async () => {
    await db?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  it('every change to a source (its tier is the publisher weight) is audited, whatever made it', async () => {
    await db.query(`INSERT INTO source (source_id, name, kind, tier, cadence) VALUES ('src_x', 'Example', 'article', 3, '{}')`);
    await db.query(`UPDATE source SET tier = 2 WHERE source_id = 'src_x'`);
    await db.query(`DELETE FROM source WHERE source_id = 'src_x'`);
    expect((await audits('source.insert', 'src_x'))[0]).toMatchObject({ actor_type: 'system', before: null, after: { tier: 3 } });
    expect((await audits('source.update', 'src_x'))[0]).toMatchObject({ before: { tier: 3 }, after: { tier: 2 } });
    expect((await audits('source.delete', 'src_x'))[0]).toMatchObject({ before: { tier: 2 }, after: null });
  });

  it('direct setting changes are audited; application paths write exactly one richer row', async () => {
    await db.query(`UPDATE setting SET value = '0.97' WHERE key = 'tag_display_threshold'`);
    expect(await audits('setting.changed_direct', 'tag_display_threshold')).toEqual([{ actor_type: 'system', before: { value: 0.95 }, after: { value: 0.97 } }]);

    const op = await db.query(
      `INSERT INTO app_user (public_id, username, email, age_confirmed_at, terms_accepted_at, privacy_consent_at) VALUES ($1, 'auditor1', 'auditor1@example.invalid', now(), now(), now()) RETURNING id`,
      [newPublicId('us')],
    );
    await changeSetting(db, 'comments_visible', false, String(op.rows[0].id), 'Incident', new Date());
    await setSettingFromCli(db, 'comments_visible', true, new Date());
    expect(await audits('setting.changed_direct', 'comments_visible')).toEqual([]);
    expect((await audits('setting.changed', 'comments_visible')).map((r) => r.after.value)).toEqual([false, true]);
  });

  it('AI call records cannot be edited or deleted', async () => {
    await db.query(
      `INSERT INTO ai_call (job, model_id, prompt_version, input_hash, outcome) VALUES ('classify', 'claude-haiku-4-5', 'classify-v1', 'h', 'accepted')`,
    );
    await expect(db.query(`UPDATE ai_call SET outcome = 'withheld'`)).rejects.toThrow(/append-only/);
    await expect(db.query(`DELETE FROM ai_call`)).rejects.toThrow(/append-only/);
  });
});
