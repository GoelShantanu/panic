import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ENTITLEMENTS, EVENT_TYPES } from '@stockpanic/core';
import { MIGRATIONS_DIR, MigrationError, migrate } from './migrate.ts';

// Needs a PostgreSQL 17+ server: TEST_DATABASE_URL=postgres://postgres:…@host:port/postgres
const adminUrl = process.env['TEST_DATABASE_URL'];

describe.skipIf(!adminUrl)('migrations against PostgreSQL', () => {
  const dbName = `sp_test_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let client: pg.Client;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    client = new pg.Client({ connectionString: url.toString() });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  it('applies every migration once, in order, then is up to date', async () => {
    const expected = (await readdir(MIGRATIONS_DIR))
      .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
      .sort()
      .map((f) => f.slice(0, -'.sql'.length));
    expect(expected[0]).toBe('0001_initial');
    expect(await migrate(client)).toEqual(expected);
    expect(await migrate(client)).toEqual([]);
  });

  it('event_type seed matches core taxonomy', async () => {
    const { rows } = await client.query<{ code: string; label: string; alert_default: boolean }>(
      'SELECT code, label, alert_default FROM event_type ORDER BY code',
    );
    const expected = EVENT_TYPES.map((t) => ({ code: t.code, label: t.label, alert_default: t.alertDefault })).sort((a, b) =>
      a.code.localeCompare(b.code),
    );
    expect(rows).toEqual(expected);
  });

  it('plan_entitlement seed matches core entitlements', async () => {
    const { rows } = await client.query('SELECT * FROM plan_entitlement ORDER BY tier');
    const toRow = (tier: 'free' | 'paid') => {
      const e = ENTITLEMENTS[tier];
      return {
        tier,
        watchlist_limit: e.watchlistLimit,
        alert_budget_ceiling: e.alertBudgetCeiling,
        default_alert_budget: e.defaultAlertBudget,
        history_days: e.historyDays,
        alert_history_days: e.alertHistoryDays,
        multi_event_filter: e.multiEventFilter,
        stream_filings_only: e.streamFilingsOnly,
        saved_views: e.savedViews,
      };
    };
    expect(rows).toEqual([toRow('free'), toRow('paid')]);
  });

  it('refuses a migration that does not manage its own transaction', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'sp-mig-'));
    try {
      await writeFile(path.join(dir, '0002_no_transaction.sql'), 'CREATE TABLE x (id int);');
      await expect(migrate(client, dir)).rejects.toThrow(MigrationError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rolls back a failing migration and leaves no record', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'sp-mig-'));
    try {
      await writeFile(
        path.join(dir, '0002_breaks.sql'),
        "BEGIN;\nCREATE TABLE half_done (id int);\nSELECT 1/0;\nINSERT INTO schema_migrations (version) VALUES ('0002_breaks');\nCOMMIT;\n",
      );
      await expect(migrate(client, dir)).rejects.toThrow(/0002_breaks.sql failed/);
      const leftovers = await client.query("SELECT to_regclass('half_done') AS t");
      expect(leftovers.rows[0].t).toBeNull();
      const recorded = await client.query("SELECT 1 FROM schema_migrations WHERE version = '0002_breaks'");
      expect(recorded.rowCount).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('the database refuses a tone column even through the runner (D-014)', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'sp-mig-'));
    try {
      await writeFile(
        path.join(dir, '0002_tone.sql'),
        "BEGIN;\nALTER TABLE story ADD COLUMN ai_tone text;\nINSERT INTO schema_migrations (version) VALUES ('0002_tone');\nCOMMIT;\n",
      );
      await expect(migrate(client, dir)).rejects.toThrow(/GUARDRAILS 4\.3/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
