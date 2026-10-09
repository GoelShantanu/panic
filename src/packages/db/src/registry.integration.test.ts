import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AliasIndex, isinCheckDigit, parseBseEquityList, parseNseEquityList } from '@stockpanic/core';
import type { MasterRow } from '@stockpanic/core';
import { migrate } from './migrate.ts';
import { loadAliasEntries, resolveExchangeCode } from './pipeline.ts';
import { MasterListRefused, addCuratedAlias, applyMasterList } from './registry.ts';

// All companies are fictional.
const adminUrl = process.env['TEST_DATABASE_URL'];
const isin = (b: string) => `IN${b}${isinCheckDigit(`IN${b}`)}`;
const A = isin('E00AST101');
const K = isin('E00KES101');
const V = isin('E00VEL101');
const row = (over: Partial<MasterRow> & Pick<MasterRow, 'isin' | 'code' | 'name'>): MasterRow => ({ segment: 'mainboard', listedOn: '2010-04-01', ...over });

describe('NSE master list parsing (D-049)', () => {
  it('reads by header, maps SME series, rejects bad rows instead of guessing', () => {
    const csv = [
      'SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE, MARKET LOT, ISIN NUMBER, FACE VALUE',
      `ASTERION,Asterion Industries Limited,EQ,06-OCT-2008,5,1,${A},5`,
      `"KESTREL","Kestrel Power, Grid & Transmission Limited",SM,18-SEP-2012,10,300,${K},10`,
      'BROKEN,Broken Limited,EQ,01-JAN-2020,1,1,INE000000000,1',
      `DUPE,Asterion Again Limited,EQ,01-JAN-2020,1,1,${A},1`,
    ].join('\r\n');
    const r = parseNseEquityList(csv);
    if ('error' in r) throw new Error(r.error);
    expect(r.rows).toEqual([
      { code: 'ASTERION', name: 'Asterion Industries Limited', isin: A, segment: 'mainboard', listedOn: '2008-10-06' },
      { code: 'KESTREL', name: 'Kestrel Power, Grid & Transmission Limited', isin: K, segment: 'sme', listedOn: '2012-09-18' },
    ]);
    expect(r.rejected.map((x) => x.line)).toEqual([4, 5]);
    expect(parseNseEquityList('A,B\n1,2')).toEqual({ error: 'missing SYMBOL, NAME OF COMPANY or ISIN NUMBER column' });
  });
});

