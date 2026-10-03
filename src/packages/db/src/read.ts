import type pg from 'pg';
import { EVENT_TYPES, VIEW_VOTE_THRESHOLD, normaliseName, voteDisplay } from '@stockpanic/core';
import type { DirectionalDisplay, EventTypeCode, VoteDisplay } from '@stockpanic/core';

// Read side for PRD-001 (stream), PRD-004 (story, company), PRD-002 §8.3 (instrument),
// PRD-003 US-003.1 (search). Anonymous viewer until accounts exist (Backend B5).

const TODAY_IST = `(now() AT TIME ZONE 'Asia/Kolkata')::date`;
const TAXONOMY_ORDER = new Map<string, number>(EVENT_TYPES.map((t, i) => [t.code, i]));

export async function directionalVotingEnabled(db: pg.ClientBase): Promise<boolean> {
  const { rows } = await db.query<{ v: boolean }>(`SELECT (value #>> '{}')::boolean AS v FROM setting WHERE key = 'directional_voting_enabled'`);
  return rows[0]?.v ?? false;
}

// ---------------------------------------------------------------- story card (PRD-001 §4.1)

export interface InstrumentRef {
  isin: string;
  display_symbol: string | null;
  exchange_codes: { nse: string | null; bse: string | null };
  resolution: 'resolved';
  confidence: number;
}

export interface StoryCard {
  story_id: string;
  headline: string;
  first_seen_at: Date;
  updated_at: Date;
  primary_item: {
    kind: 'filing' | 'article';
    source: { source_id: string; name: string; tier: number };
    url: string;
    published_at: Date | null;
  };
  source_count: number;
  instruments: InstrumentRef[];
  unresolved_mentions: string[];
  event_types: EventTypeCode[];
  votes: VoteDisplay;
  comment_count: number;
}

export async function loadStoryCards(db: pg.ClientBase, storyIds: readonly string[]): Promise<Map<string, StoryCard>> {
  const out = new Map<string, StoryCard>();
  if (storyIds.length === 0) return out;
  const directional = await directionalVotingEnabled(db);

  const base = await db.query(
    `SELECT s.id, s.public_id, s.first_seen_at, s.updated_at, s.source_count,
            p.kind, p.headline, p.url, p.published_at, src.source_id, src.name AS source_name, src.tier,
            coalesce(v.bullish, 0) AS bullish, coalesce(v.bearish, 0) AS bearish,
            coalesce(v.neutral, 0) AS neutral, coalesce(v.important, 0) AS important,
            (SELECT count(*)::int FROM comment c WHERE c.story_id = s.id AND c.state = 'visible') AS comment_count
       FROM story s
       JOIN item p ON p.id = s.primary_item_id
       JOIN source src ON src.source_id = p.source_id
       LEFT JOIN story_vote_count v ON v.story_id = s.id
      WHERE s.id = ANY($1::bigint[])`,
    [storyIds],
  );
  const instruments = await db.query(
    `SELECT d.story_id, d.isin, d.confidence, nse.code AS nse, bse.code AS bse
       FROM story_tag_display d
       LEFT JOIN instrument_code nse ON nse.isin = d.isin AND nse.exchange = 'NSE' AND nse.valid @> ${TODAY_IST}
       LEFT JOIN instrument_code bse ON bse.isin = d.isin AND bse.exchange = 'BSE' AND bse.valid @> ${TODAY_IST}
      WHERE d.story_id = ANY($1::bigint[])
      ORDER BY d.confidence DESC, d.isin`,
    [storyIds],
  );
  const types = await db.query(`SELECT story_id, code FROM story_event_type WHERE story_id = ANY($1::bigint[])`, [storyIds]);
  const mentions = await db.query(`SELECT story_id, mention FROM story_unresolved_mention WHERE story_id = ANY($1::bigint[]) ORDER BY mention`, [
    storyIds,
  ]);

  for (const r of base.rows) {
    out.set(String(r.id), {
      story_id: r.public_id,
      headline: r.headline,
      first_seen_at: r.first_seen_at,
      updated_at: r.updated_at,
      primary_item: {
        kind: r.kind,
        source: { source_id: r.source_id, name: r.source_name, tier: r.tier },
        url: r.url,
        published_at: r.published_at,
      },
      source_count: r.source_count,
      instruments: [],
      unresolved_mentions: [],
      event_types: [],
      votes: voteDisplay(
        { bullish: r.bullish, bearish: r.bearish, neutral: r.neutral, important: r.important },
        { directionalEnabled: directional },
      ),
      comment_count: r.comment_count,
    });
  }
  for (const r of instruments.rows) {
    out.get(String(r.story_id))?.instruments.push({
      isin: r.isin.trim(),
      display_symbol: r.nse ?? r.bse ?? null,
      exchange_codes: { nse: r.nse ?? null, bse: r.bse ?? null },
      resolution: 'resolved',
      confidence: Number(r.confidence),
    });
  }
  for (const r of types.rows) out.get(String(r.story_id))?.event_types.push(r.code);
  for (const card of out.values()) card.event_types.sort((a, b) => TAXONOMY_ORDER.get(a)! - TAXONOMY_ORDER.get(b)!);
  for (const r of mentions.rows) out.get(String(r.story_id))?.unresolved_mentions.push(r.mention);
  return out;
}

