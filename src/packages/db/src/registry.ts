// Instrument registry upkeep from exchange master lists (entity-resolution.md §2.2, ADR-001; D-049).
// A daily list is diffed against what is valid today. Changes close the old validity row and open
// a new one; history is never overwritten.

import type pg from 'pg';
import { normaliseForMatch } from '@stockpanic/core';
import type { MasterRow } from '@stockpanic/core';

export interface MasterDiff {
  exchange: 'NSE' | 'BSE';
  asOf: string;
  added: number;
  recoded: number;
  renamed: number;
  resegmented: number;
  unchanged: number;
  // On the exchange yesterday, absent today: the code is closed; status is left to an operator
  // (suspension, delisting and a move to the other exchange look the same in a master list).
  removed: { isin: string; code: string }[];
}

export class MasterListRefused extends Error {}

// A truncated download must not close half the registry.
const MIN_SHARE_OF_CURRENT = 0.5;

const LOCK_KEY = 0x5245_4749; // 'REGI'

export async function applyMasterList(db: pg.ClientBase, exchange: 'NSE' | 'BSE', rows: readonly MasterRow[], asOf: string): Promise<MasterDiff> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new MasterListRefused(`bad date ${asOf}`);
  await db.query('BEGIN');
  try {
    await db.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
    const codes = await db.query<{ id: string; isin: string; code: string; lower: string }>(
      `SELECT id, isin::text, code, lower(valid)::text AS lower FROM instrument_code WHERE exchange = $1 AND valid @> $2::date`,
      [exchange, asOf],
    );
    if (codes.rows.length > 100 && rows.length < codes.rows.length * MIN_SHARE_OF_CURRENT) {
      throw new MasterListRefused(`list has ${rows.length} rows but ${codes.rows.length} ${exchange} codes are current; refusing a partial list`);
    }
    const names = await db.query<{ id: string; isin: string; name: string; lower: string }>(
      `SELECT id, isin::text, name, lower(valid)::text AS lower FROM instrument_name WHERE kind = 'legal' AND valid @> $1::date`,
      [asOf],
    );
    const known = new Map((await db.query<{ isin: string; segment: string }>('SELECT isin::text, segment FROM instrument')).rows.map((r) => [r.isin.trim(), r.segment]));
    const codeOf = new Map(codes.rows.map((r) => [r.isin.trim(), r]));
    const nameOf = new Map(names.rows.map((r) => [r.isin.trim(), r]));
    const diff: MasterDiff = { exchange, asOf, added: 0, recoded: 0, renamed: 0, resegmented: 0, unchanged: 0, removed: [] };

    // Close a validity row at asOf; a row opened today is simply withdrawn (a same-day re-run).
    const close = async (table: 'instrument_code' | 'instrument_name', id: string, lower: string) => {
      if (lower >= asOf) await db.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
      else await db.query(`UPDATE ${table} SET valid = daterange(lower(valid), $2::date) WHERE id = $1`, [id, asOf]);
    };

    // 1. Codes that disappear or change are closed first, so a reused symbol can open below.
    const listed = new Map(rows.map((r) => [r.isin, r]));
    for (const [isin, cur] of codeOf) {
      const row = listed.get(isin);
      if (!row) {
        await close('instrument_code', cur.id, cur.lower);
        diff.removed.push({ isin, code: cur.code });
      } else if (row.code !== cur.code) await close('instrument_code', cur.id, cur.lower);
    }

    // 2. New instruments, new codes, new names.
    for (const r of rows) {
      const isNew = !known.has(r.isin);
      // First sight of an instrument: its current symbol and name are taken as valid from listing.
      // That is an assumption about history the list cannot show (recorded in D-049).
      const since = isNew && r.listedOn && r.listedOn < asOf ? r.listedOn : asOf;
      if (isNew) {
        await db.query('INSERT INTO instrument (isin, segment, listed_on) VALUES ($1, $2, $3)', [r.isin, r.segment, r.listedOn]);
        known.set(r.isin, r.segment);
        diff.added++;
      } else if (known.get(r.isin) !== r.segment) {
        await db.query('UPDATE instrument SET segment = $2 WHERE isin = $1', [r.isin, r.segment]);
        diff.resegmented++;
      }
      let changed = isNew;
      const cur = codeOf.get(r.isin);
      if (!cur || cur.code !== r.code) {
        // A code another instrument held until today starts today, never earlier.
        const reused = (await db.query('SELECT 1 FROM instrument_code WHERE exchange = $1 AND code = $2 AND upper(valid) > $3::date LIMIT 1', [exchange, r.code, since])).rows.length > 0;
        await db.query(`INSERT INTO instrument_code (isin, exchange, code, valid) VALUES ($1, $2, $3, daterange($4::date, NULL))`, [r.isin, exchange, r.code, reused ? asOf : since]);
        if (cur) diff.recoded++;
        changed = true;
      }
      const curName = nameOf.get(r.isin);
      if (!curName || curName.name !== r.name) {
        if (curName) {
          await close('instrument_name', curName.id, curName.lower);
          diff.renamed++;
        }
        await db.query(`INSERT INTO instrument_name (isin, kind, name, valid) VALUES ($1, 'legal', $2, daterange($3::date, NULL))`, [r.isin, r.name, curName ? asOf : since]);
        changed = true;
      }
      if (!changed) diff.unchanged++;
    }

    await db.query(
      `INSERT INTO audit_log (actor_type, action, entity_type, entity_id, after) VALUES ('system', 'registry.master_applied', 'registry', $1, $2)`,
      [exchange, JSON.stringify({ as_of: asOf, rows: rows.length, added: diff.added, recoded: diff.recoded, renamed: diff.renamed, resegmented: diff.resegmented, removed: diff.removed.length })],
    );
    await db.query('COMMIT');
    return diff;
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

// Curated aliases (entity-resolution.md §2.3): short and colloquial names ("Infy", "RIL"), seeded by
// the founder and grown from operator corrections. `ambiguous` makes the text an unresolved mention
// whenever it is found, which is how a name shared after a demerger is kept from guessing.
export async function addCuratedAlias(
  db: pg.ClientBase,
  a: { code: string; alias: string; ambiguous: boolean; commonWord: boolean; asOf: string; actor: string },
): Promise<{ isin: string } | { error: string }> {
  const { rows } = await db.query<{ isin: string }>(
    `SELECT isin::text FROM instrument WHERE isin = upper($1)
     UNION SELECT isin::text FROM instrument_code WHERE code = upper($1) AND valid @> $2::date LIMIT 1`,
    [a.code, a.asOf],
  );
  const isin = rows[0]?.isin.trim();
  if (!isin) return { error: `no instrument for ${a.code}` };
  const norm = normaliseForMatch(a.alias);
  if (!norm) return { error: 'empty alias' };
  await db.query('BEGIN');
  try {
    await db.query(
      `INSERT INTO instrument_alias (isin, alias, alias_norm, kind, ambiguous, common_word, valid)
       VALUES ($1, $2, $3, 'curated', $4, $5, daterange($6::date, NULL))
       ON CONFLICT DO NOTHING`,
      [isin, a.alias, norm, a.ambiguous, a.commonWord, a.asOf],
    );
    await db.query(
      `INSERT INTO audit_log (actor_type, action, entity_type, entity_id, after) VALUES ('system', 'registry.alias_added', 'instrument', $1, $2)`,
      [isin, JSON.stringify({ alias: a.alias, ambiguous: a.ambiguous, common_word: a.commonWord, by: a.actor })],
    );
    await db.query('COMMIT');
    return { isin };
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}
