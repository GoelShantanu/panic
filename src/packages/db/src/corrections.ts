// Operator story corrections: retag, merge, split, report review (PRD-002 US-002.7, US-002.11; D-037).
// Every change is one transaction under the clustering lock, audited with before/after state, and
// labelled for evaluation.

import type pg from 'pg';
import { articleCandidateBands, CLUSTER_WINDOW_MS, lshBands } from '@stockpanic/core';
import { ALERTS_QUEUE } from './alerts.ts';
import { CLUSTER_LOCK_KEY, createStory, emitStoryEvent, recomputeStory, saveStoryBands } from './pipeline.ts';

export class CorrectionError extends Error {
  readonly param: string;
  constructor(param: string, message: string) {
    super(message);
    this.param = param;
  }
}

interface StoryState {
  id: string;
  publicId: string;
  firstSeenAt: Date;
  mergedInto: string | null;
  items: string[];
  tags: string[];
}

async function storyState(db: pg.ClientBase, storyId: string): Promise<StoryState> {
  const s = (await db.query('SELECT id, public_id, first_seen_at, merged_into FROM story WHERE id = $1', [storyId])).rows[0];
  const items = (await db.query('SELECT i.public_id FROM story_item si JOIN item i ON i.id = si.item_id WHERE si.story_id = $1 ORDER BY i.public_id', [storyId])).rows;
  const tags = (await db.query('SELECT isin FROM story_tag WHERE story_id = $1 ORDER BY isin', [storyId])).rows;
  return {
    id: String(s.id),
    publicId: s.public_id,
    firstSeenAt: s.first_seen_at,
    mergedInto: s.merged_into === null ? null : String(s.merged_into),
    items: items.map((r) => r.public_id),
    tags: tags.map((r) => String(r.isin).trim()),
  };
}

const snapshot = (s: StoryState) => ({ story_id: s.publicId, items: s.items, tags: s.tags });

async function audit(db: pg.ClientBase, a: { operatorId: string | null; action: string; entityId: string; before: unknown; after: unknown; at: Date }): Promise<string> {
  const { rows } = await db.query(
    `INSERT INTO audit_log (at, actor_type, actor_id, action, entity_type, entity_id, before, after) VALUES ($1, CASE WHEN $2::bigint IS NULL THEN 'system'::actor_type ELSE 'operator'::actor_type END, $2, $3, 'story', $4, $5, $6) RETURNING id`,
    [a.at, a.operatorId, a.action, a.entityId, JSON.stringify(a.before), JSON.stringify(a.after)],
  );
  return String(rows[0].id);
}