// ---------------------------------------------------------------- stream (PRD-001 US-001.1, US-001.3)

export type StreamView = 'latest' | 'important' | 'bullish' | 'bearish';

const VIEW_SQL: Record<StreamView, string> = {
  latest: 'TRUE',
  important: `coalesce(v.important, 0) >= ${VIEW_VOTE_THRESHOLD}`,
  bullish: `coalesce(v.bullish, 0) >= ${VIEW_VOTE_THRESHOLD} AND coalesce(v.bullish, 0) > coalesce(v.bearish, 0)`,
  bearish: `coalesce(v.bearish, 0) >= ${VIEW_VOTE_THRESHOLD} AND coalesce(v.bearish, 0) > coalesce(v.bullish, 0)`,
};

export interface StreamQuery {
  view: StreamView;
  eventTypes: string[] | null;
  filingsOnly: boolean;
  isin: string | null; // company timeline
  watchlistUserId: string | null; // Watchlist view (PRD-001 US-001.3 AC-4)
  before: { at: Date; id: string } | null;
  notBefore: Date | null; // tier history depth
  limit: number;
}

function streamWhere(q: StreamQuery): { sql: string; params: unknown[] } {
  return {
    sql: `s.merged_into IS NULL
        AND ${VIEW_SQL[q.view]}
        AND ($1::text[] IS NULL OR EXISTS (SELECT 1 FROM story_event_type e WHERE e.story_id = s.id AND e.code = ANY($1::text[])))
        AND (NOT $2::boolean OR p.kind = 'filing')
        AND ($3::text IS NULL OR EXISTS (SELECT 1 FROM story_tag_display d WHERE d.story_id = s.id AND d.isin = $3::text))
        AND ($4::bigint IS NULL OR EXISTS (SELECT 1 FROM story_tag_display d JOIN watchlist_entry w ON w.isin = d.isin
                                            WHERE d.story_id = s.id AND w.user_id = $4::bigint))
        AND ($5::timestamptz IS NULL OR s.first_seen_at >= $5::timestamptz)`,
    params: [q.eventTypes, q.filingsOnly, q.isin, q.watchlistUserId, q.notBefore],
  };
}

export async function streamPage(db: pg.ClientBase, q: StreamQuery): Promise<{ id: string; firstSeenAt: Date }[]> {
  const w = streamWhere(q);
  const { rows } = await db.query(
    `SELECT s.id, s.first_seen_at
       FROM story s
       JOIN item p ON p.id = s.primary_item_id
       LEFT JOIN story_vote_count v ON v.story_id = s.id
      WHERE ${w.sql}
        AND ($6::timestamptz IS NULL OR (s.first_seen_at, s.id) < ($6::timestamptz, $7::bigint))
      ORDER BY s.first_seen_at DESC, s.id DESC
      LIMIT $8`,
    [...w.params, q.before?.at ?? null, q.before?.id ?? null, q.limit],
  );
  return rows.map((r) => ({ id: String(r.id), firstSeenAt: r.first_seen_at }));
}

