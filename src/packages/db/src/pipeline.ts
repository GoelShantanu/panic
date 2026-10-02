import type pg from 'pg';
import { newPublicId } from '@stockpanic/core';
import type { AliasEntry, EventTypeCode, SourceKind } from '@stockpanic/core';
import { LIVE_CHANNEL } from './ingestion.ts';

// ---------------------------------------------------------------- job queue (ADR-004)

export interface ClaimedJob {
  id: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

export async function claimJob(db: pg.ClientBase, queue: string, workerId: string): Promise<ClaimedJob | null> {
  const { rows } = await db.query(
    `UPDATE job SET locked_at = now(), locked_by = $2, attempts = attempts + 1
      WHERE id = (SELECT id FROM job
                   WHERE queue = $1 AND completed_at IS NULL AND failed_at IS NULL
                     AND locked_at IS NULL AND run_after <= now()
                   ORDER BY priority DESC, run_after, id
                   FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id, payload, attempts, max_attempts`,
    [queue, workerId],
  );
  const r = rows[0];
  return r ? { id: r.id, payload: r.payload, attempts: r.attempts, maxAttempts: r.max_attempts } : null;
}

export async function completeJob(db: pg.ClientBase, jobId: string): Promise<void> {
  await db.query('UPDATE job SET completed_at = now(), locked_at = NULL, locked_by = NULL, last_error = NULL WHERE id = $1', [jobId]);
}

export const RETRY_BASE_SECONDS = 30;
export const RETRY_MAX_SECONDS = 3600;

export async function failJob(db: pg.ClientBase, job: ClaimedJob, error: string, permanent: boolean): Promise<'retry' | 'failed'> {
  const final = permanent || job.attempts >= job.maxAttempts;
  const backoff = Math.min(RETRY_MAX_SECONDS, RETRY_BASE_SECONDS * 2 ** (job.attempts - 1));
  await db.query(
    `UPDATE job SET locked_at = NULL, locked_by = NULL, last_error = $2,
            failed_at = CASE WHEN $3 THEN now() ELSE NULL END,
            run_after = CASE WHEN $3 THEN run_after ELSE now() + make_interval(secs => $4) END
      WHERE id = $1`,
    [job.id, error.slice(0, 2000), final, backoff],
  );
  return final ? 'failed' : 'retry';
}

// Jobs locked by a worker that died: return them to the queue (system overview F5/F7).
export async function releaseStuckJobs(db: pg.ClientBase, olderThanSeconds: number): Promise<number> {
  const res = await db.query(
    `UPDATE job SET locked_at = NULL, locked_by = NULL, last_error = 'lock expired'
      WHERE locked_at < now() - make_interval(secs => $1) AND completed_at IS NULL AND failed_at IS NULL`,
    [olderThanSeconds],
  );
  return res.rowCount ?? 0;
}

// ---------------------------------------------------------------- items and registry

export interface PipelineItem {
  id: string;
  kind: 'filing' | 'article';
  sourceId: string;
  sourceKind: SourceKind;
  tier: number;
  headline: string;
  publishedAt: Date | null;
  firstSeenAt: Date;
  filing: { exchange: string; scripCode: string; category: string | null } | null;
}

export async function loadPipelineItem(db: pg.ClientBase, itemId: string): Promise<PipelineItem | null> {
  const { rows } = await db.query(
    `SELECT i.id, i.kind, i.source_id, s.kind AS source_kind, s.tier, i.headline, i.published_at, i.first_seen_at,
            f.exchange, f.scrip_code, f.category
       FROM item i JOIN source s USING (source_id) LEFT JOIN filing_detail f ON f.item_id = i.id
      WHERE i.id = $1`,
    [itemId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    kind: r.kind,
    sourceId: r.source_id,
    sourceKind: r.source_kind,
    tier: r.tier,
    headline: r.headline,
    publishedAt: r.published_at,
    firstSeenAt: r.first_seen_at,
    filing: r.exchange ? { exchange: r.exchange, scripCode: r.scrip_code, category: r.category } : null,
  };
}

export async function storyOfItem(db: pg.ClientBase, itemId: string): Promise<string | null> {
  const { rows } = await db.query<{ story_id: string }>('SELECT story_id FROM story_item WHERE item_id = $1', [itemId]);
  return rows[0]?.story_id ?? null;
}

// Names and non-generated aliases valid on the date (entity-resolution.md §5 launch rule).
export async function loadAliasEntries(db: pg.ClientBase, asOf: string): Promise<AliasEntry[]> {
  const { rows } = await db.query(
    `SELECT isin, name AS text, 'name' AS source, false AS ambiguous, false AS common_word
       FROM instrument_name WHERE valid @> $1::date
     UNION ALL
     SELECT isin, alias, 'alias', ambiguous, common_word
       FROM instrument_alias WHERE kind <> 'generated' AND valid @> $1::date`,
    [asOf],
  );
  return rows.map((r) => ({ isin: r.isin.trim(), text: r.text, source: r.source, ambiguous: r.ambiguous, commonWord: r.common_word }));
}

export async function resolveExchangeCode(db: pg.ClientBase, exchange: string, code: string, asOf: string): Promise<string | null> {
  const { rows } = await db.query<{ isin: string }>(
    'SELECT isin FROM instrument_code WHERE exchange = $1 AND code = $2 AND valid @> $3::date',
    [exchange, code, asOf],
  );
  return rows[0]?.isin.trim() ?? null;
}

export interface ItemTag {
  isin: string;
  method: 'exchange_code' | 'rule';
}

export interface ItemAnalysis {
  eventTypes: EventTypeCode[];
  tags: ItemTag[];
  unresolved: string[];
  numbers: string[];
  shingles: string[];
  rulesVersion: string;
}

export async function saveItemAnalysis(db: pg.ClientBase, itemId: string, a: ItemAnalysis): Promise<void> {
  await db.query(
    `INSERT INTO item_analysis (item_id, event_types, tags, unresolved, numbers, shingles, rules_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (item_id) DO UPDATE SET event_types = EXCLUDED.event_types, tags = EXCLUDED.tags,
       unresolved = EXCLUDED.unresolved, numbers = EXCLUDED.numbers, shingles = EXCLUDED.shingles,
       rules_version = EXCLUDED.rules_version, analysed_at = now()`,
    [itemId, a.eventTypes, JSON.stringify(a.tags), a.unresolved, a.numbers, a.shingles, a.rulesVersion],
  );
}

// ---------------------------------------------------------------- stories

export async function candidateStoryIds(db: pg.ClientBase, isins: readonly string[], bands: readonly bigint[], since: Date): Promise<string[]> {
  const { rows } = await db.query<{ story_id: string }>(
    `SELECT st.story_id FROM story_tag st JOIN story s ON s.id = st.story_id
      WHERE st.isin = ANY($1::text[]) AND st.story_first_seen_at >= $3 AND s.merged_into IS NULL
     UNION
     SELECT lb.story_id FROM lsh_band lb JOIN story s ON s.id = lb.story_id
      WHERE lb.band_hash = ANY($2::bigint[]) AND lb.expires_at > now() AND s.merged_into IS NULL`,
    [isins, bands.map(String), since],
  );
  return rows.map((r) => r.story_id);
}

export interface StoryItem {
  storyId: string;
  itemId: string;
  kind: 'filing' | 'article';
  sourceId: string;
  tier: number;
  headline: string;
  at: Date; // published time if known, else first seen
  exchange: string | null;
  analysis: ItemAnalysis;
}

export async function loadStoryItems(db: pg.ClientBase, storyIds: readonly string[]): Promise<StoryItem[]> {
  if (storyIds.length === 0) return [];
  const { rows } = await db.query(
    `SELECT si.story_id, i.id, i.kind, i.source_id, s.tier, i.headline, coalesce(i.published_at, i.first_seen_at) AS at,
            f.exchange, a.event_types, a.tags, a.unresolved, a.numbers, a.shingles, a.rules_version
       FROM story_item si
       JOIN item i ON i.id = si.item_id
       JOIN source s ON s.source_id = i.source_id
       JOIN item_analysis a ON a.item_id = i.id
       LEFT JOIN filing_detail f ON f.item_id = i.id
      WHERE si.story_id = ANY($1::bigint[])
      ORDER BY at, i.id`,
    [storyIds],
  );
  return rows.map((r) => ({
    storyId: r.story_id,
    itemId: r.id,
    kind: r.kind,
    sourceId: r.source_id,
    tier: r.tier,
    headline: r.headline,
    at: r.at,
    exchange: r.exchange,
    analysis: {
      eventTypes: r.event_types,
      tags: r.tags,
      unresolved: r.unresolved,
      numbers: r.numbers,
      shingles: r.shingles,
      rulesVersion: r.rules_version,
    },
  }));
}

export async function createStory(db: pg.ClientBase, itemId: string, firstSeenAt: Date): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'INSERT INTO story (public_id, first_seen_at, primary_item_id) VALUES ($1, $2, $3) RETURNING id',
    [newPublicId('st'), firstSeenAt, itemId],
  );
  const storyId = rows[0]!.id;
  await db.query('INSERT INTO story_item (item_id, story_id) VALUES ($1, $2)', [itemId, storyId]);
  return storyId;
}

