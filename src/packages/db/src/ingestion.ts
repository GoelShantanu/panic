import type pg from 'pg';
import { newPublicId, parseCadence } from '@stockpanic/core';
import type { ArticleScope, Cadence, HealthState, RelevanceResult, SessionType, SourceKind } from '@stockpanic/core';

export interface SourceRow {
  sourceId: string;
  name: string;
  kind: SourceKind;
  tier: number;
  excerptAllowed: boolean;
  articleScope: ArticleScope;
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
    `SELECT s.source_id, s.name, s.kind, s.tier, s.excerpt_allowed, s.article_scope, s.adapter, s.cadence,
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
    articleScope: r.article_scope,
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
  relevance?: RelevanceResult;
}

export const PIPELINE_QUEUE = 'pipeline';

export interface PendingRelevanceCandidate {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceScope: ArticleScope;
  headline: string;
  url: string;
  confidence: number;
  reason: string;
  createdAt: Date;
}

export async function listPendingRelevance(db: pg.ClientBase, limit = 100): Promise<PendingRelevanceCandidate[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('limit must be an integer from 1 to 500');
  const { rows } = await db.query(
    `SELECT c.id::text, c.source_id, s.name AS source_name, c.source_scope, c.headline, c.url,
            c.confidence, c.reason, c.created_at
       FROM article_relevance_candidate c JOIN source s USING (source_id)
      WHERE c.classification = 'review' AND c.reviewed_decision IS NULL
      ORDER BY c.created_at, c.id LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id, sourceId: r.source_id, sourceName: r.source_name, sourceScope: r.source_scope,
    headline: r.headline, url: r.url, confidence: Number(r.confidence), reason: r.reason, createdAt: r.created_at,
  }));
}

