// AI jobs (ai-layer.md §1–§6). Neither job blocks publication: stories are committed with rule
// output first, and these jobs refine them afterwards (D-034).

import { createHash } from 'node:crypto';
import type pg from 'pg';
import {
  SUMMARISABLE_EVENT_TYPES,
  costInr,
  namesInText,
  overPace,
  runSafeguards,
  spendState,
  validateClassification,
} from '@stockpanic/core';
import type { EventTypeCode, Usage } from '@stockpanic/core';
import {
  aiSettings,
  aiSpend,
  alertOnce,
  applyModelClassification,
  classifyTarget,
  emitStoryEvent,
  enqueueAlertEvaluation,
  recordAiCall,
  registryNames,
  saveSummary,
  searchInstruments,
  summaryTarget,
  withholdRateToday,
} from '@stockpanic/db';
import type { AiSettings } from '@stockpanic/db';
import type { Mailer } from '@stockpanic/mail';
import { CLUSTER_LOCK_KEY, recomputeStory } from '../pipeline/process-item.ts';
import { buildClassifyRequest } from './client.ts';
import type { AiClient, AiOutcome } from './client.ts';
import { CLASSIFY_PROMPT_VERSION, SUMMARISE_PROMPT_VERSION } from './prompts.ts';

export const CLASSIFY_TIMEOUT_MS = 10_000;
export const SUMMARISE_TIMEOUT_MS = 60_000;
export const SUMMARY_SOURCE_MAX_CHARS = 30_000; // ai-layer.md §3.1 step 4 [ASSUMPTION]
const CANDIDATES_PER_MENTION = 3;
const WITHHOLD_ALERT_SHARE = 0.2;
const WITHHOLD_ALERT_MIN_CALLS = 5;

export interface AiDeps {
  client: AiClient;
  mailer: Mailer | null;
  opsEmail: string | null;
  log: (line: string) => void;
}

export type JobResult = 'accepted' | 'withheld' | 'invalid' | 'refused' | 'skipped' | 'capped';

const ZERO: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const istMonth = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 7);
const istDay = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

async function notify(db: pg.ClientBase, deps: AiDeps, action: string, key: string, subject: string, body: string, now: Date) {
  if (!(await alertOnce(db, action, key, { subject }, now))) return;
  deps.log(`ALERT ${subject}`);
  if (deps.mailer && deps.opsEmail) {
    await deps.mailer.send({ to: deps.opsEmail, subject: `[StockPanic] ${subject}`, text: body }).catch((e: Error) => deps.log(`alert email failed: ${e.message}`));
  }
}

// ai-layer.md §5: 80 % and 100 % alerts once a month; pace alert once a day.
async function checkSpend(db: pg.ClientBase, deps: AiDeps, s: AiSettings, now: Date): Promise<'ok' | 'warn' | 'capped'> {
  const spend = await aiSpend(db, now);
  const state = spendState(spend.month, s.capInr);
  const month = istMonth(now);
  if (state === 'warn') await notify(db, deps, 'ai.spend_warn', month, 'AI spend passed 80% of the monthly cap', `₹${spend.month.toFixed(2)} of ₹${s.capInr} spent in ${month}.`, now);
  if (state === 'capped') {
    await notify(db, deps, 'ai.spend_capped', month, 'AI spend reached the monthly cap', `₹${spend.month.toFixed(2)} of ₹${s.capInr}. Summaries are paused and classification is rules-only until the 1st or until the cap is raised.`, now);
  }
  if (overPace(spend.today, spend.beforeToday, s.capInr, spend.daysLeft)) {
    await notify(db, deps, 'ai.over_pace', istDay(now), 'AI spend above 150% of today’s pace', `₹${spend.today.toFixed(2)} spent today (IST). Expected in results season; information only.`, now);
  }
  return state;
}

function failureOutcome(o: AiOutcome<unknown>): 'refused' | 'invalid' {
  return o.kind === 'refused' ? 'refused' : 'invalid';
}

// ------------------------------------------------------------ classify (ai-layer.md §2)