export async function addItemToStory(db: pg.ClientBase, storyId: string, itemId: string): Promise<void> {
  await db.query('INSERT INTO story_item (item_id, story_id) VALUES ($1, $2)', [itemId, storyId]);
}

export interface StoryDerived {
  primaryItemId: string;
  sourceCount: number;
  eventTypes: EventTypeCode[];
  tags: ItemTag[];
  unresolved: string[];
}

// Replaces derived rows; operator tags are never overwritten (PRD-002 US-002.11).
export async function setStoryDerived(db: pg.ClientBase, storyId: string, d: StoryDerived): Promise<void> {
  await db.query('UPDATE story SET primary_item_id = $2, source_count = $3, updated_at = now() WHERE id = $1', [
    storyId,
    d.primaryItemId,
    d.sourceCount,
  ]);
  await db.query('DELETE FROM story_event_type WHERE story_id = $1', [storyId]);
  for (const code of d.eventTypes) {
    await db.query(`INSERT INTO story_event_type (story_id, code, source) VALUES ($1, $2, 'rule')`, [storyId, code]);
  }
  await db.query(`DELETE FROM story_tag WHERE story_id = $1 AND method <> 'operator'`, [storyId]);
  for (const t of d.tags) {
    await db.query(
      `INSERT INTO story_tag (story_id, isin, method, confidence) VALUES ($1, $2, $3, 1)
       ON CONFLICT (story_id, isin) DO NOTHING`,
      [storyId, t.isin, t.method],
    );
  }
  await db.query('DELETE FROM story_unresolved_mention WHERE story_id = $1', [storyId]);
  for (const m of d.unresolved) {
    await db.query('INSERT INTO story_unresolved_mention (story_id, mention) VALUES ($1, $2) ON CONFLICT DO NOTHING', [storyId, m]);
  }
}

