// Trending view (PRD-001 US-001.3 AC-7, US-001.7 AC-4, C-001.2; D-038).

import type pg from 'pg';
import { TRENDING_BASELINE_DAYS, TRENDING_MIN_SOURCES, TRENDING_WINDOW_MS, expectedActivity, tierWeight, trendingScore, windowActivity } from '@stockpanic/core';
import type { StreamQuery } from './read.ts';
import { PRIMARY_ARTICLE_RELEVANT_SQL } from './read.ts';

export interface TrendingRow {
  id: string;
  score: number;
  sourceCount: number;
  itemCount: number;
  session: string;
}

const UNTAGGED = '__untagged__'; // market-wide baseline for stories with no displayed instrument

export async function sessionAt(db: pg.ClientBase, at: Date): Promise<string> {
  const { rows } = await db.query(`SELECT session FROM trading_session WHERE tstzrange(starts_at, ends_at) @> $1::timestamptz LIMIT 1`, [at]);
  return rows[0]?.session ?? 'closed';
}

// Stories with ≥ 3 sources in the trailing window, scored against each instrument's own activity
// in the current session type. Filters (event type, filings only, history depth) match the stream.
export async function trendingPage(db: pg.ClientBase, q: Pick<StreamQuery, 'eventTypes' | 'filingsOnly' | 'notBefore' | 'watchlistUserId'>, now: Date, limit: number): Promise<TrendingRow[]> {
  const since = new Date(now.getTime() - TRENDING_WINDOW_MS);
  const session = await sessionAt(db, now);
  const { rows } = await db.query(
    `SELECT s.id, i.source_id, src.tier
       FROM story s
       JOIN item p ON p.id = s.primary_item_id
       JOIN story_item si ON si.story_id = s.id
       JOIN item i ON i.id = si.item_id
       JOIN source src ON src.source_id = i.source_id
      WHERE s.merged_into IS NULL
        AND ${PRIMARY_ARTICLE_RELEVANT_SQL}
        AND i.first_seen_at > $1 AND i.first_seen_at <= $2
        AND ($3::text[] IS NULL OR EXISTS (SELECT 1 FROM story_event_type e WHERE e.story_id = s.id AND e.code = ANY($3::text[])))
        AND (NOT $4::boolean OR p.kind = 'filing')
        AND ($5::timestamptz IS NULL OR s.first_seen_at >= $5::timestamptz)
        AND ($6::bigint IS NULL OR EXISTS (SELECT 1 FROM story_tag_display d JOIN watchlist_entry w ON w.isin = d.isin
                                            WHERE d.story_id = s.id AND w.user_id = $6::bigint))`,
    [since, now, q.eventTypes, q.filingsOnly, q.notBefore, q.watchlistUserId],
  );
  const byStory = new Map<string, { sourceId: string; tier: number }[]>();
  for (const r of rows) {
    const k = String(r.id);
    if (!byStory.has(k)) byStory.set(k, []);
    byStory.get(k)!.push({ sourceId: r.source_id, tier: r.tier });
  }
  const candidates = [...byStory.entries()]
    .map(([id, sources]) => ({ id, itemCount: sources.length, ...windowActivity({ itemCount: sources.length, sources }) }))
    .filter((c) => c.sourceCount >= TRENDING_MIN_SOURCES);
  if (candidates.length === 0) return [];

  const tags = await db.query(`SELECT story_id, isin::text AS isin FROM story_tag_display WHERE story_id = ANY($1::bigint[])`, [candidates.map((c) => c.id)]);
  const tagsOf = new Map<string, string[]>();
  for (const t of tags.rows) tagsOf.set(String(t.story_id), [...(tagsOf.get(String(t.story_id)) ?? []), t.isin.trim()]);
  const keys = [...new Set(candidates.flatMap((c) => tagsOf.get(c.id) ?? [UNTAGGED]))];
  const expected = await baselines(db, keys, session, now);

  return candidates
    .map((c) => ({ id: c.id, sourceCount: c.sourceCount, itemCount: c.itemCount, session, score: trendingScore(c.activity, (tagsOf.get(c.id) ?? [UNTAGGED]).map((k) => expected.get(k)!)) }))
    .sort((a, b) => b.score - a.score || b.sourceCount - a.sourceCount || Number(b.id) - Number(a.id))
    .slice(0, limit);
}

// Expected activity per window for each instrument, from items first seen during sessions of the
// same type over the baseline period (never mixing in-session with out-of-session, US-001.7 AC-4).
async function baselines(db: pg.ClientBase, keys: readonly string[], session: string, now: Date): Promise<Map<string, number>> {
  const from = new Date(now.getTime() - TRENDING_BASELINE_DAYS * 86_400_000);
  const hours = (
    await db.query(
      `SELECT coalesce(sum(extract(epoch FROM least(ends_at, $3) - greatest(starts_at, $2))), 0)::float8 / 3600 AS h
         FROM trading_session WHERE session = $1 AND ends_at > $2 AND starts_at < $3`,
      [session, from, now],
    )
  ).rows[0].h as number;
  const isins = keys.filter((k) => k !== UNTAGGED);
  const { rows } = await db.query(
    `SELECT coalesce(d.isin::text, $5) AS k, src.tier, count(*)::int AS n
       FROM item i
       JOIN source src ON src.source_id = i.source_id
       JOIN story_item si ON si.item_id = i.id
       JOIN trading_session ts ON tstzrange(ts.starts_at, ts.ends_at) @> i.first_seen_at AND ts.session = $1
       LEFT JOIN story_tag_display d ON d.story_id = si.story_id
      WHERE i.first_seen_at >= $2 AND i.first_seen_at < $3
        AND (d.isin::text = ANY($4::text[]) OR (d.isin IS NULL AND $6))
      GROUP BY 1, 2`,
    [session, from, new Date(now.getTime() - TRENDING_WINDOW_MS), isins, UNTAGGED, keys.includes(UNTAGGED)],
  );
  const weighted = new Map<string, number>();
  for (const r of rows) weighted.set(r.k.trim(), (weighted.get(r.k.trim()) ?? 0) + r.n * tierWeight(r.tier));
  return new Map(keys.map((k) => [k, expectedActivity(weighted.get(k) ?? 0, hours)]));
}
