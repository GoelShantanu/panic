import type pg from 'pg';
import { newPublicId, parseCadence } from '@stockpanic/core';
import type { Cadence, HealthState, SessionType, SourceKind } from '@stockpanic/core';

export interface SourceRow {
  sourceId: string;
  name: string;
  kind: SourceKind;
  tier: number;
  excerptAllowed: boolean;
  adapter: Record<string, unknown>;
  cadence: Cadence;
  health: {
    state: HealthState;
    lastSuccessAt: Date | null;
    consecutiveFailures: number;
    trackingSince: Date;
  };
  fetch: {
    etag: string | null;
    lastModified: string | null;
    nextFetchAt: Date | null;
    lastNewItemAt: Date | null;
  };
}

export async function listEnabledSources(db: pg.ClientBase): Promise<SourceRow[]> {
  await db.query(
    `INSERT INTO source_health (source_id) SELECT source_id FROM source WHERE enabled
     ON CONFLICT (source_id) DO NOTHING`,
  );
  await db.query(
    `INSERT INTO source_fetch_state (source_id) SELECT source_id FROM source WHERE enabled
     ON CONFLICT (source_id) DO NOTHING`,
  );
  const { rows } = await db.query(
    `SELECT s.source_id, s.name, s.kind, s.tier, s.excerpt_allowed, s.adapter, s.cadence,
            h.state, h.last_success_at, h.consecutive_failures, h.tracking_since,
            f.etag, f.last_modified, f.next_fetch_at, f.last_new_item_at
       FROM source s
       JOIN source_health h USING (source_id)
       JOIN source_fetch_state f USING (source_id)
      WHERE s.enabled
      ORDER BY s.source_id`,
  );
  return rows.map((r) => ({
    sourceId: r.source_id,
    name: r.name,
    kind: r.kind,
    tier: r.tier,
    excerptAllowed: r.excerpt_allowed,
    adapter: r.adapter,
    cadence: parseCadence(r.cadence),
    health: {
      state: r.state,
      lastSuccessAt: r.last_success_at,
      consecutiveFailures: r.consecutive_failures,
      trackingSince: r.tracking_since,
    },
    fetch: {
      etag: r.etag,
      lastModified: r.last_modified,
      nextFetchAt: r.next_fetch_at,
      lastNewItemAt: r.last_new_item_at,
    },
  }));
}

// Session from the trading calendar (system overview M1). No calendar row → 'closed'
// with calendarMissing = true, so the caller can alert; never a guessed 'open'.
export async function currentSession(db: pg.ClientBase, now: Date): Promise<{ session: SessionType; calendarMissing: boolean }> {
  const { rows } = await db.query<{ session: SessionType }>(
    `SELECT session FROM trading_session
      WHERE tstzrange(starts_at, ends_at) @> $1::timestamptz
      ORDER BY starts_at DESC LIMIT 1`,
    [now],
  );
  const row = rows[0];
  return row ? { session: row.session, calendarMissing: false } : { session: 'closed', calendarMissing: true };
}

export interface CandidateRow {
  kind: 'filing' | 'article';
  dedupKey: string;
  headline: string;
  url: string;
  publishedAt: Date | null;
  excerpt: string | null;
}

export const PIPELINE_QUEUE = 'pipeline';

// Filings and regulator items outrank articles in the pipeline queue (system overview F9).
export function pipelinePriority(sourceKind: SourceKind): number {
  return sourceKind === 'article' ? 0 : 10;
}

// One transaction per item: the item and its pipeline job commit together (ingestion.md §6).
export async function storeCandidates(
  db: pg.ClientBase,
  source: { sourceId: string; kind: SourceKind; excerptAllowed: boolean },
  candidates: readonly CandidateRow[],
): Promise<{ inserted: number; duplicates: number }> {
  let inserted = 0;
  let duplicates = 0;
  for (const c of candidates) {
    await db.query('BEGIN');
    try {
      const res = await db.query<{ id: string }>(
        `INSERT INTO item (public_id, kind, source_id, dedup_key, headline, url, published_at, excerpt)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (source_id, dedup_key) DO NOTHING
         RETURNING id`,
        [newPublicId('it'), c.kind, source.sourceId, c.dedupKey, c.headline, c.url, c.publishedAt, source.excerptAllowed ? c.excerpt : null],
      );
      const row = res.rows[0];
      if (row) {
        await db.query('INSERT INTO job (queue, priority, payload) VALUES ($1, $2, $3)', [
          PIPELINE_QUEUE,
          pipelinePriority(source.kind),
          { item_id: row.id },
        ]);
        inserted++;
      } else {
        duplicates++;
      }
      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
  }
  return { inserted, duplicates };
}

export interface FetchRecord {
  ok: boolean;
  error: string | null;
  etag: string | null;
  lastModified: string | null;
  newItems: number;
  nextFetchAt: Date;
}

export async function recordFetch(db: pg.ClientBase, sourceId: string, at: Date, rec: FetchRecord): Promise<number> {
  const { rows } = await db.query<{ consecutive_failures: number }>(
    `UPDATE source_health
        SET last_attempt_at = $2,
            last_success_at = CASE WHEN $3 THEN $2 ELSE last_success_at END,
            consecutive_failures = CASE WHEN $3 THEN 0 ELSE consecutive_failures + 1 END,
            last_error = CASE WHEN $3 THEN NULL ELSE $4 END
      WHERE source_id = $1
      RETURNING consecutive_failures`,
    [sourceId, at, rec.ok, rec.error],
  );
  await db.query(
    `UPDATE source_fetch_state
        SET etag = CASE WHEN $2 THEN coalesce($3, etag) ELSE etag END,
            last_modified = CASE WHEN $2 THEN coalesce($4, last_modified) ELSE last_modified END,
            last_new_item_at = CASE WHEN $5 > 0 THEN $6 ELSE last_new_item_at END,
            next_fetch_at = $7,
            updated_at = now()
      WHERE source_id = $1`,
    [sourceId, rec.ok, rec.etag, rec.lastModified, rec.newItems, at, rec.nextFetchAt],
  );
  return rows[0]?.consecutive_failures ?? 0;
}

export const LIVE_CHANNEL = 'story_events'; // ADR-004

// A health change writes the new state, a live event for clients (ADR-005) and an audit row
// (GUARDRAILS §4.8), atomically.
export async function setHealthState(db: pg.ClientBase, sourceId: string, previous: HealthState, next: HealthState, at: Date): Promise<void> {
  await db.query('BEGIN');
  try {
    await db.query('UPDATE source_health SET state = $2, changed_at = $3 WHERE source_id = $1', [sourceId, next, at]);
    const ev = await db.query<{ id: string }>(
      `INSERT INTO live_event (type, payload) VALUES ('source.health', $1) RETURNING id`,
      [{ source_id: sourceId, health: next }],
    );
    await db.query('SELECT pg_notify($1, $2)', [LIVE_CHANNEL, ev.rows[0]!.id]);
    await db.query(
      `INSERT INTO audit_log (actor_type, action, entity_type, entity_id, before, after)
       VALUES ('system', 'source.health_changed', 'source', $1, $2, $3)`,
      [sourceId, { state: previous }, { state: next }],
    );
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}