async function label(db: pg.ClientBase, l: { kind: string; storyId: string; otherStoryId?: string | null; isin?: string | null; itemIds?: string[] | null; reason: string; operatorId: string; at: Date }) {
  await db.query(
    `INSERT INTO correction_label (kind, story_id, other_story_id, isin, item_ids, reason, operator_id, labelled_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [l.kind, l.storyId, l.otherStoryId ?? null, l.isin ?? null, l.itemIds ?? null, l.reason, l.operatorId, l.at],
  );
}

async function markReviewed(db: pg.ClientBase, storyId: string, kind: 'wrong_stock' | 'duplicate', at: Date) {
  await db.query(
    `INSERT INTO story_report_review (story_id, kind, reviewed_through) VALUES ($1, $2, $3)
     ON CONFLICT (story_id, kind) DO UPDATE SET reviewed_through = greatest(story_report_review.reviewed_through, EXCLUDED.reviewed_through)`,
    [storyId, kind, at],
  );
}

// Alert follow-ups run in the alerts worker: re-evaluate the story, and send correction notices for
// every instrument removed from it (PRD-003 §3.4).
async function queueAlertWork(db: pg.ClientBase, storyId: string, removedIsins: readonly string[]) {
  await db.query('INSERT INTO job (queue, priority, payload) VALUES ($1, 10, $2)', [ALERTS_QUEUE, { story_id: storyId }]);
  for (const isin of removedIsins) {
    await db.query('INSERT INTO job (queue, priority, payload) VALUES ($1, 20, $2)', [ALERTS_QUEUE, { story_id: storyId, correction_removed_isin: isin }]);
  }
}

async function inTx<T>(db: pg.ClientBase, fn: () => Promise<T>): Promise<T> {
  await db.query('BEGIN');
  try {
    await db.query('SELECT pg_advisory_xact_lock($1)', [CLUSTER_LOCK_KEY]);
    const r = await fn();
    await db.query('COMMIT');
    return r;
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

async function liveStoryId(db: pg.ClientBase, publicId: string, param: string): Promise<string> {
  const { rows } = await db.query('SELECT id, merged_into FROM story WHERE public_id = $1', [publicId]);
  if (!rows[0]) throw new CorrectionError(param, 'unknown story');
  if (rows[0].merged_into !== null) throw new CorrectionError(param, 'story was merged');
  return String(rows[0].id);
}

export interface CorrectionResult {
  storyId: string;
  auditId: string;
}

// ---------------------------------------------------------------- retag (US-002.11 AC-4)

export async function retagStory(db: pg.ClientBase, publicId: string, add: readonly string[], remove: readonly string[], operatorId: string, reason: string, now: Date): Promise<CorrectionResult> {
  if (add.length === 0 && remove.length === 0) throw new CorrectionError('add', 'nothing to change');
  if (add.some((i) => remove.includes(i))) throw new CorrectionError('remove', 'an instrument cannot be added and removed');
  const known = (await db.query('SELECT isin FROM instrument WHERE isin = ANY($1::text[])', [[...add, ...remove]])).rows.map((r) => String(r.isin).trim());
  const unknown = [...add, ...remove].find((i) => !known.includes(i));
  if (unknown) throw new CorrectionError(add.includes(unknown) ? 'add' : 'remove', `unknown instrument ${unknown}`);

  return inTx(db, async () => {
    const storyId = await liveStoryId(db, publicId, 'story_id');
    const before = await storyState(db, storyId);
    for (const isin of remove) {
      if (!before.tags.includes(isin)) throw new CorrectionError('remove', `${isin} is not tagged on this story`);
      await db.query(
        `INSERT INTO story_tag_override (story_id, isin, action, operator_id, reason, decided_at) VALUES ($1, $2, 'remove', $3, $4, $5)
         ON CONFLICT (story_id, isin) DO UPDATE SET action = 'remove', operator_id = EXCLUDED.operator_id, reason = EXCLUDED.reason, decided_at = EXCLUDED.decided_at`,
        [storyId, isin, operatorId, reason, now],
      );
      await db.query('DELETE FROM story_tag WHERE story_id = $1 AND isin = $2', [storyId, isin]);
      await label(db, { kind: 'tag_removed', storyId, isin, reason, operatorId, at: now });
    }
    for (const isin of add) {
      if (before.tags.includes(isin)) throw new CorrectionError('add', `${isin} is already tagged`);
      await db.query(
        `INSERT INTO story_tag_override (story_id, isin, action, operator_id, reason, decided_at) VALUES ($1, $2, 'add', $3, $4, $5)
         ON CONFLICT (story_id, isin) DO UPDATE SET action = 'add', operator_id = EXCLUDED.operator_id, reason = EXCLUDED.reason, decided_at = EXCLUDED.decided_at`,
        [storyId, isin, operatorId, reason, now],
      );
      await db.query(`INSERT INTO story_tag (story_id, isin, method, confidence) VALUES ($1, $2, 'operator', 1)`, [storyId, isin]);
      await label(db, { kind: 'tag_added', storyId, isin, reason, operatorId, at: now });
    }
    await db.query('UPDATE story SET updated_at = $2 WHERE id = $1', [storyId, now]);
    const after = await storyState(db, storyId);
    const auditId = await audit(db, { operatorId, action: 'story.retagged', entityId: publicId, before: snapshot(before), after: { ...snapshot(after), reason }, at: now });
    await markReviewed(db, storyId, 'wrong_stock', now);
    await emitStoryEvent(db, 'story.updated', storyId);
    await queueAlertWork(db, storyId, remove);
    return { storyId, auditId };
  });
}

// ---------------------------------------------------------------- merge (US-002.7 AC-1)

// The older story survives; the other redirects to it.
export async function mergeStories(db: pg.ClientBase, publicId: string, intoPublicId: string, operatorId: string | null, reason: string, now: Date): Promise<CorrectionResult> {
  if (!reason.trim()) throw new CorrectionError('reason', 'a merge review reason is required');
  if (publicId === intoPublicId) throw new CorrectionError('into_story_id', 'cannot merge a story into itself');
  return inTx(db, async () => {
    const a = await storyState(db, await liveStoryId(db, publicId, 'story_id'));
    const b = await storyState(db, await liveStoryId(db, intoPublicId, 'into_story_id'));
    const [survivor, absorbed] = a.firstSeenAt < b.firstSeenAt || (a.firstSeenAt.getTime() === b.firstSeenAt.getTime() && Number(a.id) < Number(b.id)) ? [a, b] : [b, a];

    await db.query('UPDATE story SET merged_into = $2, primary_item_id = NULL, updated_at = $3 WHERE id = $1', [absorbed.id, survivor.id, now]);
    await db.query('UPDATE story_item SET story_id = $2 WHERE story_id = $1', [absorbed.id, survivor.id]);
    // Comments move with their threads (the reply FK cascades the story ID).
    await db.query('UPDATE comment SET story_id = $2 WHERE story_id = $1 AND parent_id IS NULL', [absorbed.id, survivor.id]);
    // Votes move unless the same user already voted on the survivor; those stay recorded on the absorbed story.
    await db.query(`UPDATE vote_directional v SET story_id = $2 WHERE story_id = $1 AND NOT EXISTS (SELECT 1 FROM vote_directional w WHERE w.story_id = $2 AND w.user_id = v.user_id)`, [absorbed.id, survivor.id]);
    await db.query(`UPDATE vote_quality v SET story_id = $2 WHERE story_id = $1 AND NOT EXISTS (SELECT 1 FROM vote_quality w WHERE w.story_id = $2 AND w.user_id = v.user_id AND w.kind = v.kind)`, [absorbed.id, survivor.id]);
    await db.query(`UPDATE story_tag_override o SET story_id = $2 WHERE story_id = $1 AND NOT EXISTS (SELECT 1 FROM story_tag_override p WHERE p.story_id = $2 AND p.isin = o.isin)`, [absorbed.id, survivor.id]);
    await db.query(`INSERT INTO story_tag (story_id, isin, method, confidence) SELECT $1, isin, 'operator', 1 FROM story_tag_override WHERE story_id = $1 AND action = 'add' ON CONFLICT DO NOTHING`, [survivor.id]);
    await db.query(`DELETE FROM story_tag WHERE story_id = $1`, [absorbed.id]);
    await db.query(`DELETE FROM lsh_band WHERE story_id = $1`, [absorbed.id]);
    await recomputeStory(db, survivor.id);

    const after = await storyState(db, survivor.id);
    const removed = [...new Set([...survivor.tags, ...absorbed.tags])].filter((i) => !after.tags.includes(i));
    const auditId = await audit(db, {
      operatorId, action: 'story.merged', entityId: survivor.publicId,
      before: { survivor: snapshot(survivor), absorbed: snapshot(absorbed) }, after: { ...snapshot(after), absorbed: absorbed.publicId, reason }, at: now,
    });
    // Founder-authorised CLI maintenance uses system provenance, not a fabricated
    // operator account or a human adjudication label. Its complete audit is retained.
    if (operatorId !== null) await label(db, { kind: 'merged', storyId: survivor.id, otherStoryId: absorbed.id, reason, operatorId, at: now });
    await markReviewed(db, survivor.id, 'duplicate', now);
    await markReviewed(db, absorbed.id, 'duplicate', now);
    await emitStoryEvent(db, 'story.updated', survivor.id);
    await emitStoryEvent(db, 'story.updated', absorbed.id); // clients holding it follow the redirect
    await queueAlertWork(db, survivor.id, removed);
    return { storyId: survivor.id, auditId };
  });
}

// ---------------------------------------------------------------- split (US-002.7 AC-2)

export async function splitStory(db: pg.ClientBase, publicId: string, itemPublicIds: readonly string[], operatorId: string, reason: string, now: Date): Promise<CorrectionResult & { newStoryId: string }> {
  if (itemPublicIds.length === 0) throw new CorrectionError('item_ids', 'no items given');
  return inTx(db, async () => {
    const storyId = await liveStoryId(db, publicId, 'story_id');
    const before = await storyState(db, storyId);
    const unique = [...new Set(itemPublicIds)];
    if (unique.some((i) => !before.items.includes(i))) throw new CorrectionError('item_ids', 'item not in this story');
    if (unique.length === before.items.length) throw new CorrectionError('item_ids', 'a split must leave at least one item');

    const moving = (
      await db.query(
        `SELECT i.id, i.kind, i.headline, coalesce(i.published_at, i.first_seen_at) AS at, a.shingles FROM item i LEFT JOIN item_analysis a ON a.item_id = i.id
          WHERE i.public_id = ANY($1::text[]) ORDER BY coalesce(i.published_at, i.first_seen_at), i.id`,
        [unique],
      )
    ).rows;
    // The new story takes the earliest moved item's time, so it sorts where its news happened. Moving
    // the original's primary item is fine: that foreign key is checked at commit, after recompute.
    const first = moving[0]!;
    await db.query('DELETE FROM story_item WHERE item_id = $1', [first.id]);
    const newStoryId = await createStory(db, String(first.id), first.at);
    for (const m of moving.slice(1)) await db.query('UPDATE story_item SET story_id = $2 WHERE item_id = $1', [m.id, newStoryId]);
    for (const m of moving) {
      if (m.shingles?.length) await saveStoryBands(db, newStoryId, m.kind==='article'?articleCandidateBands(m.headline):lshBands(m.shingles), new Date(new Date(m.at).getTime() + CLUSTER_WINDOW_MS));
    }
    await recomputeStory(db, storyId);
    await recomputeStory(db, newStoryId);

    const after = await storyState(db, storyId);
    const created = await storyState(db, newStoryId);
    const removed = before.tags.filter((i) => !after.tags.includes(i));
    const auditId = await audit(db, {
      operatorId, action: 'story.split', entityId: publicId,
      before: snapshot(before), after: { original: snapshot(after), new_story: snapshot(created), reason }, at: now,
    });
    await label(db, { kind: 'split', storyId, otherStoryId: newStoryId, itemIds: moving.map((m) => String(m.id)), reason, operatorId, at: now });
    await markReviewed(db, storyId, 'duplicate', now);
    await emitStoryEvent(db, 'story.updated', storyId);
    await emitStoryEvent(db, 'story.created', newStoryId);
    await queueAlertWork(db, storyId, removed);
    await queueAlertWork(db, newStoryId, []);
    return { storyId, newStoryId, auditId };
  });
}

// ---------------------------------------------------------------- review queue (US-002.11 AC-2)

export async function correctionQueue(db: pg.ClientBase, limit = 100) {
  const { rows } = await db.query(
    `SELECT s.public_id AS story_id, p.headline, s.first_seen_at, v.kind,
            count(DISTINCT v.user_id)::int AS reporters, max(v.cast_at) AS last_report_at,
            coalesce(jsonb_agg(DISTINCT v.detail) FILTER (WHERE v.detail IS NOT NULL), '[]'::jsonb) AS details,
            ARRAY(SELECT isin::text FROM story_tag t WHERE t.story_id = s.id ORDER BY isin) AS tags
       FROM vote_quality v
       JOIN story s ON s.id = v.story_id AND s.merged_into IS NULL
       JOIN item p ON p.id = s.primary_item_id
       LEFT JOIN story_report_review r ON r.story_id = v.story_id AND r.kind = v.kind
      WHERE v.kind IN ('wrong_stock', 'duplicate') AND v.discounted_at IS NULL
        AND (r.reviewed_through IS NULL OR v.cast_at > r.reviewed_through)
      GROUP BY s.id, s.public_id, p.headline, s.first_seen_at, v.kind
      ORDER BY reporters DESC, s.first_seen_at DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({ ...r, tags: r.tags.map((t: string) => t.trim()) }));
}

export async function dismissReports(db: pg.ClientBase, publicId: string, kind: 'wrong_stock' | 'duplicate', operatorId: string, reason: string, now: Date): Promise<CorrectionResult> {
  return inTx(db, async () => {
    const storyId = await liveStoryId(db, publicId, 'story_id');
    await markReviewed(db, storyId, kind, now);
    await label(db, { kind: 'reports_dismissed', storyId, reason: `${kind}: ${reason}`, operatorId, at: now });
    const auditId = await audit(db, { operatorId, action: 'story.reports_dismissed', entityId: publicId, before: null, after: { kind, reason }, at: now });
    return { storyId, auditId };
  });
}
