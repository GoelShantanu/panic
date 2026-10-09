import type pg from 'pg';
import { AliasIndex } from '@stockpanic/core';
import { PIPELINE_QUEUE, claimJob, clusterThresholds, completeJob, failJob, loadAliasEntries } from '@stockpanic/db';
import { PermanentJobError, istDate, processItem } from './process-item.ts';
import type { PipelineContext } from './process-item.ts';

export async function buildPipelineContext(db: pg.ClientBase, now: Date): Promise<PipelineContext> {
  return {
    aliases: new AliasIndex(await loadAliasEntries(db, istDate(now))),
    aliasDate: istDate(now),
    historicalAliases: new Map(),
    thresholds: await clusterThresholds(db),
  };
}

export interface DrainResult {
  processed: number;
  created: number;
  joined: number;
  skipped: number;
  retried: number;
  failed: number;
  errors: string[];
}

// Processes pipeline jobs until the queue has nothing runnable (or maxJobs is reached).
export async function drainPipeline(
  db: pg.ClientBase,
  ctx: PipelineContext,
  opts: { workerId: string; maxJobs?: number },
): Promise<DrainResult> {
  const result: DrainResult = { processed: 0, created: 0, joined: 0, skipped: 0, retried: 0, failed: 0, errors: [] };
  while (opts.maxJobs === undefined || result.processed + result.failed + result.retried < opts.maxJobs) {
    const job = await claimJob(db, PIPELINE_QUEUE, opts.workerId);
    if (!job) break;
    const itemId = job.payload['item_id'];
    try {
      if (typeof itemId !== 'string' && typeof itemId !== 'number') throw new PermanentJobError('payload has no item_id');
      await db.query('BEGIN');
      const r = await processItem(db, String(itemId), ctx, { revised: job.payload['revised'] === true });
      await completeJob(db, job.id);
      await db.query('COMMIT');
      result.processed++;
      if (r.skipped) result.skipped++;
      else if (r.created) result.created++;
      else result.joined++;
    } catch (err) {
      await db.query('ROLLBACK').catch(() => undefined);
      const message = (err as Error).message;
      result.errors.push(`job ${job.id}: ${message}`);
      const outcome = await failJob(db, job, message, err instanceof PermanentJobError);
      if (outcome === 'failed') result.failed++;
      else result.retried++;
    }
  }
  return result;
}
