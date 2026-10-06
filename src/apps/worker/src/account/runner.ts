import type pg from 'pg';
import { ACCOUNT_QUEUE, claimJob, completeJob, failJob, processDeletion, processExport } from '@stockpanic/db';
import type { Mailer } from '@stockpanic/mail';

export interface AccountDrainResult {
  deleted: number;
  exported: number;
  emailed: number;
  failed: number;
  errors: string[];
}

// Account deletion and data export jobs (PRD-007 US-007.3). Each job and its effect commit together.
export async function drainAccountJobs(db: pg.ClientBase, workerId: string, now: () => Date = () => new Date(), mailer?: Mailer): Promise<AccountDrainResult> {
  const result: AccountDrainResult = { deleted: 0, exported: 0, emailed: 0, failed: 0, errors: [] };
  for (;;) {
    const job = await claimJob(db, ACCOUNT_QUEUE, workerId);
    if (!job) break;
    let inTransaction = false;
    try {
      const kind = job.payload['kind'];
      if (kind === 'email') {
        if (!mailer) throw new Error('email job claimed without a mailer');
        const { to, subject, text } = job.payload;
        if (typeof to !== 'string' || typeof subject !== 'string' || typeof text !== 'string') throw new Error('invalid email job payload');
        // Network I/O is deliberately outside the database transaction. The job is at-least-once:
        // a process crash after SMTP accepts a message but before completion may deliver it twice.
        await mailer.send({ to, subject, text });
        await completeJob(db, job.id);
        result.emailed++;
        continue;
      }
      await db.query('BEGIN');
      inTransaction = true;
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
      inTransaction = false;
    } catch (err) {
      if (inTransaction) await db.query('ROLLBACK').catch(() => undefined);
      result.errors.push(`job ${job.id}: ${(err as Error).message}`);
      if ((await failJob(db, job, (err as Error).message, false)) === 'failed') result.failed++;
    }
  }
  return result;
}