describe.skipIf(!adminUrl)('registry upkeep from master lists (PostgreSQL)', () => {
  const dbName = `sp_registry_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let db: pg.Client;
  const history = async (i: string) =>
    (await db.query(`SELECT 'code' AS t, code AS v, valid::text FROM instrument_code WHERE isin = $1 UNION ALL SELECT 'name', name, valid::text FROM instrument_name WHERE isin = $1 ORDER BY 1, 3`, [i])).rows;

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

  it('first load: instruments with codes and names valid from listing; resolvable at once', async () => {
    const d = await applyMasterList(db, 'NSE', [row({ isin: A, code: 'ASTERION', name: 'Asterion Industries Limited' }), row({ isin: K, code: 'KESTREL', name: 'Kestrel Power Limited', segment: 'sme', listedOn: null })], '2026-10-01');
    expect(d).toMatchObject({ added: 2, recoded: 0, renamed: 0, removed: [] });
    expect(await history(A)).toEqual([
      { t: 'code', v: 'ASTERION', valid: '[2010-04-01,)' },
      { t: 'name', v: 'Asterion Industries Limited', valid: '[2010-04-01,)' },
    ]);
    expect((await history(K))[0]).toMatchObject({ valid: '[2026-10-01,)' }); // no listing date: from today
    expect(await resolveExchangeCode(db, 'NSE', 'ASTERION', '2015-01-01')).toBe(A);
    expect((await loadAliasEntries(db, '2026-10-01')).map((e) => e.text)).toContain('Asterion Industries Limited');
    expect((await db.query(`SELECT after FROM audit_log WHERE action = 'registry.master_applied'`)).rows[0].after).toMatchObject({ as_of: '2026-10-01', added: 2 });
  });

  it('a symbol change and a rename close the old rows and open new ones; history kept', async () => {
    const d = await applyMasterList(db, 'NSE', [row({ isin: A, code: 'ASTERIND', name: 'Asterion Industries Limited' }), row({ isin: K, code: 'KESTREL', name: 'Kestrel Grid Limited', segment: 'sme' })], '2026-10-05');
    expect(d).toMatchObject({ added: 0, recoded: 1, renamed: 1, unchanged: 0 });
    expect(await history(A)).toEqual([
      { t: 'code', v: 'ASTERION', valid: '[2010-04-01,2026-10-05)' },
      { t: 'code', v: 'ASTERIND', valid: '[2026-10-05,)' },
      { t: 'name', v: 'Asterion Industries Limited', valid: '[2010-04-01,)' },
    ]);
    expect(await resolveExchangeCode(db, 'NSE', 'ASTERION', '2026-10-04')).toBe(A); // old filings still resolve
    expect(await resolveExchangeCode(db, 'NSE', 'ASTERION', '2026-10-05')).toBeNull();
    expect((await history(K)).filter((h) => h.t === 'name').map((h) => h.valid)).toEqual(['[2026-10-01,2026-10-05)', '[2026-10-05,)']);
  });

  it('a removed company closes its code (status left to an operator); a reused symbol starts today', async () => {
    const d = await applyMasterList(db, 'NSE', [row({ isin: A, code: 'ASTERIND', name: 'Asterion Industries Limited' }), row({ isin: V, code: 'KESTREL', name: 'Velora Foods Limited', listedOn: '2001-01-01' })], '2026-10-08');
    expect(d.removed).toEqual([{ isin: K, code: 'KESTREL' }]);
    expect(d.added).toBe(1);
    expect((await db.query('SELECT status FROM instrument WHERE isin = $1', [K])).rows[0].status).toBe('listed');
    expect((await history(V)).find((h) => h.t === 'code')).toMatchObject({ v: 'KESTREL', valid: '[2026-10-08,)' }); // not from 2001: overlap impossible
    expect(await resolveExchangeCode(db, 'NSE', 'KESTREL', '2026-10-07')).toBe(K);
    expect(await resolveExchangeCode(db, 'NSE', 'KESTREL', '2026-10-08')).toBe(V);
  });

  it('a same-day re-run is idempotent, and a corrected same-day list withdraws today’s rows', async () => {
    const list = [row({ isin: A, code: 'ASTERIND', name: 'Asterion Industries Limited' }), row({ isin: V, code: 'KESTREL', name: 'Velora Foods Limited' })];
    expect(await applyMasterList(db, 'NSE', list, '2026-10-08')).toMatchObject({ added: 0, recoded: 0, renamed: 0, unchanged: 2 });
    await applyMasterList(db, 'NSE', [list[0]!, row({ isin: V, code: 'VELORA', name: 'Velora Foods Limited' })], '2026-10-08');
    expect((await history(V)).filter((h) => h.t === 'code')).toEqual([{ t: 'code', v: 'VELORA', valid: '[2026-10-08,)' }]);
  });

  it('loads BSE-only equities and dual listings without overwriting NSE canonical names',async()=>{
    const bseOnly=isin('E00BSE101');
    const csv=`Scrip Code,Instrument Code,Group Name,Scrip Name,ISIN CODE,Security Type Flag\n500101,AST,A,Asterion Ind.,${A},EQ\n500199,BEACON,MT,Beacon Engines Limited,${bseOnly},EQ`;
    const parsed=parseBseEquityList(csv);if('error' in parsed) throw new Error(parsed.error);
    await applyMasterList(db,'BSE',parsed.rows,'2026-10-09',{sha256:'a'.repeat(64),complete:true});
    expect((await db.query(`SELECT "after" FROM audit_log WHERE action='registry.master_applied' AND entity_id='BSE' ORDER BY id DESC LIMIT 1`)).rows[0].after).toMatchObject({input_sha256:'a'.repeat(64),complete:true,rows:2});
    expect(await resolveExchangeCode(db,'BSE','500101','2026-10-09')).toBe(A);
    expect(await resolveExchangeCode(db,'BSE','500199','2026-10-09')).toBe(bseOnly);
    expect((await history(A)).filter(h=>h.t==='name')).toEqual([{t:'name',v:'Asterion Industries Limited',valid:'[2010-04-01,)'}]);
    expect(new AliasIndex(await loadAliasEntries(db,'2026-10-09')).resolve('Beacon Engines wins an order').isins).toEqual([bseOnly]);
    expect((await db.query('SELECT segment FROM instrument WHERE isin=$1',[bseOnly])).rows[0].segment).toBe('sme');
    expect(await applyMasterList(db,'BSE',parsed.rows,'2026-10-09')).toMatchObject({added:0,recoded:0,renamed:0,unchanged:2});
  });

  it('refuses alias codes mapping to multiple issuers and guards expected ISIN',async()=>{
    await db.query(`INSERT INTO instrument_code (isin,exchange,code,valid) VALUES ($1,'BSE','ASTERIND','[2026-10-08,)')`,[V]);
    const alias={code:'ASTERIND',alias:'Short name',ambiguous:false,commonWord:false,asOf:'2026-10-09',actor:'test'};
    expect(await addCuratedAlias(db,alias)).toHaveProperty('error');
    expect(await addCuratedAlias(db,{...alias,code:A,expectedIsin:V})).toHaveProperty('error');
    await db.query(`DELETE FROM instrument_code WHERE exchange='BSE' AND code='ASTERIND'`);
  });

  it('refuses a list that would close more than five percent of the registry (a truncated download)', async () => {
    const many = Array.from({ length: 120 }, (_, n) => row({ isin: isin(`E00F${String(n).padStart(3, '0')}01`), code: `FIC${n}`, name: `Fiction ${n} Limited` }));
    await applyMasterList(db, 'NSE', many, '2026-10-09');
    await expect(applyMasterList(db, 'NSE', many.slice(0, 40), '2026-10-10')).rejects.toBeInstanceOf(MasterListRefused);
    await expect(applyMasterList(db, 'NSE', many.slice(0, 112), '2026-10-10')).rejects.toBeInstanceOf(MasterListRefused);
    expect(await resolveExchangeCode(db, 'NSE', 'FIC100', '2026-10-10')).not.toBeNull(); // nothing was closed
  });
});
