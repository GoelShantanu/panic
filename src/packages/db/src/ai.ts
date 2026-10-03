// AI layer data access: settings, spend, call records, model classification, summaries (ai-layer.md).

import type pg from 'pg';
import type { EventTypeCode, PriceTable, Usage } from '@stockpanic/core';

export const AI_QUEUE = 'ai';

export interface AiSettings {
  enabled: boolean;
  model: string;
  capInr: number;
  prices: PriceTable;
}

export async function aiSettings(db: pg.ClientBase): Promise<AiSettings> {
  const { rows } = await db.query(`SELECT key, value FROM setting WHERE key IN ('ai_enabled', 'ai_model', 'ai_monthly_cap_inr', 'ai_price_usd_mtok', 'ai_usd_inr')`);
  const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const p = v['ai_price_usd_mtok'] ?? {};
  return {
    enabled: v['ai_enabled'] === true,
    model: String(v['ai_model']),
    capInr: Number(v['ai_monthly_cap_inr']),
    prices: {
      inputUsdPerMTok: Number(p.input),
      outputUsdPerMTok: Number(p.output),
      cacheReadUsdPerMTok: Number(p.cache_read),
      cacheWriteUsdPerMTok: Number(p.cache_write),
      usdInr: Number(v['ai_usd_inr']),
    },
  };
}

export async function aiEnabled(db: pg.ClientBase): Promise<boolean> {
  const { rows } = await db.query(`SELECT value FROM setting WHERE key = 'ai_enabled'`);
  return rows[0]?.value === true;
}

// Spend in the current IST month, split into today (IST) and before today.
export async function aiSpend(db: pg.ClientBase, now: Date): Promise<{ month: number; today: number; beforeToday: number; daysLeft: number }> {
  const { rows } = await db.query(
    `WITH b AS (SELECT date_trunc('month', $1::timestamptz AT TIME ZONE 'Asia/Kolkata') AS m, date_trunc('day', $1::timestamptz AT TIME ZONE 'Asia/Kolkata') AS d)
     SELECT coalesce(sum(cost_inr), 0)::float8 AS month,
            coalesce(sum(cost_inr) FILTER (WHERE (called_at AT TIME ZONE 'Asia/Kolkata') >= b.d), 0)::float8 AS today,
            (date_part('day', (b.m + interval '1 month') - b.d))::int AS days_left
       FROM b LEFT JOIN ai_call c ON (c.called_at AT TIME ZONE 'Asia/Kolkata') >= b.m AND c.called_at <= $1
      GROUP BY b.m, b.d`,
    [now],
  );
  const r = rows[0];
  return { month: r.month, today: r.today, beforeToday: r.month - r.today, daysLeft: r.days_left };
}

export interface AiCallRecord {
  job: 'classify' | 'summarise';
  itemId: string | null;
  storyId: string | null;
  modelId: string;
  promptVersion: string;
  inputHash: string;
  output: unknown;
  checks: unknown;
  outcome: 'accepted' | 'withheld' | 'invalid' | 'refused' | 'error' | 'timeout';
  usage: Usage;
  costInr: number;
  latencyMs: number | null;
  at: Date;
}

