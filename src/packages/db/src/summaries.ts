// Reports on AI summaries and the operator's hide / regenerate / dismiss decision (PRD-004 US-004.4 AC-5; D-046).

import type pg from 'pg';
import { enqueueAiJob } from './ai.ts';

// A summary can be reported only while it is shown. One report per reader per story.
export async function reportSummary(db: pg.ClientBase, storyPublicId: string, userId: string, now: Date): Promise<'created' | 'duplicate' | 'no_summary'> {
  const { rows } = await db.query(
    `SELECT s.id FROM story s JOIN story_summary sm ON sm.story_id = s.id AND sm.status = 'shown' WHERE s.public_id = $1 AND s.merged_into IS NULL`,
    [storyPublicId],
  );
  if (!rows[0]) return 'no_summary';
  const ins = await db.query(
    `INSERT INTO summary_report (story_id, user_id, reported_at) VALUES ($1, $2, $3)
     ON CONFLICT (story_id, user_id) DO UPDATE SET reported_at = EXCLUDED.reported_at, reviewed_at = NULL
       WHERE summary_report.reviewed_at IS NOT NULL
     RETURNING id`,
    [rows[0].id, userId, now],
  );
  return ins.rows[0] ? 'created' : 'duplicate';
}

export async function summaryQueue(db: pg.ClientBase, limit = 100) {
  const { rows } = await db.query(
    `SELECT s.public_id AS story_id, p.headline, sm.body AS summary, sm.status, sm.generated_at,
            count(*)::int AS reports, max(r.reported_at) AS last_report_at
       FROM summary_report r
       JOIN story s ON s.id = r.story_id AND s.merged_into IS NULL
       JOIN item p ON p.id = s.primary_item_id
       LEFT JOIN story_summary sm ON sm.story_id = s.id
      WHERE r.reviewed_at IS NULL
      GROUP BY s.id, s.public_id, p.headline, sm.body, sm.status, sm.generated_at
      ORDER BY reports DESC, last_report_at DESC
      LIMIT $1`,
    [limit],
  );
  return rows;
}

export type SummaryAction = 'hide' | 'regenerate' | 'dismiss';

// Hide keeps the text for the record; regenerate deletes it (the old text goes into the audit row)
// and queues a fresh attempt, which passes the same grounding checks or is withheld.
export async function actOnSummary(db: pg.ClientBase, storyPublicId: string, action: SummaryAction, operatorId: string, reason: string, now: Date): Promise<string | null> {
  await db.query('BEGIN');
  try {
    const { rows } = await db.query(
      `SELECT s.id, sm.body, sm.status FROM story s LEFT JOIN story_summary sm ON sm.story_id = s.id WHERE s.public_id = $1 AND s.merged_into IS NULL FOR UPDATE OF s`,
      [storyPublicId],
    );
    const s = rows[0];
    if (!s || (action !== 'dismiss' && s.body === null)) {
      await db.query('ROLLBACK');
      return null;
    }
    if (action === 'hide') await db.query(`UPDATE story_summary SET status = 'hidden_by_operator' WHERE story_id = $1`, [s.id]);
    if (action === 'regenerate') {
      await db.query('DELETE FROM story_summary WHERE story_id = $1', [s.id]);
      await enqueueAiJob(db, 'summarise', { story_id: String(s.id) }, 5);
    }
    await db.query('UPDATE summary_report SET reviewed_at = $2 WHERE story_id = $1 AND reviewed_at IS NULL', [s.id, now]);
    const a = await db.query(
      `INSERT INTO audit_log (at, actor_type, actor_id, action, entity_type, entity_id, before, after) VALUES ($1, 'operator', $2, $3, 'story', $4, $5, $6) RETURNING id`,
      [now, operatorId, `summary.${action}`, storyPublicId, JSON.stringify(s.body === null ? null : { body: s.body, status: s.status }), JSON.stringify({ reason })],
    );
    await db.query('COMMIT');
    return String(a.rows[0].id);
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}