export async function reviewRelevanceCandidate(
  db: pg.ClientBase,
  id: string,
  decision: 'keep' | 'discard',
  reviewer: string,
): Promise<'reviewed' | 'not_pending' | 'not_found'> {
  if (!/^\d+$/.test(id)) throw new Error('candidate id must be a positive integer');
  if (!reviewer.trim()) throw new Error('reviewer is required');
  await db.query('BEGIN');
  try {
    const { rows } = await db.query(
      `SELECT c.id, c.source_id, c.dedup_key, c.headline, c.url, c.published_at, c.excerpt,
              c.classification, c.reviewed_decision, s.excerpt_allowed, s.kind
         FROM article_relevance_candidate c JOIN source s USING (source_id)
        WHERE c.id = $1 FOR UPDATE OF c`,
      [id],
    );
    const candidate = rows[0];
    if (!candidate) {
      await db.query('ROLLBACK');
      return 'not_found';
    }
    if (candidate.classification !== 'review' || candidate.reviewed_decision !== null) {
      await db.query('ROLLBACK');
      return 'not_pending';
    }
    if (decision === 'keep') {
      const inserted = await db.query<{ id: string }>(
        `INSERT INTO item (public_id, kind, source_id, dedup_key, headline, url, published_at, excerpt)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (source_id, dedup_key) DO NOTHING RETURNING id`,
        [newPublicId('it'), candidate.kind, candidate.source_id, candidate.dedup_key, candidate.headline,
          candidate.url, candidate.published_at, candidate.excerpt_allowed ? candidate.excerpt : null],
      );
      let itemId = inserted.rows[0]?.id;
      if (itemId) {
        await db.query('INSERT INTO job (queue, priority, payload) VALUES ($1, $2, $3)', [PIPELINE_QUEUE, pipelinePriority(candidate.kind), { item_id: itemId }]);
      } else {
        const existing = await db.query<{ id: string }>('SELECT id FROM item WHERE source_id = $1 AND dedup_key = $2', [candidate.source_id, candidate.dedup_key]);
        itemId = existing.rows[0]?.id;
      }
      await db.query(
        `UPDATE article_relevance_candidate SET reviewed_decision = $2, reviewed_at = now(), reviewed_by = $3, item_id = $4 WHERE id = $1`,
        [id, decision, reviewer.trim(), itemId ?? null],
      );
    } else {
      await db.query(
        `UPDATE article_relevance_candidate SET reviewed_decision = $2, reviewed_at = now(), reviewed_by = $3 WHERE id = $1`,
        [id, decision, reviewer.trim()],
      );
    }
    await db.query('COMMIT');
    return 'reviewed';
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

/** Correct a relevance decision after publication, preserving the item and story. */
export async function reviewPublishedArticle(
  db: pg.ClientBase, itemPublicId: string, decision: 'keep' | 'discard', reviewer: string, reason: string,
): Promise<boolean> {
  if (!reviewer.trim() || !reason.trim()) throw new Error('reviewer and reason are required');
  await db.query('BEGIN');
  try {
    const { rows } = await db.query(
      `SELECT c.* FROM article_relevance_candidate c JOIN item i ON i.id = c.item_id
        WHERE i.public_id = $1 AND i.kind = 'article' FOR UPDATE OF c`, [itemPublicId],
    );
    const candidate = rows[0];
    if (!candidate) { await db.query('ROLLBACK'); return false; }
    await db.query(
      `UPDATE article_relevance_candidate SET classification = 'review', reviewed_decision = $2,
        reviewed_at = now(), reviewed_by = $3 WHERE id = $1`, [candidate.id, decision, reviewer.trim()],
    );
    await db.query(
      `INSERT INTO audit_log (actor_type, action, entity_type, entity_id, before, after)
        VALUES ('system', 'article.relevance_corrected', 'item', $1, $2, $3)`,
      [itemPublicId, candidate, { decision, reviewer: reviewer.trim(), reason: reason.trim() }],
    );
    await db.query('COMMIT');
    return true;
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

// Filings and regulator items outrank articles in the pipeline queue (system overview F9).
export function pipelinePriority(sourceKind: SourceKind): number {
  return sourceKind === 'article' ? 0 : 10;
}

// One transaction per item: the item and its pipeline job commit together (ingestion.md §6).
export async function storeCandidates(
  db: pg.ClientBase,
  source: { sourceId: string; kind: SourceKind; excerptAllowed: boolean; articleScope?: ArticleScope },
  candidates: readonly CandidateRow[],
): Promise<{ inserted: number; duplicates: number; heldForReview: number; discardedIrrelevant: number }> {
  let inserted = 0;
  let duplicates = 0;
  let heldForReview = 0;
  let discardedIrrelevant = 0;
  for (const c of candidates) {
    // Non-RSS internal callers already supply reviewed candidates; external RSS always carries a
    // classification from toCandidates before reaching this storage boundary.
    const relevance = c.relevance ?? { decision: 'keep' as const, confidence: 1, reason: 'internal candidate', rulesVersion: 'market-v1' as const };
    await db.query('BEGIN');
    try {
      const decision = await db.query<{ id: string }>(
        `INSERT INTO article_relevance_candidate
           (source_id, dedup_key, headline, url, published_at, excerpt, source_scope, rules_version, classification, confidence, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (source_id, dedup_key) DO NOTHING RETURNING id`,
        [source.sourceId, c.dedupKey, c.headline, c.url, c.publishedAt, source.excerptAllowed ? c.excerpt : null, source.articleScope ?? 'general', relevance.rulesVersion, relevance.decision, relevance.confidence, relevance.reason],
      );
      if (!decision.rows[0]) {
        duplicates++;
        await db.query('COMMIT');
        continue;
      }
      if (relevance.decision === 'discard') {
        discardedIrrelevant++;
        await db.query('COMMIT');
        continue;
      }
      if (relevance.decision === 'review') {
        heldForReview++;
        await db.query('COMMIT');
        continue;
      }
      const res = await db.query<{ id: string }>(
        `INSERT INTO item (public_id, kind, source_id, dedup_key, headline, url, published_at, excerpt)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (source_id, dedup_key) DO NOTHING
         RETURNING id`,
        [newPublicId('it'), c.kind, source.sourceId, c.dedupKey, c.headline, c.url, c.publishedAt, source.excerptAllowed ? c.excerpt : null],
      );
      const row = res.rows[0];
      if (row) {
        await db.query('UPDATE article_relevance_candidate SET item_id = $2 WHERE id = $1', [decision.rows[0].id, row.id]);
        await db.query('INSERT INTO job (queue, priority, payload) VALUES ($1, $2, $3)', [
          PIPELINE_QUEUE,
          pipelinePriority(source.kind),
          { item_id: row.id },
        ]);
        inserted++;
      } else {
        duplicates++;
        const existing = await db.query<{ id: string }>('SELECT id FROM item WHERE source_id = $1 AND dedup_key = $2', [source.sourceId, c.dedupKey]);
        if (existing.rows[0]) await db.query('UPDATE article_relevance_candidate SET item_id = $2 WHERE id = $1', [decision.rows[0].id, existing.rows[0].id]);
      }
      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
  }
  return { inserted, duplicates, heldForReview, discardedIrrelevant };
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

// RSS poll intervals per session, ingestion.md §7: 60 s while the market trades, 5 min otherwise.
// Every session expects successful fetches, so a feed that stops answering turns stale after three
// intervals and down after ten (the per-source staleness alarm, WORKFLOW §10).
const RSS_CADENCE = { pre_open: 60, open: 60, special: 60, halted: 60, closed: 300, holiday: 300 } as const;

export interface NewRssSource {
  sourceId: string;
  name: string;
  tier: number;
  articleScope: ArticleScope;
  url: string;
  // Where the publisher's terms were read (PRD-002 US-002.5 AC-1): no access basis, no ingestion.
  accessBasis: string;
  excerptAllowed?: boolean;
}

// Registers a publisher's RSS feed with an explicit editorial scope. Headlines-only until terms
// allow excerpts; broad general feeds default to human review rather than being trusted.
export async function addRssSource(db: pg.ClientBase, s: NewRssSource): Promise<void> {
  if (!/^src_[a-z0-9_]+$/.test(s.sourceId)) throw new Error('source id must look like src_publisher_section');
  if (!s.name.trim()) throw new Error('name is required');
  // Tier 1 is the exchanges' own filings; publishers are 2 (national business press) to 4.
  if (!Number.isInteger(s.tier) || s.tier < 2 || s.tier > 4) throw new Error('an RSS source is tier 2, 3 or 4');
  if (!['markets', 'business', 'general'].includes(s.articleScope)) throw new Error('article scope must be markets, business, or general');
  let url: URL;
  try {
    url = new URL(s.url);
  } catch {
    throw new Error('feed URL is not a URL');
  }
  if (url.protocol !== 'https:') throw new Error('feed URL must be https');
  if (!s.accessBasis.trim()) throw new Error('access basis is required: where the terms were read');
  const cadence = Object.fromEntries(Object.entries(RSS_CADENCE).map(([session, poll]) => [session, { poll_s: poll, expect: true }]));
  parseCadence(cadence); // the shape the scheduler reads
  const r = await db.query(
    `INSERT INTO source (source_id, name, kind, tier, access_basis, access_checked_on, excerpt_allowed, enabled, cadence, adapter, article_scope)
     VALUES ($1, $2, 'article', $3, $4, current_date, $8, true, $5, $6, $7)
     ON CONFLICT (source_id) DO NOTHING`,
    [s.sourceId, s.name.trim(), s.tier, s.accessBasis.trim(), cadence, { type: 'rss', url: url.toString() }, s.articleScope, s.excerptAllowed ?? false],
  );
  if (r.rowCount === 0) throw new Error(`source ${s.sourceId} already exists`);
}

export async function setSourceExcerptAllowed(db: pg.ClientBase, sourceId: string, allowed: boolean): Promise<boolean> {
  const r = await db.query('UPDATE source SET excerpt_allowed = $2 WHERE source_id = $1', [sourceId, allowed]);
  return (r.rowCount ?? 0) > 0;
}

export async function setSourceArticleScope(db: pg.ClientBase, sourceId: string, scope: ArticleScope): Promise<boolean> {
  if (!['markets', 'business', 'general'].includes(scope)) throw new Error('article scope must be markets, business, or general');
  const r = await db.query(`UPDATE source SET article_scope = $2 WHERE source_id = $1 AND kind = 'article'`, [sourceId, scope]);
  return (r.rowCount ?? 0) > 0;
}

// Stops or resumes fetching a source; its stories stay. Audited by the source table's trigger.
export async function setSourceEnabled(db: pg.ClientBase, sourceId: string, enabled: boolean): Promise<boolean> {
  const r = await db.query('UPDATE source SET enabled = $2 WHERE source_id = $1', [sourceId, enabled]);
  return (r.rowCount ?? 0) > 0;
}
