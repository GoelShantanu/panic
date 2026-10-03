import type pg from 'pg';
import {
  AliasIndex,
  CLUSTER_WINDOW_MS,
  RULES_VERSION,
  attachScore,
  bestArticleStory,
  classifyFiling,
  classifyHeadline,
  combineEventTypes,
  extractNumbers,
  filingExplainsStory,
  headlineShingles,
  isExchangeTwin,
  lshBands,
  wordSet,
} from '@stockpanic/core';
import type { FilingFeatures, ItemFeatures } from '@stockpanic/core';
import {
  addItemToStory,
  aiEnabled,
  candidateStoryIds,
  createStory,
  emitStoryEvent,
  enqueueAiJob,
  enqueueAlertEvaluation,
  loadPipelineItem,
  loadStoryItems,
  resolveExchangeCode,
  saveItemAnalysis,
  saveStoryBands,
  setStoryDerived,
  storyOfItem,
} from '@stockpanic/db';
import type { ItemAnalysis, ItemTag, PipelineItem, StoryItem } from '@stockpanic/db';

// Serialises the clustering step so two near-simultaneous duplicates cannot both start stories.
export const CLUSTER_LOCK_KEY = 730_120_262;

export class PermanentJobError extends Error {}

export interface PipelineContext {
  aliases: AliasIndex;
  thresholds: { merge: number; attach: number };
}

const IST_OFFSET_MS = 5.5 * 3600 * 1000;
export const istDate = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const itemTime = (item: PipelineItem) => item.publishedAt ?? item.firstSeenAt;

async function analyse(db: pg.ClientBase, item: PipelineItem, ctx: PipelineContext): Promise<ItemAnalysis> {
  let eventTypes;
  let tags: ItemTag[] = [];
  let unresolved: string[] = [];
  if (item.filing) {
    eventTypes = classifyFiling(item.headline, item.filing.category);
    const isin = await resolveExchangeCode(db, item.filing.exchange, item.filing.scripCode, istDate(itemTime(item)));
    if (isin) tags = [{ isin, method: 'exchange_code' }];
  } else {
    eventTypes = classifyHeadline(item.headline);
    const r = ctx.aliases.resolve(item.headline);
    tags = r.isins.map((isin) => ({ isin, method: 'rule' }));
    unresolved = r.unresolved;
  }
  return {
    eventTypes,
    tags,
    unresolved,
    numbers: extractNumbers(item.headline),
    shingles: headlineShingles(item.headline),
    rulesVersion: RULES_VERSION,
  };
}

const features = (a: ItemAnalysis, at: Date): ItemFeatures => ({
  shingles: a.shingles,
  numbers: a.numbers,
  isins: a.tags.map((t) => t.isin),
  eventTypes: a.eventTypes,
  at,
});

const filingFeatures = (a: ItemAnalysis, at: Date, exchange: string, subject: string): FilingFeatures => ({
  ...features(a, at),
  exchange,
  subjectWords: wordSet(subject),
});

function chooseTarget(item: PipelineItem, analysis: ItemAnalysis, candidates: StoryItem[], ctx: PipelineContext): string | null {
  const byStory = new Map<string, StoryItem[]>();
  for (const c of candidates) byStory.set(c.storyId, [...(byStory.get(c.storyId) ?? []), c]);
  const stories = [...byStory.entries()];
  const hasFiling = (items: StoryItem[]) => items.some((i) => i.kind === 'filing');
  const self = features(analysis, itemTime(item));

  if (item.filing) {
    // S2: the same announcement on the other exchange.
    const selfF = filingFeatures(analysis, itemTime(item), item.filing.exchange, item.headline);
    for (const [storyId, items] of stories) {
      for (const f of items.filter((i) => i.kind === 'filing' && i.exchange)) {
        if (isExchangeTwin(selfF, filingFeatures(f.analysis, f.at, f.exchange!, f.headline))) return storyId;
      }
    }
    // S3: each filing anchors its own story, unless it explains an article-only story.
    for (const [storyId, items] of stories) {
      if (!hasFiling(items) && filingExplainsStory(self, items.map((i) => features(i.analysis, i.at)))) return storyId;
    }
    return null;
  }

  // S4: an article joins the filing story it reports on.
  let best: { storyId: string; score: number } | null = null;
  for (const [storyId, items] of stories) {
    for (const f of items.filter((i) => i.kind === 'filing')) {
      const score = attachScore(self, features(f.analysis, f.at));
      if (score !== null && score >= ctx.thresholds.attach && (!best || score > best.score)) best = { storyId, score };
    }
  }
  if (best) return best.storyId;

  // S5: article ↔ article, conservatively.
  return bestArticleStory(
    self,
    stories.filter(([, items]) => !hasFiling(items)).map(([id, items]) => ({ id, items: items.map((i) => features(i.analysis, i.at)) })),
    ctx.thresholds.merge,
  );
}

