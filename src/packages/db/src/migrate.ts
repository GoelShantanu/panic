import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

// Single source of truth for migrations is docs/database/migrations (REPOSITORY_STRUCTURE §2).
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../../../docs/database/migrations/', import.meta.url));

const MIGRATION_FILE = /^(\d{4}_[a-z0-9_]+)\.sql$/;
const ADVISORY_LOCK_KEY = 730_120_261;

export class MigrationError extends Error {}

// Applies pending migrations in order. Each file owns its transaction (BEGIN … COMMIT)
// and records its own version in schema_migrations; forward-only (schema.md §7).
export async function migrate(client: pg.ClientBase, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
  try {
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const { rows } = await client.query<{ version: string }>('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.version));

    const files = (await readdir(dir)).filter((f) => MIGRATION_FILE.test(f)).sort();
    const ran: string[] = [];
    for (const file of files) {
      const version = file.slice(0, -'.sql'.length);
      if (applied.has(version)) continue;

      const sql = await readFile(path.join(dir, file), 'utf8');
      if (!/^\s*BEGIN;/m.test(sql) || !/^\s*COMMIT;/m.test(sql)) {
        throw new MigrationError(`${file}: a migration must wrap itself in BEGIN; … COMMIT;`);
      }
      try {
        await client.query(sql);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new MigrationError(`${file} failed: ${(err as Error).message}`, { cause: err });
      }
      const recorded = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
      if (recorded.rowCount !== 1) {
        throw new MigrationError(`${file} did not record itself in schema_migrations`);
      }
      ran.push(version);
    }
    return ran;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
  }
}
