// Filings storage: upsert with revisions and withdrawals, push inbox, reconciliation (ingestion.md §3).

import type pg from 'pg';
import { filingDedupKey, newPublicId } from '@stockpanic/core';
import type { FilingEnvelope } from '@stockpanic/core';
import { PIPELINE_QUEUE } from './ingestion.ts';

export type UpsertOutcome = 'inserted' | 'duplicate' | 'revised' | 'withdrawn';

const FILING_PRIORITY = 10; // system overview F9

// One transaction per filing. (exchange, announcement_id) is the identity whichever source delivers it.
// `backfill`: found by reconciliation, not by the live feed (ingestion.md §3.1).
export async function upsertFiling(db: pg.ClientBase, sourceId: string, e: FilingEnvelope, now: Date, opts: { backfill?: boolean } = {}): Promise<UpsertOutcome> {
  await db.query('BEGIN');
  try {
    const { rows } = await db.query(
      `SELECT i.id, i.headline, i.url, i.published_at, i.status, f.category, f.attachment_url, f.scrip_code
         FROM filing_detail f JOIN item i ON i.id = f.item_id
        WHERE f.exchange = $1 AND f.announcement_id = $2 FOR UPDATE`,
      [e.exchange, e.announcementId],
    );
    const cur = rows[0];
    let outcome: UpsertOutcome;
    if (!cur) {
      const ins = await db.query(
        `INSERT INTO item (public_id, kind, source_id, dedup_key, headline, url, published_at, first_seen_at, status)
         VALUES ($1, 'filing', $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [newPublicId('it'), sourceId, filingDedupKey(e), e.subject, e.url, e.publishedAt, now, e.status === 'withdrawn' ? 'withdrawn_by_exchange' : 'live'],
      );
      const itemId = ins.rows[0].id;
      await db.query(
        `INSERT INTO filing_detail (item_id, exchange, announcement_id, scrip_code, category, attachment_url) VALUES ($1, $2, $3, $4, $5, $6)`,
        [itemId, e.exchange, e.announcementId, e.scripCode, e.category, e.attachmentUrl],
      );
      if (opts.backfill) await db.query('INSERT INTO reconciliation_backfill (item_id, backfilled_at) VALUES ($1, $2)', [itemId, now]);
      await db.query('INSERT INTO job (queue, priority, payload) VALUES ($1, $2, $3)', [PIPELINE_QUEUE, FILING_PRIORITY, { item_id: itemId }]);
      outcome = 'inserted';
    } else {
      const status = e.status === 'withdrawn' ? 'withdrawn_by_exchange' : cur.status === 'withdrawn_by_exchange' ? 'withdrawn_by_exchange' : cur.status;
      const same =
        cur.headline === e.subject && cur.url === e.url && cur.category === e.category && cur.attachment_url === e.attachmentUrl &&
        cur.scrip_code === e.scripCode && new Date(cur.published_at).getTime() === e.publishedAt.getTime() && cur.status === status;
      if (same) outcome = 'duplicate';
      else {
        // PRD-002 §9: same item, revision recorded; a withdrawal is never undone or deleted.
        await db.query('INSERT INTO item_revision (item_id, revised_at, previous) VALUES ($1, $2, $3)', [
          cur.id,
          now,
          { headline: cur.headline, url: cur.url, published_at: cur.published_at, status: cur.status, category: cur.category, attachment_url: cur.attachment_url, scrip_code: cur.scrip_code },
        ]);
        await db.query('UPDATE item SET headline = $2, url = $3, published_at = $4, status = $5 WHERE id = $1', [cur.id, e.subject, e.url, e.publishedAt, status]);
        await db.query(
          `UPDATE filing_detail SET category = $2, attachment_url = $3, scrip_code = $4,
                  extracted_text = CASE WHEN attachment_url IS DISTINCT FROM $3 THEN NULL ELSE extracted_text END
            WHERE item_id = $1`,
          [cur.id, e.category, e.attachmentUrl, e.scripCode],
        );
        // A summary of the old document no longer describes the filing; the AI job regenerates it.
        if (cur.attachment_url !== e.attachmentUrl) await db.query('DELETE FROM story_summary WHERE source_item_id = $1', [cur.id]);
        await db.query('INSERT INTO job (queue, priority, payload) VALUES ($1, $2, $3)', [PIPELINE_QUEUE, FILING_PRIORITY, { item_id: cur.id, revised: true }]);
        outcome = status === 'withdrawn_by_exchange' && cur.status !== 'withdrawn_by_exchange' ? 'withdrawn' : 'revised';
      }
    }
    await db.query('COMMIT');
    return outcome;
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

// ---------------------------------------------------------------- push inbox

export async function insertInbox(db: pg.ClientBase, sourceId: string, payload: unknown, now: Date): Promise<string> {
  const { rows } = await db.query('INSERT INTO raw_inbox (source_id, received_at, payload) VALUES ($1, $2, $3) RETURNING id', [sourceId, now, JSON.stringify(payload)]);
  return String(rows[0].id);
}

export async function pendingInbox(db: pg.ClientBase, limit: number): Promise<{ id: string; sourceId: string; payload: unknown }[]> {
  const { rows } = await db.query(`SELECT id, source_id, payload FROM raw_inbox WHERE processed_at IS NULL ORDER BY received_at, id LIMIT $1`, [limit]);
  return rows.map((r) => ({ id: String(r.id), sourceId: r.source_id, payload: r.payload }));
}

export async function markInboxProcessed(db: pg.ClientBase, id: string, now: Date): Promise<void> {
  await db.query('UPDATE raw_inbox SET processed_at = $2 WHERE id = $1', [id, now]);
}

export async function pushSource(db: pg.ClientBase, sourceId: string): Promise<{ secretEnv: string } | null> {
  const { rows } = await db.query(`SELECT adapter FROM source WHERE source_id = $1 AND enabled AND kind = 'filing' AND adapter->>'type' = 'filings_push'`, [sourceId]);
  const env = rows[0]?.adapter?.secret_env;
  return typeof env === 'string' ? { secretEnv: env } : null;
}

// ---------------------------------------------------------------- poll cursor and reconciliation

export async function filingsCursor(db: pg.ClientBase, sourceId: string): Promise<string | null> {
  const { rows } = await db.query('SELECT cursor FROM source_fetch_state WHERE source_id = $1', [sourceId]);
  return rows[0]?.cursor ?? null;
}

export async function setFilingsCursor(db: pg.ClientBase, sourceId: string, cursor: string | null): Promise<void> {
  if (cursor !== null) await db.query('UPDATE source_fetch_state SET cursor = $2 WHERE source_id = $1', [sourceId, cursor]);
}

// Filings already held for an exchange and IST date, by announcement ID.
export async function heldAnnouncements(db: pg.ClientBase, exchange: string, istDate: string): Promise<Set<string>> {
  const { rows } = await db.query(
    `SELECT f.announcement_id FROM filing_detail f JOIN item i ON i.id = f.item_id
      WHERE f.exchange = $1 AND (i.published_at AT TIME ZONE 'Asia/Kolkata')::date = $2::date`,
    [exchange, istDate],
  );
  return new Set(rows.map((r) => r.announcement_id));
}

export async function recordReconciliation(db: pg.ClientBase, r: { exchange: string; forDate: string; expected: number; ingested: number; backfilled: number; at: Date }): Promise<number> {
  const { rows } = await db.query(
    `INSERT INTO reconciliation_run (exchange, for_date, run_at, expected, ingested, backfilled) VALUES ($1, $2, $3, $4, $5, $6) RETURNING coverage::float8 AS coverage`,
    [r.exchange, r.forDate, r.at, r.expected, r.ingested, r.backfilled],
  );
  return rows[0].coverage;
}

// ingestion.md §3 rule 5: first_seen_at − published_at, p50/p95 by session type, for one IST date.
export async function filingLatency(db: pg.ClientBase, istDate: string) {
  const { rows } = await db.query(
    `SELECT coalesce(ts.session::text, 'unknown') AS session, count(*)::int AS filings,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM i.first_seen_at - i.published_at))::float8 AS p50_s,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM i.first_seen_at - i.published_at))::float8 AS p95_s
       FROM item i
       LEFT JOIN trading_session ts ON tstzrange(ts.starts_at, ts.ends_at) @> i.published_at
      WHERE i.kind = 'filing' AND i.published_at IS NOT NULL AND (i.published_at AT TIME ZONE 'Asia/Kolkata')::date = $1::date
        AND NOT EXISTS (SELECT 1 FROM reconciliation_backfill b WHERE b.item_id = i.id) -- found late by design
      GROUP BY 1 ORDER BY 1`,
    [istDate],
  );
  return rows;
}