// deduplication.md §5: primary item, source count, event types and tags from the story's items.
export async function recomputeStory(db: pg.ClientBase, storyId: string): Promise<void> {
  const items = await loadStoryItems(db, [storyId]);
  const filings = items.filter((i) => i.kind === 'filing');
  const byTime = (a: StoryItem, b: StoryItem) => a.at.getTime() - b.at.getTime() || Number(a.itemId) - Number(b.itemId);
  const primary = filings.length > 0 ? [...filings].sort(byTime)[0]! : [...items].sort((a, b) => a.tier - b.tier || byTime(a, b))[0]!;
  const authoritative = filings.length > 0 ? filings : items;

  const tags = new Map<string, ItemTag>();
  for (const i of authoritative) for (const t of i.analysis.tags) if (!tags.has(t.isin)) tags.set(t.isin, t);

  await setStoryDerived(db, storyId, {
    primaryItemId: primary.itemId,
    sourceCount: new Set(items.map((i) => i.sourceId)).size,
    eventTypes: combineEventTypes(authoritative.map((i) => i.analysis.eventTypes)),
    tags: [...tags.values()],
    unresolved: filings.length > 0 ? [] : [...new Set(items.flatMap((i) => i.analysis.unresolved))],
  });
}

export interface ProcessResult {
  storyId: string;
  created: boolean;
  skipped: boolean;
}

// Runs inside the caller's transaction, which also completes the job.
async function queueAi(db: pg.ClientBase, item: PipelineItem, analysis: ItemAnalysis, storyId: string): Promise<void> {
  // The model refines after publication (D-034): articles always, filings only when rules found
  // nothing; summaries for filing stories (the AI job re-checks eligibility).
  if (!(await aiEnabled(db))) return;
  if (!item.filing || (analysis.eventTypes.length === 1 && analysis.eventTypes[0] === 'other')) {
    await enqueueAiJob(db, 'classify', { item_id: item.id }, item.filing ? 20 : 5);
  }
  if (item.filing) await enqueueAiJob(db, 'summarise', { story_id: storyId }, 0);
}

// `revised`: the exchange changed a filing already in a story (PRD-002 §9). It keeps its item and
// story; analysis and story are recomputed.
export async function processItem(db: pg.ClientBase, itemId: string, ctx: PipelineContext, opts: { revised?: boolean } = {}): Promise<ProcessResult> {
  const item = await loadPipelineItem(db, itemId);
  if (!item) throw new PermanentJobError(`item ${itemId} not found`);
  const existing = await storyOfItem(db, itemId);
  if (existing && !opts.revised) return { storyId: existing, created: false, skipped: true };

  const analysis = await analyse(db, item, ctx);
  await saveItemAnalysis(db, itemId, analysis);
  if (existing) {
    await db.query('SELECT pg_advisory_xact_lock($1)', [CLUSTER_LOCK_KEY]);
    await recomputeStory(db, existing);
    await emitStoryEvent(db, 'story.updated', existing);
    await enqueueAlertEvaluation(db, existing);
    await queueAi(db, item, analysis, existing);
    return { storyId: existing, created: false, skipped: false };
  }

  await db.query('SELECT pg_advisory_xact_lock($1)', [CLUSTER_LOCK_KEY]);
  const at = itemTime(item);
  const bands = lshBands(analysis.shingles);
  const candidates = await loadStoryItems(
    db,
    await candidateStoryIds(db, analysis.tags.map((t) => t.isin), bands, new Date(at.getTime() - CLUSTER_WINDOW_MS)),
  );

  const target = chooseTarget(item, analysis, candidates, ctx);
  // A filing found late by reconciliation takes its original time, so it does not surface as new.
  const storyId = target ?? (await createStory(db, itemId, item.backfilled && item.publishedAt ? item.publishedAt : item.firstSeenAt));
  if (target) await addItemToStory(db, target, itemId);
  await recomputeStory(db, storyId);
  await saveStoryBands(db, storyId, bands, new Date(at.getTime() + CLUSTER_WINDOW_MS));
  await emitStoryEvent(db, target ? 'story.updated' : 'story.created', storyId);
  await enqueueAlertEvaluation(db, storyId); // PRD-003 US-003.5
  await queueAi(db, item, analysis, storyId);
  return { storyId, created: target === null, skipped: false };
}
