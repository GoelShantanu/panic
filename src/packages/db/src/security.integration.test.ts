import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canonicalEmail, newPublicId } from '@stockpanic/core';
import { migrate } from './migrate.ts';

// Security review controls enforced by the database (D-053). All addresses are fictional.
const adminUrl = process.env['TEST_DATABASE_URL'];
const CASES = ['Name@Example.in', 'name+votes@example.in', 'n.a.m.e+1@gmail.com', 'N.Ame@GoogleMail.com', 'first.last@company.co.in', '  spaced@example.in ', 'noat', 'a+b+c@x.example'];

describe.skipIf(!adminUrl)('security controls in the database (PostgreSQL)', () => {
  const dbName = `sp_sec_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let db: pg.Client;

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

  it('email_canonical() in SQL matches canonicalEmail() in code', async () => {
    for (const e of CASES) expect((await db.query('SELECT email_canonical($1) AS c', [e])).rows[0].c).toBe(canonicalEmail(e));
  });

  it('a second account for an alias of an existing address is refused by the database', async () => {
    const add = (username: string, email: string) =>
      db.query(
        `INSERT INTO app_user (public_id, username, email, email_verified_at, age_confirmed_at, terms_accepted_at, privacy_consent_at) VALUES ($1, $2, $3, now(), now(), now(), now())`,
        [newPublicId('us'), username, email],
      );
    await add('farmer_one', 'farmer@gmail.com');
    await expect(add('farmer_two', 'f.a.r.m.e.r+2@googlemail.com')).rejects.toMatchObject({ code: '23505', constraint: 'app_user_email_canonical' });
    await add('other_person', 'farmer@example.in'); // a different domain is a different inbox
  });
});
