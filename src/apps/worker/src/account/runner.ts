import type pg from 'pg';
import { ACCOUNT_QUEUE, claimJob, completeJob, failJob, processDeletion, processExport } from '@stockpanic/db';

export interface AccountDrainResult {
  deleted: number;
  exported: number;
  failed: number;
  errors: string[];
}

// Account deletion and data export jobs (PRD-007 US-007.3). Each job and its effect commit together.
export async function drainAccountJobs(db: pg.ClientBase, workerId: string, now: () => Date = () => new Date()): Promise<AccountDrainResult> {
  const result: AccountDrainResult = { deleted: 0, exported: 0, failed: 0, errors: [] };
  for (;;) {
    const job = await claimJob(db, ACCOUNT_QUEUE, workerId);
    if (!job) break;
    try {
      await db.query('BEGIN');
      const kind = job.payload['kind'];
      if (kind === 'delete') {
        await processDeletion(db, String(job.payload['user_id']), now());
        result.deleted++;
      } else if (kind === 'export') {
        await processExport(db, String(job.payload['export_id']), now());
        result.exported++;
      } else {
        throw new Error(`unknown account job kind: ${String(kind)}`);
      }
      await completeJob(db, job.id);
      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK').catch(() => undefined);
      result.errors.push(`job ${job.id}: ${(err as Error).message}`);
      if ((await failJob(db, job, (err as Error).message, false)) === 'failed') result.failed++;
    }
  }
  return result;
}