// PRD-001 US-001.4 AC-2: the unread count is exact.
export async function streamUnreadCount(db: pg.ClientBase, q: StreamQuery, since: Date): Promise<number> {
  const w = streamWhere(q);
  const { rows } = await db.query(
    `SELECT count(*)::int AS n
       FROM story s
       JOIN item p ON p.id = s.primary_item_id
       LEFT JOIN story_vote_count v ON v.story_id = s.id
      WHERE ${w.sql} AND s.first_seen_at > $6::timestamptz`,
    [...w.params, since],
  );
  return rows[0].n;
}

export async function lastSeen(db: pg.ClientBase, userId: string, view: string): Promise<Date | null> {
  const { rows } = await db.query('SELECT last_seen_at FROM stream_seen WHERE user_id = $1 AND view = $2', [userId, view]);
  return rows[0]?.last_seen_at ?? null;
}

// The stream_seen trigger keeps last_seen_at from moving backwards (PRD-001 §4.3).
export async function markSeen(db: pg.ClientBase, userId: string, view: string, at: Date): Promise<void> {
  await db.query(
    `INSERT INTO stream_seen (user_id, view, last_seen_at) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, view) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`,
    [userId, view, at],
  );
}

export async function olderStoriesExist(db: pg.ClientBase, isin: string, before: Date): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT EXISTS (SELECT 1 FROM story_tag_display d JOIN story s ON s.id = d.story_id
                     WHERE d.isin = $1 AND s.merged_into IS NULL AND s.first_seen_at < $2) AS e`,
    [isin, before],
  );
  return rows[0].e;
}

export interface SessionInfo {
  state: string;
  exchange_date: string;
  next_transition_at: Date | null;
}

export async function sessionInfo(db: pg.ClientBase, now: Date): Promise<SessionInfo> {
  const cur = await db.query(
    `SELECT session, exchange_date::text, ends_at FROM trading_session
      WHERE tstzrange(starts_at, ends_at) @> $1::timestamptz ORDER BY starts_at DESC LIMIT 1`,
    [now],
  );
  if (cur.rows[0]) return { state: cur.rows[0].session, exchange_date: cur.rows[0].exchange_date, next_transition_at: cur.rows[0].ends_at };
  const next = await db.query(`SELECT starts_at FROM trading_session WHERE starts_at > $1 ORDER BY starts_at LIMIT 1`, [now]);
  const ist = new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
  return { state: 'closed', exchange_date: ist, next_transition_at: next.rows[0]?.starts_at ?? null };
}

export async function staleTier1Sources(db: pg.ClientBase): Promise<{ source_id: string; name: string; health: string; since: Date }[]> {
  const { rows } = await db.query(
    `SELECT s.source_id, s.name, h.state AS health, h.changed_at AS since
       FROM source s JOIN source_health h USING (source_id)
      WHERE s.enabled AND s.tier = 1 AND h.state <> 'healthy'
      ORDER BY s.source_id`,
  );
  return rows;
}

// ---------------------------------------------------------------- story detail (PRD-004 §6.1)

export type StoryLookup = { kind: 'found'; id: string } | { kind: 'merged'; survivor: string } | { kind: 'missing' };

export async function lookupStory(db: pg.ClientBase, publicId: string): Promise<StoryLookup> {
  const { rows } = await db.query(
    `WITH RECURSIVE chain AS (
       SELECT id, public_id, merged_into, 0 AS depth FROM story WHERE public_id = $1
       UNION ALL
       SELECT s.id, s.public_id, s.merged_into, c.depth + 1 FROM story s JOIN chain c ON s.id = c.merged_into WHERE c.depth < 20
     )
     SELECT id, public_id, merged_into, depth FROM chain ORDER BY depth`,
    [publicId],
  );
  if (rows.length === 0) return { kind: 'missing' };
  const last = rows[rows.length - 1];
  if (rows.length === 1) return { kind: 'found', id: String(rows[0].id) };
  return last.merged_into === null ? { kind: 'merged', survivor: last.public_id } : { kind: 'missing' };
}

export async function storyDetailExtras(db: pg.ClientBase, storyId: string) {
  const items = await db.query(
    `SELECT i.public_id, i.kind, src.source_id, src.name, src.tier, i.headline, i.url, f.attachment_url, i.published_at, i.status
       FROM story_item si JOIN item i ON i.id = si.item_id JOIN source src ON src.source_id = i.source_id
       LEFT JOIN filing_detail f ON f.item_id = i.id
      WHERE si.story_id = $1
      ORDER BY (i.kind = 'filing') DESC, i.first_seen_at, i.id`,
    [storyId],
  );
  const primary = await db.query(`SELECT p.public_id FROM story s JOIN item p ON p.id = s.primary_item_id WHERE s.id = $1`, [storyId]);
  const summary = await db.query(
    `SELECT sm.body, sm.generated_at, i.public_id AS source_item_id, f.exchange
       FROM story_summary sm JOIN item i ON i.id = sm.source_item_id JOIN filing_detail f ON f.item_id = sm.source_item_id
      WHERE sm.story_id = $1 AND sm.status = 'shown'`,
    [storyId],
  );
  const names = await db.query(
    `SELECT d.isin, n.name FROM story_tag_display d
       LEFT JOIN instrument_name n ON n.isin = d.isin AND n.kind = 'legal' AND n.valid @> ${TODAY_IST}
      WHERE d.story_id = $1`,
    [storyId],
  );
  const related: Record<string, string[]> = {};
  const top = await db.query(`SELECT isin FROM story_tag_display WHERE story_id = $1 ORDER BY confidence DESC, isin LIMIT 2`, [storyId]);
  for (const { isin } of top.rows) {
    const r = await db.query(
      `SELECT s.public_id FROM story_tag t JOIN story s ON s.id = t.story_id
        WHERE t.isin = $1 AND s.id <> $2 AND s.merged_into IS NULL
        ORDER BY t.story_first_seen_at DESC, s.id DESC LIMIT 5`,
      [isin, storyId],
    );
    related[isin.trim()] = r.rows.map((x) => x.public_id);
  }
  const sm = summary.rows[0];
  return {
    primary_item_id: primary.rows[0]?.public_id as string,
    items: items.rows.map((r) => ({
      item_id: r.public_id,
      kind: r.kind,
      source: { source_id: r.source_id, name: r.name, tier: r.tier },
      headline: r.headline,
      url: r.url,
      ...(r.attachment_url ? { attachment_url: r.attachment_url } : {}),
      published_at: r.published_at,
      status: r.status,
    })),
    summary: sm
      ? { text: sm.body, label: `AI summary of the ${sm.exchange} filing`, source_item_id: sm.source_item_id, generated_at: sm.generated_at }
      : null,
    names: new Map<string, string | null>(names.rows.map((r) => [r.isin.trim(), r.name])),
    related,
  };
}

// ---------------------------------------------------------------- company (PRD-004 §6.2) and instrument (PRD-002 §8.3)

export async function loadInstrument(db: pg.ClientBase, isin: string, asOf: string | null) {
  const date = asOf ? '$2::date' : TODAY_IST;
  const params = asOf ? [isin, asOf] : [isin];
  const { rows } = await db.query(
    `SELECT i.isin, i.segment, i.status, i.successor_isin, n.name, lower(n.valid)::text AS valid_from, upper(n.valid)::text AS valid_to,
            (SELECT code FROM instrument_code c WHERE c.isin = i.isin AND c.exchange = 'NSE' AND c.valid @> ${date}) AS nse,
            (SELECT code FROM instrument_code c WHERE c.isin = i.isin AND c.exchange = 'BSE' AND c.valid @> ${date}) AS bse
       FROM instrument i
       LEFT JOIN instrument_name n ON n.isin = i.isin AND n.kind = 'legal' AND n.valid @> ${date}
      WHERE i.isin = $1`,
    params,
  );
  const r = rows[0];
  if (!r) return null;
  return {
    isin: r.isin.trim(),
    name: r.name as string | null,
    display_symbol: (r.nse ?? r.bse ?? null) as string | null,
    exchange_codes: { nse: r.nse ?? null, bse: r.bse ?? null },
    segment: r.segment as string,
    status: r.status as string,
    successor_isin: r.successor_isin ? (r.successor_isin as string).trim() : null,
    valid_from: r.valid_from as string | null,
    valid_to: r.valid_to as string | null,
  };
}

export const companySlug = (name: string | null) => (name ? normaliseName(name).replace(/ /g, '-') : 'company');

export const COMMUNITY_WINDOW_DAYS = 7; // PRD-004 OQ-004.3

export async function communityOpinion(db: pg.ClientBase, isin: string, now: Date): Promise<DirectionalDisplay> {
  const { rows } = await db.query(
    `SELECT coalesce(sum(v.bullish), 0)::int AS bullish, coalesce(sum(v.bearish), 0)::int AS bearish,
            coalesce(sum(v.neutral), 0)::int AS neutral
       FROM story_tag_display d JOIN story s ON s.id = d.story_id JOIN story_vote_count v ON v.story_id = s.id
      WHERE d.isin = $1 AND s.merged_into IS NULL AND s.first_seen_at >= $2::timestamptz - make_interval(days => $3)`,
    [isin, now, COMMUNITY_WINDOW_DAYS],
  );
  const r = rows[0];
  return voteDisplay({ bullish: r.bullish, bearish: r.bearish, neutral: r.neutral, important: 0 }, { directionalEnabled: true }).directional!;
}

// ---------------------------------------------------------------- search (PRD-003 US-003.1 AC-1)

export async function searchInstruments(db: pg.ClientBase, query: string, limit = 20) {
  const q = query.trim();
  const norm = q.toLowerCase();
  const { rows } = await db.query(
    `WITH m AS (
       SELECT isin, similarity(lower(name), $1) AS score FROM instrument_name WHERE valid @> ${TODAY_IST} AND lower(name) % $1
       UNION ALL
       SELECT isin, 0.9 FROM instrument_name WHERE valid @> ${TODAY_IST} AND (lower(name) LIKE $1 || '%' OR lower(name) LIKE '% ' || $1 || '%')
       UNION ALL
       SELECT isin, similarity(alias_norm, $1) FROM instrument_alias WHERE valid @> ${TODAY_IST} AND (alias_norm % $1 OR alias_norm = $1)
       UNION ALL
       SELECT isin, CASE WHEN upper(code) = upper($2) THEN 1.0 ELSE 0.8 END FROM instrument_code
        WHERE valid @> ${TODAY_IST} AND (upper(code) = upper($2) OR upper(code) LIKE upper($2) || '%')
       UNION ALL
       SELECT isin, 1.0 FROM instrument WHERE isin = upper($2)
     )
     SELECT m.isin, max(m.score) AS score FROM m GROUP BY m.isin ORDER BY score DESC, m.isin LIMIT $3`,
    [norm, q, limit],
  );
  const results = [];
  for (const r of rows) {
    const inst = await loadInstrument(db, r.isin.trim(), null);
    if (inst) results.push({ isin: inst.isin, name: inst.name, display_symbol: inst.display_symbol, segment: inst.segment, status: inst.status });
  }
  return results;
}

export async function eventTypeList(db: pg.ClientBase) {
  const { rows } = await db.query(`SELECT code, label, alert_default, taxonomy_version FROM event_type WHERE retired_to IS NULL`);
  const types = rows
    .map((r) => ({ code: r.code as string, label: r.label as string, alert_default: r.alert_default as boolean }))
    .sort((a, b) => (TAXONOMY_ORDER.get(a.code) ?? 99) - (TAXONOMY_ORDER.get(b.code) ?? 99));
  return { version: Math.max(1, ...rows.map((r) => r.taxonomy_version as number)), types };
}

// ---------------------------------------------------------------- live events (ADR-005)

export interface LiveEventRow {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

export async function liveEventsAfter(db: pg.ClientBase, afterId: string, limit: number): Promise<LiveEventRow[]> {
  const { rows } = await db.query(`SELECT id, type, payload FROM live_event WHERE id > $1 ORDER BY id LIMIT $2`, [afterId, limit]);
  return rows.map((r) => ({ id: String(r.id), type: r.type, payload: r.payload }));
}

export async function liveEventBounds(db: pg.ClientBase): Promise<{ min: string | null; max: string | null }> {
  const { rows } = await db.query(`SELECT min(id)::text AS min, max(id)::text AS max FROM live_event`);
  return { min: rows[0].min, max: rows[0].max };
}

export async function storyIdByPublicId(db: pg.ClientBase, publicId: string): Promise<string | null> {
  const { rows } = await db.query(`SELECT id FROM story WHERE public_id = $1`, [publicId]);
  return rows[0] ? String(rows[0].id) : null;
}