export async function recordAiCall(db: pg.ClientBase, c: AiCallRecord): Promise<string> {
  const { rows } = await db.query(
    `INSERT INTO ai_call (called_at, job, item_id, story_id, model_id, prompt_version, input_hash, output, checks, outcome,
                          input_tokens, output_tokens, cache_read_tokens, cost_inr, latency_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
    [
      c.at, c.job, c.itemId, c.storyId, c.modelId, c.promptVersion, c.inputHash,
      c.output === undefined ? null : JSON.stringify(c.output), c.checks === undefined ? null : JSON.stringify(c.checks), c.outcome,
      c.usage.inputTokens, c.usage.outputTokens, c.usage.cacheReadTokens, c.costInr, c.latencyMs,
    ],
  );
  return String(rows[0].id);
}

export async function enqueueAiJob(db: pg.ClientBase, kind: 'classify' | 'summarise', payload: Record<string, string>, priority: number): Promise<void> {
  await db.query('INSERT INTO job (queue, priority, payload) VALUES ($1, $2, $3)', [AI_QUEUE, priority, { kind, ...payload }]);
}

export interface ClassifyTarget {
  itemId: string;
  kind: 'article' | 'filing';
  headline: string;
  filingCategory: string | null;
  eventTypes: EventTypeCode[];
  unresolved: string[];
  classifier: 'rules' | 'model';
  storyId: string | null;
}

export async function classifyTarget(db: pg.ClientBase, itemId: string): Promise<ClassifyTarget | null> {
  const { rows } = await db.query(
    `SELECT i.id, i.kind, i.headline, f.category, a.event_types, a.unresolved, a.classifier, si.story_id
       FROM item i JOIN item_analysis a ON a.item_id = i.id
       LEFT JOIN filing_detail f ON f.item_id = i.id
       LEFT JOIN story_item si ON si.item_id = i.id
      WHERE i.id = $1`,
    [itemId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    itemId: String(r.id),
    kind: r.kind,
    headline: r.headline,
    filingCategory: r.category,
    eventTypes: r.event_types,
    unresolved: r.unresolved,
    classifier: r.classifier,
    storyId: r.story_id === null ? null : String(r.story_id),
  };
}

export async function applyModelClassification(db: pg.ClientBase, itemId: string, eventTypes: readonly string[], scores: unknown[]): Promise<void> {
  await db.query(`UPDATE item_analysis SET event_types = $2, classifier = 'model', model_scores = $3, analysed_at = now() WHERE item_id = $1`, [
    itemId,
    eventTypes,
    JSON.stringify(scores),
  ]);
}

export interface SummaryTarget {
  storyId: string;
  primaryItemId: string;
  isFiling: boolean;
  exchange: string | null;
  headline: string;
  extractedText: string | null;
  eventTypes: string[];
  filingIsin: string | null;
  hasSummary: boolean;
}

export async function summaryTarget(db: pg.ClientBase, storyId: string): Promise<SummaryTarget | null> {
  const { rows } = await db.query(
    `SELECT s.id, s.primary_item_id, f.item_id IS NOT NULL AS is_filing, f.exchange, i.headline, f.extracted_text,
            ARRAY(SELECT code FROM story_event_type e WHERE e.story_id = s.id) AS event_types,
            (SELECT a.tags -> 0 ->> 'isin' FROM item_analysis a WHERE a.item_id = s.primary_item_id) AS filing_isin,
            EXISTS (SELECT 1 FROM story_summary sm WHERE sm.story_id = s.id) AS has_summary
       FROM story s JOIN item i ON i.id = s.primary_item_id LEFT JOIN filing_detail f ON f.item_id = s.primary_item_id
      WHERE s.id = $1 AND s.merged_into IS NULL`,
    [storyId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    storyId: String(r.id),
    primaryItemId: String(r.primary_item_id),
    isFiling: r.is_filing,
    exchange: r.exchange,
    headline: r.headline,
    extractedText: r.extracted_text,
    eventTypes: r.event_types,
    filingIsin: r.filing_isin,
    hasSummary: r.has_summary,
  };
}

export async function saveSummary(
  db: pg.ClientBase,
  s: { storyId: string; sourceItemId: string; body: string; citations: unknown; checks: unknown; modelId: string; promptVersion: string; aiCallId: string; at: Date },
): Promise<void> {
  await db.query(
    `INSERT INTO story_summary (story_id, source_item_id, body, citations, checks, model_id, prompt_version, ai_call_id, generated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (story_id) DO NOTHING`,
    [s.storyId, s.sourceItemId, s.body, JSON.stringify(s.citations), JSON.stringify(s.checks), s.modelId, s.promptVersion, s.aiCallId, s.at],
  );
}

// Current legal names for the G5 entity check.
export async function registryNames(db: pg.ClientBase): Promise<{ name: string; isin: string }[]> {
  const { rows } = await db.query(`SELECT DISTINCT isin, name FROM instrument_name WHERE valid @> (now() AT TIME ZONE 'Asia/Kolkata')::date`);
  return rows.map((r) => ({ name: r.name, isin: String(r.isin).trim() }));
}

// Founder alerts fire once per key (month, day); the audit row is the record that it fired.
export async function alertOnce(db: pg.ClientBase, action: string, key: string, detail: unknown, now: Date): Promise<boolean> {
  const { rowCount } = await db.query(
    `INSERT INTO audit_log (at, actor_type, actor_id, action, entity_type, entity_id, after)
     SELECT $1, 'system', NULL, $2, 'ai', $3, $4
      WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE action = $2 AND entity_type = 'ai' AND entity_id = $3)`,
    [now, action, key, JSON.stringify(detail)],
  );
  return (rowCount ?? 0) > 0;
}

// Summary withhold rate for the IST day (ai-layer.md §4: > 20 % alerts the operator).
export async function withholdRateToday(db: pg.ClientBase, now: Date): Promise<{ total: number; withheld: number }> {
  const { rows } = await db.query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE outcome <> 'accepted')::int AS withheld
       FROM ai_call WHERE job = 'summarise'
        AND (called_at AT TIME ZONE 'Asia/Kolkata') >= date_trunc('day', $1::timestamptz AT TIME ZONE 'Asia/Kolkata') AND called_at <= $1`,
    [now],
  );
  return rows[0];
}