export async function saveStoryBands(db: pg.ClientBase, storyId: string, bands: readonly bigint[], expiresAt: Date): Promise<void> {
  for (const band of bands) {
    await db.query(
      `INSERT INTO lsh_band (band_hash, story_id, expires_at) VALUES ($1, $2, $3)
       ON CONFLICT (band_hash, story_id) DO UPDATE SET expires_at = greatest(lsh_band.expires_at, EXCLUDED.expires_at)`,
      [String(band), storyId, expiresAt],
    );
  }
}

export async function sweepExpiredBands(db: pg.ClientBase): Promise<number> {
  return (await db.query('DELETE FROM lsh_band WHERE expires_at <= now()')).rowCount ?? 0;
}

export async function emitStoryEvent(db: pg.ClientBase, type: 'story.created' | 'story.updated', storyId: string): Promise<void> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO live_event (type, payload)
     SELECT $1, jsonb_build_object('story_id', public_id) FROM story WHERE id = $2
     RETURNING id`,
    [type, storyId],
  );
  await db.query('SELECT pg_notify($1, $2)', [LIVE_CHANNEL, rows[0]!.id]);
}

export async function clusterThresholds(db: pg.ClientBase): Promise<{ merge: number; attach: number }> {
  const { rows } = await db.query<{ key: string; value: number }>(
    `SELECT key, (value #>> '{}')::float8 AS value FROM setting WHERE key IN ('cluster_merge_threshold', 'cluster_attach_threshold')`,
  );
  const get = (k: string) => {
    const v = rows.find((r) => r.key === k)?.value;
    if (v === undefined) throw new Error(`setting ${k} missing`);
    return v;
  };
  return { merge: get('cluster_merge_threshold'), attach: get('cluster_attach_threshold') };
}