export async function runClassify(db: pg.ClientBase, deps: AiDeps, itemId: string, now: Date): Promise<JobResult> {
  const s = await aiSettings(db);
  const target = await classifyTarget(db, itemId);
  if (!s.enabled || !target || target.classifier === 'model') return 'skipped';
  if ((await checkSpend(db, deps, s, now)) === 'capped') return 'capped';

  // R4 candidates come only from the registry: top matches for each unresolved mention.
  const candidates = new Map<string, { isin: string; name: string }>();
  for (const m of target.unresolved) {
    for (const r of (await searchInstruments(db, m, CANDIDATES_PER_MENTION)) as { isin: string; name: string }[]) candidates.set(r.isin, { isin: r.isin, name: r.name });
  }
  const req = buildClassifyRequest({ kind: target.kind, headline: target.headline, filingCategory: target.filingCategory }, [...candidates.values()]);
  const base = { job: 'classify' as const, itemId, storyId: target.storyId, promptVersion: CLASSIFY_PROMPT_VERSION, inputHash: hash(req), at: now };

  let out: AiOutcome<unknown>;
  try {
    out = await deps.client.classify(req, CLASSIFY_TIMEOUT_MS);
  } catch (err) {
    const timeout = (err as Error).name.includes('Timeout');
    await recordAiCall(db, { ...base, modelId: s.model, output: { error: (err as Error).message }, checks: null, outcome: timeout ? 'timeout' : 'error', usage: ZERO, costInr: 0, latencyMs: null });
    throw err; // back to the queue with backoff; the story keeps its rule types meanwhile
  }
  const cost = costInr(out.usage, s.prices);
  if (out.kind !== 'ok') {
    await recordAiCall(db, { ...base, modelId: out.modelId, output: null, checks: { stop: out.kind }, outcome: failureOutcome(out), usage: out.usage, costInr: cost, latencyMs: out.latencyMs });
    return failureOutcome(out);
  }
  const v = validateClassification(out.value, [...candidates.keys()]);
  await recordAiCall(db, {
    ...base, modelId: out.modelId, output: out.value, checks: v.ok ? { valid: true } : { valid: false, error: v.error },
    outcome: v.ok ? 'accepted' : 'invalid', usage: out.usage, costInr: cost, latencyMs: out.latencyMs,
  });
  if (!v.ok) {
    deps.log(`classify item ${itemId}: discarded (${v.error})`);
    return 'invalid';
  }

  await db.query('BEGIN');
  try {
    await db.query('SELECT pg_advisory_xact_lock($1)', [CLUSTER_LOCK_KEY]);
    await applyModelClassification(db, itemId, v.value.eventTypes, v.value.instruments);
    const changed = [...v.value.eventTypes].sort().join(',') !== [...target.eventTypes].sort().join(',');
    if (target.storyId && changed) {
      await recomputeStory(db, target.storyId);
      await emitStoryEvent(db, 'story.updated', target.storyId);
      await enqueueAlertEvaluation(db, target.storyId);
    }
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
  return 'accepted';
}

// ------------------------------------------------------------ summarise (ai-layer.md §3)

export async function runSummarise(db: pg.ClientBase, deps: AiDeps, storyId: string, now: Date): Promise<JobResult> {
  const s = await aiSettings(db);
  const t = await summaryTarget(db, storyId);
  if (!s.enabled || !t || !t.isFiling || t.hasSummary) return 'skipped';
  if (!t.eventTypes.some((e) => SUMMARISABLE_EVENT_TYPES.has(e as EventTypeCode))) return 'skipped'; // D-025
  if (!t.extractedText || t.extractedText.trim().length < 200) return 'skipped'; // no text layer yet (scanned PDFs: ai-layer.md §3.3, not built)
  if ((await checkSpend(db, deps, s, now)) === 'capped') return 'capped';

  const documentText = t.extractedText.slice(0, SUMMARY_SOURCE_MAX_CHARS);
  const req = { documentText, documentTitle: t.headline };
  const base = { job: 'summarise' as const, itemId: t.primaryItemId, storyId, promptVersion: SUMMARISE_PROMPT_VERSION, inputHash: hash(req), at: now };

  let out: Awaited<ReturnType<AiClient['summarise']>>;
  try {
    out = await deps.client.summarise(req, SUMMARISE_TIMEOUT_MS);
  } catch (err) {
    const timeout = (err as Error).name.includes('Timeout');
    await recordAiCall(db, { ...base, modelId: s.model, output: { error: (err as Error).message }, checks: null, outcome: timeout ? 'timeout' : 'error', usage: ZERO, costInr: 0, latencyMs: null });
    throw err;
  }
  const cost = costInr(out.usage, s.prices);
  if (out.kind !== 'ok') {
    await recordAiCall(db, { ...base, modelId: out.modelId, output: null, checks: { stop: out.kind }, outcome: 'withheld', usage: out.usage, costInr: cost, latencyMs: out.latencyMs });
    await checkWithholdRate(db, deps, now);
    return 'withheld';
  }

  const summaryText = out.value.map((x) => x.text).join(' ');
  const checks = runSafeguards({
    sentences: out.value,
    sourceText: documentText,
    registryNames: namesInText(summaryText, await registryNames(db), t.filingIsin),
  });
  const callId = await recordAiCall(db, {
    ...base, modelId: out.modelId, output: { sentences: out.value }, checks, outcome: checks.passed ? 'accepted' : 'withheld',
    usage: out.usage, costInr: cost, latencyMs: out.latencyMs,
  });
  if (!checks.passed) {
    deps.log(`summarise story ${storyId}: withheld (${checks.failures.map((f) => f.check).join(',')})`);
    await checkWithholdRate(db, deps, now);
    return 'withheld';
  }
  await saveSummary(db, {
    storyId, sourceItemId: t.primaryItemId, body: summaryText, citations: out.value.map((x) => x.citedText), checks,
    modelId: out.modelId, promptVersion: SUMMARISE_PROMPT_VERSION, aiCallId: callId, at: now,
  });
  await emitStoryEvent(db, 'story.updated', storyId);
  await checkWithholdRate(db, deps, now);
  return 'accepted';
}

async function checkWithholdRate(db: pg.ClientBase, deps: AiDeps, now: Date) {
  const r = await withholdRateToday(db, now);
  if (r.total >= WITHHOLD_ALERT_MIN_CALLS && r.withheld / r.total > WITHHOLD_ALERT_SHARE) {
    await notify(db, deps, 'ai.withhold_rate', istDay(now), 'Summary withhold rate above 20% today', `${r.withheld} of ${r.total} summaries withheld (IST day). Above 20% for a week reopens D-025.`, now);
  }
}
