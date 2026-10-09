import type pg from 'pg';
import { AI_QUEUE, claimJob, completeJob, failJob } from '@stockpanic/db';
import { runClassify, runSummarise } from './jobs.ts';
import type { AiDeps, JobResult } from './jobs.ts';

export interface AiDrainResult {
  counts: Partial<Record<JobResult | 'retried' | 'failed', number>>;
  errors: string[];
}

// Processes AI jobs until none are runnable (or maxJobs is reached).
export async function drainAi(db: pg.ClientBase, deps: AiDeps, opts: { workerId: string; newsOnly?: boolean; maxJobs?: number; now?: () => Date }): Promise<AiDrainResult> {
  const out: AiDrainResult = { counts: {}, errors: [] };
  const bump = (k: JobResult | 'retried' | 'failed') => (out.counts[k] = (out.counts[k] ?? 0) + 1);
  const now = opts.now ?? (() => new Date());
  for (let n = 0; opts.maxJobs === undefined || n < opts.maxJobs; n++) {
    const job = await claimJob(db, AI_QUEUE, opts.workerId);
    if (!job) break;
    const { kind, item_id: itemId, story_id: storyId } = job.payload as Record<string, unknown>;
    try {
      let r: JobResult;
      if (opts.newsOnly && kind === 'summarise') r = 'skipped';
      else if (kind === 'classify' && (typeof itemId === 'string' || typeof itemId === 'number')) r = await runClassify(db, deps, String(itemId), now());
      else if (kind === 'summarise' && (typeof storyId === 'string' || typeof storyId === 'number')) r = await runSummarise(db, deps, String(storyId), now());
      else throw new Error(`bad payload ${JSON.stringify(job.payload)}`);
      await completeJob(db, job.id);
      bump(r);
    } catch (err) {
      const message = (err as Error).message;
      out.errors.push(`job ${job.id}: ${message}`);
      bump((await failJob(db, job, message, message.startsWith('bad payload'))) === 'failed' ? 'failed' : 'retried');
    }
  }
  return out;
}
