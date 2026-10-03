// Operator story corrections API (PRD-002 §8.4, US-002.11; D-037). Callers have passed operatorGate.

import type pg from 'pg';
import { parseIsin } from '@stockpanic/core';
import { CorrectionError, actOnSummary, correctionQueue, dismissReports, loadStoryCards, mergeStories, retagStory, splitStory, summaryQueue } from '@stockpanic/db';
import type { SessionUser } from '@stockpanic/db';

export interface Res {
  status: number;
  body: unknown;
}

const field = (body: unknown, key: string): unknown => (typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : undefined);
const invalid = (param: string, detail?: string): Res => ({ status: 400, body: { error: 'invalid_param', param, ...(detail ? { detail } : {}) } });

function reasonOf(body: unknown): string | null {
  const r = field(body, 'reason');
  return typeof r === 'string' && r.trim().length > 0 && r.length <= 1000 ? r.trim() : null;
}

function isinList(body: unknown, key: string): string[] | null {
  const raw = field(body, key);
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 20) return null;
  const out = raw.map((x) => (typeof x === 'string' ? parseIsin(x) : null));
  return out.every((x) => x !== null) ? [...new Set(out as string[])] : null;
}

async function respond(db: pg.ClientBase, storyId: string, auditId: string, extra: Record<string, unknown> = {}): Promise<Res> {
  const card = (await loadStoryCards(db, [storyId])).get(storyId);
  return { status: 200, body: { story: card ?? null, audit_id: auditId, ...extra } };
}

async function guarded(fn: () => Promise<Res>): Promise<Res> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof CorrectionError) return err.message === 'unknown story' ? { status: 404, body: { error: 'not_found' } } : invalid(err.param, err.message);
    throw err;
  }
}

// POST /v1/admin/stories/{story_id}/tags { add, remove, reason }
export function postRetag(db: pg.ClientBase, storyPublicId: string, body: unknown, op: SessionUser, now: Date): Promise<Res> {
  return guarded(async () => {
    const reason = reasonOf(body);
    if (!reason) return invalid('reason');
    const add = isinList(body, 'add');
    if (!add) return invalid('add');
    const remove = isinList(body, 'remove');
    if (!remove) return invalid('remove');
    const r = await retagStory(db, storyPublicId, add, remove, op.id, reason, now);
    return respond(db, r.storyId, r.auditId);
  });
}

// POST /v1/admin/stories/{story_id}/merge { into_story_id, reason }
export function postMerge(db: pg.ClientBase, storyPublicId: string, body: unknown, op: SessionUser, now: Date): Promise<Res> {
  return guarded(async () => {
    const reason = reasonOf(body);
    if (!reason) return invalid('reason');
    const into = field(body, 'into_story_id');
    if (typeof into !== 'string' || !/^st_[0-9A-Z]{26}$/.test(into)) return invalid('into_story_id');
    const r = await mergeStories(db, storyPublicId, into, op.id, reason, now);
    return respond(db, r.storyId, r.auditId);
  });
}

// POST /v1/admin/stories/{story_id}/split { item_ids, reason }
export function postSplit(db: pg.ClientBase, storyPublicId: string, body: unknown, op: SessionUser, now: Date): Promise<Res> {
  return guarded(async () => {
    const reason = reasonOf(body);
    if (!reason) return invalid('reason');
    const ids = field(body, 'item_ids');
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200 || !ids.every((i) => typeof i === 'string' && /^it_[0-9A-Z]{26}$/.test(i))) return invalid('item_ids');
    const r = await splitStory(db, storyPublicId, ids as string[], op.id, reason, now);
    const created = (await loadStoryCards(db, [r.newStoryId])).get(r.newStoryId);
    return respond(db, r.storyId, r.auditId, { new_story: created ?? null });
  });
}

// GET /v1/admin/corrections — wrong-stock and duplicate reports awaiting review.
export async function getCorrectionQueue(db: pg.ClientBase): Promise<Res> {
  return { status: 200, body: { queue: await correctionQueue(db) } };
}

// POST /v1/admin/stories/{story_id}/reports/dismiss { kind, reason } — reviewed, no change needed.
export function postDismiss(db: pg.ClientBase, storyPublicId: string, body: unknown, op: SessionUser, now: Date): Promise<Res> {
  return guarded(async () => {
    const reason = reasonOf(body);
    if (!reason) return invalid('reason');
    const kind = field(body, 'kind');
    if (kind !== 'wrong_stock' && kind !== 'duplicate') return invalid('kind');
    const r = await dismissReports(db, storyPublicId, kind, op.id, reason, now);
    return { status: 200, body: { dismissed: kind, audit_id: r.auditId } };
  });
}

// GET /v1/admin/summaries — AI summaries readers reported as inaccurate (PRD-004 US-004.4 AC-5).
export async function getSummaryQueue(db: pg.ClientBase): Promise<Res> {
  return { status: 200, body: { queue: await summaryQueue(db) } };
}

// POST /v1/admin/stories/{story_id}/summary { action: hide | regenerate | dismiss, reason }
export async function postSummaryAction(db: pg.ClientBase, storyPublicId: string, body: unknown, op: SessionUser, now: Date): Promise<Res> {
  const reason = reasonOf(body);
  if (!reason) return invalid('reason');
  const action = field(body, 'action');
  if (action !== 'hide' && action !== 'regenerate' && action !== 'dismiss') return invalid('action');
  const auditId = await actOnSummary(db, storyPublicId, action, op.id, reason, now);
  return auditId ? { status: 200, body: { story_id: storyPublicId, action, audit_id: auditId } } : { status: 404, body: { error: 'not_found' } };
}
