import type pg from 'pg';
import { REMOVED_CONTENT_RETENTION_DAYS, daysFrom, grievanceReference, newPublicId } from '@stockpanic/core';
import type { QualityVote, VoteCounts, VoteDirection } from '@stockpanic/core';

async function tx<T>(db: pg.ClientBase, fn: () => Promise<T>): Promise<T> {
  await db.query('BEGIN');
  try {
    const r = await fn();
    await db.query('COMMIT');
    return r;
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

async function audit(
  db: pg.ClientBase,
  a: { actorType: 'user' | 'operator' | 'system'; actorId: string | null; action: string; entityType: string; entityId: string; before?: unknown; after?: unknown; ip?: string | null; at: Date },
): Promise<void> {
  const { rows } = await db.query(
    `INSERT INTO audit_log (at, actor_type, actor_id, action, entity_type, entity_id, before, after)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [a.at, a.actorType, a.actorId, a.action, a.entityType, a.entityId, a.before ?? null, a.after ?? null],
  );
  // IPs live apart from the audit row and are dropped after 180 days (PRD-005 OQ-005.6).
  if (a.ip) await db.query('INSERT INTO ip_log (audit_id, at, ip) VALUES ($1, $2, $3)', [rows[0].id, a.at, a.ip]);
}

const storyPublicId = async (db: pg.ClientBase, storyId: string) => (await db.query('SELECT public_id FROM story WHERE id = $1', [storyId])).rows[0].public_id as string;

// ---------------------------------------------------------------- votes (PRD-005)

export async function recentUserActions(db: pg.ClientBase, userId: string, actionPrefix: string, since: Date): Promise<number> {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM audit_log WHERE actor_type = 'user' AND actor_id = $1 AND at > $2 AND action LIKE $3`,
    [userId, since, `${actionPrefix}%`],
  );
  return rows[0].n;
}

export async function oldestUserActionSince(db: pg.ClientBase, userId: string, actionPrefix: string, since: Date): Promise<Date | null> {
  const { rows } = await db.query(
    `SELECT min(at) AS at FROM audit_log WHERE actor_type = 'user' AND actor_id = $1 AND at > $2 AND action LIKE $3`,
    [userId, since, `${actionPrefix}%`],
  );
  return rows[0].at;
}

export async function setDirectionalVote(db: pg.ClientBase, storyId: string, userId: string, vote: string | null, ip: string | null, now: Date): Promise<void> {
  await tx(db, async () => {
    const prev = (await db.query('SELECT direction FROM vote_directional WHERE story_id = $1 AND user_id = $2 FOR UPDATE', [storyId, userId])).rows[0]?.direction ?? null;
    if (prev === vote) return;
    if (vote === null) await db.query('DELETE FROM vote_directional WHERE story_id = $1 AND user_id = $2', [storyId, userId]);
    else {
      await db.query(
        `INSERT INTO vote_directional (story_id, user_id, direction, cast_at, updated_at) VALUES ($1, $2, $3, $4, $4)
         ON CONFLICT (story_id, user_id) DO UPDATE SET direction = EXCLUDED.direction, updated_at = EXCLUDED.updated_at`,
        [storyId, userId, vote, now],
      );
    }
    await audit(db, {
      actorType: 'user',
      actorId: userId,
      action: vote === null ? 'vote.removed' : prev === null ? 'vote.cast' : 'vote.changed',
      entityType: 'story',
      entityId: await storyPublicId(db, storyId),
      before: prev === null ? null : { direction: prev },
      after: vote === null ? null : { direction: vote },
      ip,
      at: now,
    });
  });
}

export async function setQualityVote(db: pg.ClientBase, storyId: string, userId: string, kind: string, on: boolean, detail: unknown, ip: string | null, now: Date): Promise<void> {
  await tx(db, async () => {
    const exists = (await db.query('SELECT 1 FROM vote_quality WHERE story_id = $1 AND user_id = $2 AND kind = $3', [storyId, userId, kind])).rowCount;
    if (!!exists === on) return;
    if (on) await db.query('INSERT INTO vote_quality (story_id, user_id, kind, detail, cast_at) VALUES ($1, $2, $3, $4, $5)', [storyId, userId, kind, detail ?? null, now]);
    else await db.query('DELETE FROM vote_quality WHERE story_id = $1 AND user_id = $2 AND kind = $3', [storyId, userId, kind]);
    await audit(db, {
      actorType: 'user',
      actorId: userId,
      action: on ? 'vote.quality_cast' : 'vote.quality_removed',
      entityType: 'story',
      entityId: await storyPublicId(db, storyId),
      after: { kind, ...(detail ? { detail } : {}) },
      ip,
      at: now,
    });
  });
}

// Keyed by story public ID, so stream cards can be personalised after loading.
export async function viewerVotes(db: pg.ClientBase, userId: string, storyPublicIds: readonly string[]) {
  const out = new Map<string, { directional: VoteDirection | null; quality: QualityVote[] }>();
  if (storyPublicIds.length === 0) return out;
  for (const id of storyPublicIds) out.set(id, { directional: null, quality: [] });
  const d = await db.query(
    'SELECT s.public_id, v.direction FROM vote_directional v JOIN story s ON s.id = v.story_id WHERE v.user_id = $1 AND s.public_id = ANY($2::text[])',
    [userId, storyPublicIds],
  );
  for (const r of d.rows) out.get(r.public_id)!.directional = r.direction;
  const q = await db.query(
    'SELECT s.public_id, v.kind FROM vote_quality v JOIN story s ON s.id = v.story_id WHERE v.user_id = $1 AND s.public_id = ANY($2::text[]) ORDER BY v.kind',
    [userId, storyPublicIds],
  );
  for (const r of q.rows) out.get(r.public_id)!.quality.push(r.kind);
  return out;
}

export async function storyVoteCounts(db: pg.ClientBase, storyId: string): Promise<VoteCounts> {
  const { rows } = await db.query('SELECT bullish, bearish, neutral, important FROM story_vote_count WHERE story_id = $1', [storyId]);
  return rows[0] ?? { bullish: 0, bearish: 0, neutral: 0, important: 0 };
}

// ---------------------------------------------------------------- comments (PRD-006)

export async function commentSwitches(db: pg.ClientBase, storyId: string): Promise<{ posting: boolean; visible: boolean }> {
  const { rows } = await db.query(
    `SELECT (SELECT (value #>> '{}')::boolean FROM setting WHERE key = 'comments_posting_enabled') AS g_post,
            (SELECT (value #>> '{}')::boolean FROM setting WHERE key = 'comments_visible') AS g_vis,
            c.posting_enabled, c.visible
       FROM (SELECT 1) x LEFT JOIN story_comment_control c ON c.story_id = $1`,
    [storyId],
  );
  const r = rows[0];
  return { posting: r.g_post !== false && r.posting_enabled !== false, visible: r.g_vis !== false && r.visible !== false };
}

export interface CommentRow {
  id: string;
  publicId: string;
  storyId: string;
  userId: string;
  parentId: string | null;
  depth: number;
  body: string | null;
  state: 'visible' | 'deleted_by_author' | 'removed';
  removedReason: string | null;
  createdAt: Date;
  editedAt: Date | null;
}

const commentRow = (r: any): CommentRow => ({
  id: String(r.id),
  publicId: r.public_id,
  storyId: String(r.story_id),
  userId: String(r.user_id),
  parentId: r.parent_id === null ? null : String(r.parent_id),
  depth: r.depth,
  body: r.body,
  state: r.state,
  removedReason: r.removed_reason,
  createdAt: r.created_at,
  editedAt: r.edited_at,
});

export async function findComment(db: pg.ClientBase, publicId: string): Promise<CommentRow | null> {
  const { rows } = await db.query('SELECT * FROM comment WHERE public_id = $1', [publicId]);
  return rows[0] ? commentRow(rows[0]) : null;
}

// Oldest-first threads, 50 per page; each thread's replies in full (PRD-006 US-006.2 AC-2).
export async function commentThreads(db: pg.ClientBase, storyId: string, after: { at: Date; id: string } | null, limit: number) {
  const top = await db.query(
    `SELECT c.*, u.username, u.deleted_at IS NOT NULL AS author_deleted FROM comment c JOIN app_user u ON u.id = c.user_id
      WHERE c.story_id = $1 AND c.parent_id IS NULL AND ($2::timestamptz IS NULL OR (c.created_at, c.id) > ($2::timestamptz, $3::bigint))
      ORDER BY c.created_at, c.id LIMIT $4`,
    [storyId, after?.at ?? null, after?.id ?? null, limit + 1],
  );
  const threads = top.rows.slice(0, limit);
  const ids = threads.map((t) => t.id);
  const replies = ids.length
    ? (
        await db.query(
          `WITH RECURSIVE tree AS (
             SELECT c.* FROM comment c WHERE c.parent_id = ANY($1::bigint[])
             UNION ALL
             SELECT c.* FROM comment c JOIN tree t ON c.parent_id = t.id
           )
           SELECT t.*, u.username, u.deleted_at IS NOT NULL AS author_deleted FROM tree t JOIN app_user u ON u.id = t.user_id
           ORDER BY t.created_at, t.id`,
          [ids],
        )
      ).rows
    : [];
  return { threads, replies, hasMore: top.rows.length > limit };
}

export async function recentComments(db: pg.ClientBase, userId: string, now: Date): Promise<{ lastAt: Date | null; lastHour: number; oldestInHour: Date | null }> {
  const { rows } = await db.query(
    `SELECT max(created_at) AS last_at,
            count(*) FILTER (WHERE created_at > $2::timestamptz - interval '1 hour')::int AS last_hour,
            min(created_at) FILTER (WHERE created_at > $2::timestamptz - interval '1 hour') AS oldest
       FROM comment WHERE user_id = $1`,
    [userId, now],
  );
  return { lastAt: rows[0].last_at, lastHour: rows[0].last_hour, oldestInHour: rows[0].oldest };
}

export async function createComment(db: pg.ClientBase, storyId: string, userId: string, body: string, parentId: string | null, now: Date): Promise<CommentRow> {
  return tx(db, async () => {
    const { rows } = await db.query(
      `INSERT INTO comment (public_id, story_id, user_id, parent_id, body, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [newPublicId('cm'), storyId, userId, parentId, body, now],
    );
    const c = commentRow(rows[0]);
    await audit(db, { actorType: 'user', actorId: userId, action: 'comment.created', entityType: 'comment', entityId: c.publicId, at: now });
    return c;
  });
}

export async function editComment(db: pg.ClientBase, c: CommentRow, body: string, now: Date): Promise<void> {
  await tx(db, async () => {
    await db.query('INSERT INTO comment_revision (comment_id, body, revised_at) VALUES ($1, $2, $3)', [c.id, c.body, now]);
    await db.query('UPDATE comment SET body = $2, edited_at = $3 WHERE id = $1', [c.id, body, now]);
    await audit(db, { actorType: 'user', actorId: c.userId, action: 'comment.edited', entityType: 'comment', entityId: c.publicId, at: now });
  });
}

export async function deleteOwnComment(db: pg.ClientBase, c: CommentRow, now: Date): Promise<void> {
  await tx(db, async () => {
    await db.query('INSERT INTO comment_revision (comment_id, body, revised_at, purge_after) VALUES ($1, $2, $3, $4)', [
      c.id,
      c.body,
      now,
      daysFrom(now, REMOVED_CONTENT_RETENTION_DAYS),
    ]);
    await db.query(`UPDATE comment SET state = 'deleted_by_author', body = NULL WHERE id = $1`, [c.id]);
    await audit(db, { actorType: 'user', actorId: c.userId, action: 'comment.deleted', entityType: 'comment', entityId: c.publicId, at: now });
  });
}

async function nextReference(db: pg.ClientBase, now: Date): Promise<string> {
  const { rows } = await db.query(`SELECT nextval('grievance_reference_seq') AS n`);
  return grievanceReference(now.getUTCFullYear(), rows[0].n);
}

const URGENT_REASONS = new Set(['obscene']); // PRD-006 US-006.8 AC-3: 24 h

// A report joins the comment's open grievance, or opens one under the report's own reference
// (PRD-006 US-006.7 AC-4).
export async function reportComment(
  db: pg.ClientBase,
  c: CommentRow,
  reporterId: string,
  reason: string,
  detail: string | null,
  now: Date,
): Promise<{ ok: true; reference: string } | { ok: false; error: 'already_reported' }> {
  await db.query('BEGIN');
  try {
    const reference = await nextReference(db, now);
    const ins = await db.query(
      `INSERT INTO comment_report (reference, comment_id, reporter_id, reason, detail, created_at) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (comment_id, reporter_id) DO NOTHING RETURNING id`,
      [reference, c.id, reporterId, reason, detail, now],
    );
    if (!ins.rows[0]) {
      await db.query('ROLLBACK');
      return { ok: false, error: 'already_reported' };
    }
    const open = await db.query(`SELECT id FROM grievance WHERE comment_id = $1 AND status IN ('open', 'acknowledged')`, [c.id]);
    if (open.rows[0]) {
      if (URGENT_REASONS.has(reason)) await db.query('UPDATE grievance SET urgent = true WHERE id = $1', [open.rows[0].id]);
    } else {
      await db.query(
        `INSERT INTO grievance (reference, source, urgent, comment_id, details, received_at) VALUES ($1, 'report', $2, $3, $4, $5)`,
        [reference, URGENT_REASONS.has(reason), c.id, `${reason}${detail ? `: ${detail}` : ''}`, now],
      );
    }
    await audit(db, { actorType: 'user', actorId: reporterId, action: 'comment.reported', entityType: 'comment', entityId: c.publicId, after: { reason }, at: now });
    await db.query('COMMIT');
    return { ok: true, reference };
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

// Public grievance form: no account needed (PRD-006 US-006.8 AC-1).
export async function createGrievance(db: pg.ClientBase, g: { email: string; details: string; commentId: string | null; urgent: boolean; source: 'form' | 'court_order' | 'government_notice' }, now: Date): Promise<string> {
  const reference = await nextReference(db, now);
  await db.query(
    `INSERT INTO grievance (reference, source, urgent, comment_id, complainant_email, details, received_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [reference, g.source, g.urgent, g.commentId, g.email, g.details, now],
  );
  return reference;
}

// ---------------------------------------------------------------- profiles and replies (PRD-006 US-006.10, US-006.5)

export async function userProfile(db: pg.ClientBase, username: string) {
  const u = await db.query(`SELECT id, username, created_at FROM app_user WHERE username = $1 AND deleted_at IS NULL`, [username]);
  if (!u.rows[0]) return null;
  const comments = await db.query(
    `SELECT c.public_id, c.body, c.created_at, c.edited_at, s.public_id AS story_id
       FROM comment c JOIN story s ON s.id = c.story_id
      WHERE c.user_id = $1 AND c.state = 'visible' ORDER BY c.created_at DESC LIMIT 50`,
    [u.rows[0].id],
  );
  return {
    username: u.rows[0].username as string,
    joined: (u.rows[0].created_at as Date).toISOString().slice(0, 7),
    comments: comments.rows.map((r) => ({ comment_id: r.public_id, story_id: r.story_id, body: r.body, created_at: r.created_at, edited: r.edited_at !== null })),
  };
}

export async function repliesTo(db: pg.ClientBase, userId: string) {
  const { rows } = await db.query(
    `SELECT r.public_id, r.body, r.created_at, s.public_id AS story_id, a.username, p.public_id AS in_reply_to
       FROM comment r JOIN comment p ON p.id = r.parent_id JOIN story s ON s.id = r.story_id JOIN app_user a ON a.id = r.user_id
      WHERE p.user_id = $1 AND r.user_id <> $1 AND r.state = 'visible'
      ORDER BY r.created_at DESC LIMIT 50`,
    [userId],
  );
  return rows;
}

export async function hasUnreadReplies(db: pg.ClientBase, userId: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT EXISTS (SELECT 1 FROM comment r JOIN comment p ON p.id = r.parent_id JOIN app_user u ON u.id = p.user_id
                     WHERE p.user_id = $1 AND r.user_id <> $1 AND r.state = 'visible'
                       AND (u.replies_seen_at IS NULL OR r.created_at > u.replies_seen_at)) AS e`,
    [userId],
  );
  return rows[0].e;
}

export async function markRepliesSeen(db: pg.ClientBase, userId: string, now: Date): Promise<void> {
  await db.query('UPDATE app_user SET replies_seen_at = $2 WHERE id = $1', [userId, now]);
}

export async function unseenNotices(db: pg.ClientBase, userId: string) {
  const { rows } = await db.query(`SELECT id, kind, payload, created_at FROM user_notice WHERE user_id = $1 AND seen_at IS NULL ORDER BY created_at DESC`, [userId]);
  await db.query('UPDATE user_notice SET seen_at = now() WHERE user_id = $1 AND seen_at IS NULL', [userId]);
  return rows.map((r) => ({ kind: r.kind, ...r.payload, created_at: r.created_at }));
}

// ---------------------------------------------------------------- moderation (operator only)

export async function takedownComment(
  db: pg.ClientBase,
  c: CommentRow,
  op: { operatorId: string; reason: string; grievanceId: string | null; reference: string | null },
  now: Date,
): Promise<void> {
  await tx(db, async () => {
    if (c.state === 'visible' && c.body !== null) {
      await db.query('INSERT INTO removed_content (comment_id, body, removed_at, purge_after) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [
        c.id,
        c.body,
        now,
        daysFrom(now, REMOVED_CONTENT_RETENTION_DAYS),
      ]);
    }
    await db.query(`UPDATE comment SET state = 'removed', removed_reason = $2, body = NULL WHERE id = $1`, [c.id, op.reason]);
    await db.query(`INSERT INTO takedown (comment_id, grievance_id, reason, operator_id, reference, taken_at) VALUES ($1, $2, $3, $4, $5, $6)`, [
      c.id,
      op.grievanceId,
      op.reason,
      op.operatorId,
      op.reference,
      now,
    ]);
    await db.query(`INSERT INTO user_notice (user_id, kind, payload) VALUES ($1, 'comment_removed', $2)`, [
      c.userId,
      { comment_id: c.publicId, reason: op.reason, dispute: 'Use the grievance form to dispute this removal.' },
    ]);
    await audit(db, { actorType: 'operator', actorId: op.operatorId, action: 'comment.taken_down', entityType: 'comment', entityId: c.publicId, after: { reason: op.reason, reference: op.reference }, at: now });
  });
}

// A report's reference resolves to the grievance its comment is handled under.
export async function grievanceByReference(db: pg.ClientBase, reference: string) {
  const { rows } = await db.query(
    `SELECT g.* FROM grievance g WHERE g.reference = $1
     UNION ALL
     (SELECT g.* FROM comment_report r JOIN grievance g ON g.comment_id = r.comment_id
       WHERE r.reference = $1 ORDER BY g.received_at DESC LIMIT 1)
     LIMIT 1`,
    [reference],
  );
  return rows[0] ?? null;
}

export async function grievanceQueue(db: pg.ClientBase, now: Date) {
  const { rows } = await db.query(
    `SELECT g.reference, g.source, g.urgent, g.status, g.received_at, g.ack_due_at, g.resolve_due_at, g.acknowledged_at,
            c.public_id AS comment_id, (SELECT count(*)::int FROM comment_report r WHERE r.comment_id = g.comment_id) AS reports,
            g.ack_due_at < $1 AND g.acknowledged_at IS NULL AS ack_overdue, g.resolve_due_at < $1 AS resolve_overdue
       FROM grievance g LEFT JOIN comment c ON c.id = g.comment_id
      WHERE g.status IN ('open', 'acknowledged')
      ORDER BY g.resolve_due_at`,
    [now],
  );
  return rows;
}

export async function updateGrievance(db: pg.ClientBase, reference: string, change: { status: 'acknowledged' | 'resolved' | 'rejected'; decision: string | null }, operatorId: string, now: Date): Promise<boolean> {
  return tx(db, async () => {
    const { rows } = await db.query(
      `UPDATE grievance SET status = $2::grievance_status,
              acknowledged_at = coalesce(acknowledged_at, $4),
              resolved_at = CASE WHEN $2 IN ('resolved', 'rejected') THEN $4 ELSE resolved_at END,
              decision = coalesce($3, decision)
        WHERE reference = $1 RETURNING id`,
      [reference, change.status, change.decision, now],
    );
    if (!rows[0]) return false;
    await audit(db, { actorType: 'operator', actorId: operatorId, action: `grievance.${change.status}`, entityType: 'grievance', entityId: reference, after: { decision: change.decision }, at: now });
    return true;
  });
}

export async function userIdByPublicId(db: pg.ClientBase, publicId: string): Promise<string | null> {
  const { rows } = await db.query('SELECT id FROM app_user WHERE public_id = $1', [publicId]);
  return rows[0] ? String(rows[0].id) : null;
}

export async function setUserRestriction(
  db: pg.ClientBase,
  userId: string,
  kind: 'commenting' | 'voting',
  restricted: boolean,
  operatorId: string,
  reason: string,
  now: Date,
): Promise<void> {
  await tx(db, async () => {
    const column = kind === 'commenting' ? 'comment_suspended_at' : 'voting_revoked_at';
    await db.query(`UPDATE app_user SET ${column} = $2 WHERE id = $1`, [userId, restricted ? now : null]);
    if (restricted) {
      await db.query(`INSERT INTO user_notice (user_id, kind, payload) VALUES ($1, $2, $3)`, [userId, kind === 'commenting' ? 'commenting_suspended' : 'voting_revoked', { reason }]);
    }
    const pub = (await db.query('SELECT public_id FROM app_user WHERE id = $1', [userId])).rows[0].public_id;
    await audit(db, { actorType: 'operator', actorId: operatorId, action: `user.${kind}_${restricted ? 'restricted' : 'restored'}`, entityType: 'user', entityId: pub, after: { reason }, at: now });
  });
}

// PRD-005 US-005.6 AC-2: discounted votes stay stored and audited but leave every count.
export async function discountUserVotes(db: pg.ClientBase, userId: string, discounted: boolean, operatorId: string, reason: string, now: Date): Promise<number> {
  return tx(db, async () => {
    const d = await db.query(`UPDATE vote_directional SET discounted_at = $2 WHERE user_id = $1`, [userId, discounted ? now : null]);
    const q = await db.query(`UPDATE vote_quality SET discounted_at = $2 WHERE user_id = $1`, [userId, discounted ? now : null]);
    const pub = (await db.query('SELECT public_id FROM app_user WHERE id = $1', [userId])).rows[0].public_id;
    await audit(db, { actorType: 'operator', actorId: operatorId, action: discounted ? 'votes.discounted' : 'votes.restored', entityType: 'user', entityId: pub, after: { reason }, at: now });
    return (d.rowCount ?? 0) + (q.rowCount ?? 0);
  });
}

export async function changeSetting(db: pg.ClientBase, key: string, value: unknown, operatorId: string, reason: string, now: Date): Promise<boolean> {
  return tx(db, async () => {
    await db.query(`SET LOCAL stockpanic.audited = 'on'`); // this path writes the audit row itself (migration 0012)
    const prev = await db.query('SELECT value FROM setting WHERE key = $1 FOR UPDATE', [key]);
    if (!prev.rows[0]) return false;
    await db.query('UPDATE setting SET value = $2, updated_at = $3, updated_by = $4 WHERE key = $1', [key, JSON.stringify(value), now, operatorId]);
    await audit(db, { actorType: 'operator', actorId: operatorId, action: 'setting.changed', entityType: 'setting', entityId: key, before: { value: prev.rows[0].value }, after: { value, reason }, at: now });
    return true;
  });
}

export async function setStoryCommentControl(db: pg.ClientBase, storyId: string, posting: boolean, visible: boolean, operatorId: string, reason: string, now: Date): Promise<void> {
  await tx(db, async () => {
    await db.query(
      `INSERT INTO story_comment_control (story_id, posting_enabled, visible, updated_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (story_id) DO UPDATE SET posting_enabled = EXCLUDED.posting_enabled, visible = EXCLUDED.visible, updated_at = EXCLUDED.updated_at`,
      [storyId, posting, visible, now],
    );
    await audit(db, { actorType: 'operator', actorId: operatorId, action: 'comments.story_switch', entityType: 'story', entityId: await storyPublicId(db, storyId), after: { posting, visible, reason }, at: now });
  });
}

// D-021: voters are visible to operators only, and every look is audited.
export async function votersForStory(db: pg.ClientBase, storyId: string, vote: string, operatorId: string, now: Date) {
  const rows =
    vote === 'important'
      ? (await db.query(`SELECT u.public_id, u.username, u.created_at, v.cast_at, v.discounted_at IS NOT NULL AS discounted FROM vote_quality v JOIN app_user u ON u.id = v.user_id WHERE v.story_id = $1 AND v.kind = 'important' ORDER BY v.cast_at DESC`, [storyId])).rows
      : (await db.query(`SELECT u.public_id, u.username, u.created_at, v.cast_at, v.discounted_at IS NOT NULL AS discounted FROM vote_directional v JOIN app_user u ON u.id = v.user_id WHERE v.story_id = $1 AND v.direction = $2 ORDER BY v.cast_at DESC`, [storyId, vote])).rows;
  await audit(db, { actorType: 'operator', actorId: operatorId, action: 'voters.viewed', entityType: 'story', entityId: await storyPublicId(db, storyId), after: { vote }, at: now });
  return rows.map((r) => ({ user_id: r.public_id, username: r.username, account_created_at: r.created_at, voted_at: r.cast_at, discounted: r.discounted }));
}

// PRD-005 US-005.6 AC-1/AC-4. Thresholds are `[ASSUMPTION]`s to tune on real behaviour.
export async function abuseReport(db: pg.ClientBase, now: Date) {
  const bursts = await db.query(
    `SELECT s.public_id AS story_id, count(*)::int AS votes,
            count(*) FILTER (WHERE u.created_at > $1::timestamptz - interval '30 days')::int AS new_account_votes
       FROM vote_directional v JOIN app_user u ON u.id = v.user_id JOIN story s ON s.id = v.story_id
      WHERE v.cast_at > $1::timestamptz - interval '15 minutes'
      GROUP BY s.public_id
     HAVING count(*) >= 20 AND count(*) FILTER (WHERE u.created_at > $1::timestamptz - interval '30 days') * 2 >= count(*)`,
    [now],
  );
  const sharedIps = await db.query(
    `SELECT a.entity_id AS story_id, host(i.ip) AS ip, count(DISTINCT a.actor_id)::int AS accounts
       FROM audit_log a JOIN ip_log i ON i.audit_id = a.id AND i.at = a.at
      WHERE a.action IN ('vote.cast', 'vote.changed') AND a.at > $1::timestamptz - interval '24 hours'
      GROUP BY a.entity_id, i.ip HAVING count(DISTINCT a.actor_id) >= 5`,
    [now],
  );
  const concentrated = await db.query(
    `WITH per AS (
       SELECT v.user_id, t.isin, count(*) AS n FROM vote_directional v JOIN story_tag t ON t.story_id = v.story_id
        WHERE v.cast_at > $1::timestamptz - interval '7 days' GROUP BY v.user_id, t.isin)
     SELECT u.public_id AS user_id, p.isin, p.n::int AS votes, (SELECT sum(n) FROM per x WHERE x.user_id = p.user_id)::int AS total
       FROM per p JOIN app_user u ON u.id = p.user_id
      WHERE p.n >= 10 AND p.n * 5 >= 4 * (SELECT sum(n) FROM per x WHERE x.user_id = p.user_id)`,
    [now],
  );
  const smeShare = await db.query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM story_tag t JOIN instrument i ON i.isin = t.isin WHERE t.story_id = s.id AND i.segment = 'sme'))::int AS sme
       FROM story s JOIN story_vote_count v ON v.story_id = s.id
      WHERE s.merged_into IS NULL AND v.bullish >= 3 AND v.bullish > v.bearish AND s.first_seen_at > $1::timestamptz - interval '24 hours'`,
    [now],
  );
  return {
    vote_bursts: bursts.rows,
    shared_ips: sharedIps.rows.map((r) => ({ ...r, story_id: r.story_id })),
    concentrated_voters: concentrated.rows,
    bullish_view_sme_share: smeShare.rows[0],
  };
}

// ---------------------------------------------------------------- retention (PRD-005 OQ-005.6, PRD-006 US-006.8 AC-6)

export async function purgeExpiredContent(db: pg.ClientBase, now: Date): Promise<{ removedContent: number; revisions: number; pendingSignups: number }> {
  const a = await db.query('DELETE FROM removed_content WHERE purge_after <= $1', [now]);
  const b = await db.query('DELETE FROM comment_revision WHERE purge_after <= $1', [now]);
  const c = await db.query('DELETE FROM pending_signup WHERE expires_at <= $1', [now]);
  return { removedContent: a.rowCount ?? 0, revisions: b.rowCount ?? 0, pendingSignups: c.rowCount ?? 0 };
}
