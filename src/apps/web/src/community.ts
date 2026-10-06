// Votes, comments, grievances, profiles, operator 2FA and moderation (PRD-005 §9, PRD-006 §7, PRD-007 US-007.5).

import type pg from 'pg';
import {
  COMMENT_EDIT_WINDOW_MS,
  COMMENT_MAX_CHARS,
  COMMENT_MIN_INTERVAL_S,
  COMMENT_PAGE_THREADS,
  COMMENTS_PER_HOUR,
  DIRECTIONS,
  OPERATOR_MFA_TTL_MS,
  QUALITY_VOTES,
  REPORT_REASONS,
  TAKEDOWN_REASONS,
  VOTES_PER_HOUR,
  commentEligibility,
  decryptSecret,
  encryptSecret,
  isOneOf,
  newTotpSecret,
  parseIsin,
  totpUri,
  verifyTotp,
  voteDisplay,
  voteEligibility,
} from '@stockpanic/core';
import type { Block, CanVoteReason, VoteDisplay } from '@stockpanic/core';
import {
  abuseReport,
  changeSetting,
  commentSwitches,
  commentThreads,
  createComment,
  createGrievance,
  deleteOwnComment,
  directionalVotingEnabled,
  discountUserVotes,
  editComment,
  enableTotp,
  findComment,
  grievanceByReference,
  grievanceQueue,
  hasUnreadReplies,
  lookupStory,
  markNoticesSeen,
  markRepliesSeen,
  markSessionMfa,
  oldestUserActionSince,
  recentComments,
  recentGlobalComments,
  recentUserActions,
  reportSummary,
  repliesTo,
  reportComment,
  setDirectionalVote,
  setQualityVote,
  setStoryCommentControl,
  setTotpSecret,
  setUserRestriction,
  storyVoteCounts,
  takedownComment,
  totpSecretOf,
  unseenNotices,
  updateGrievance,
  userIdByPublicId,
  userProfile,
  viewerVotes,
  votersForStory,
} from '@stockpanic/db';
import type { SessionUser, StoryCard } from '@stockpanic/db';
import { decodeCursor, encodeCursor } from './cursor.ts';
import { grievancesPerIp } from './ratelimit.ts';

export interface Res {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

const authRequired: Res = { status: 401, body: { error: 'auth_required' } };
const notFound: Res = { status: 404, body: { error: 'not_found' } };
const invalid = (param: string): Res => ({ status: 400, body: { error: 'invalid_param', param } });
const field = (body: unknown, key: string): unknown => (typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : undefined);
const blocked = (b: Block): Res => ({
  status: 403,
  body: { error: 'not_eligible', reason: b.reason, ...(b.eligibleFrom ? { eligible_from: b.eligibleFrom.toISOString().slice(0, 10) } : {}) },
});
const rateLimited = (retryAfterS: number): Res => ({ status: 429, body: { error: 'rate_limited', retry_after_s: Math.max(1, Math.ceil(retryAfterS)) }, headers: { 'retry-after': String(Math.max(1, Math.ceil(retryAfterS))) } });

async function liveStory(db: pg.ClientBase, publicId: string): Promise<string | null> {
  const found = await lookupStory(db, publicId);
  return found.kind === 'found' ? found.id : null;
}

// ---------------------------------------------------------------- votes (PRD-005 §9.2)

async function voteRateRetry(db: pg.ClientBase, user: SessionUser, now: Date): Promise<number | null> {
  const since = new Date(now.getTime() - 3600_000);
  if ((await recentUserActions(db, user.id, 'vote.', since)) < VOTES_PER_HOUR) return null;
  const oldest = await oldestUserActionSince(db, user.id, 'vote.', since);
  return oldest ? (oldest.getTime() + 3600_000 - now.getTime()) / 1000 : 60;
}

// `mine` and `can_vote` for signed-in viewers (PRD-005 §9.1).
export async function personaliseVotes(db: pg.ClientBase, cards: StoryCard[], user: SessionUser | null, now: Date): Promise<StoryCard[]> {
  if (!user || cards.length === 0) return cards;
  const mine = await viewerVotes(db, user.id, cards.map((c) => c.story_id));
  const rate = (await voteRateRetry(db, user, now)) !== null;
  const dir = voteEligibility(user, 'directional', now);
  const qual = voteEligibility(user, 'quality', now);
  const reason: CanVoteReason | null = !dir.ok ? (dir.reason as CanVoteReason) : rate ? 'rate_limited' : null;
  return cards.map((c) => {
    const m = mine.get(c.story_id)!;
    const votes: VoteDisplay = {
      ...c.votes,
      mine: { directional: c.votes.directional ? m.directional : null, quality: m.quality },
      can_vote: { directional: !!c.votes.directional && dir.ok && !rate, quality: qual.ok && !rate, reason },
    };
    return { ...c, votes };
  });
}

async function currentDisplay(db: pg.ClientBase, storyId: string, publicId: string, user: SessionUser, now: Date): Promise<VoteDisplay> {
  const directionalEnabled = await directionalVotingEnabled(db);
  const base = voteDisplay(await storyVoteCounts(db, storyId), { directionalEnabled });
  const [card] = await personaliseVotes(db, [{ story_id: publicId, votes: base } as StoryCard], user, now);
  return card!.votes;
}

export async function putDirectionalVote(db: pg.ClientBase, publicId: string, body: unknown, user: SessionUser | null, ip: string | null, now: Date, remove: boolean): Promise<Res> {
  if (!user) return authRequired;
  const storyId = await liveStory(db, publicId);
  if (!storyId || !(await directionalVotingEnabled(db))) return notFound; // US-005.7
  const vote = remove ? null : field(body, 'vote');
  if (!remove && !isOneOf(DIRECTIONS, vote)) return invalid('vote');
  const elig = voteEligibility(user, 'directional', now);
  if (!elig.ok) return blocked(elig);
  const retry = await voteRateRetry(db, user, now);
  if (retry !== null) return rateLimited(retry);
  await setDirectionalVote(db, storyId, user.id, vote as string | null, ip, now);
  return { status: 200, body: { votes: await currentDisplay(db, storyId, publicId, user, now) } };
}

export async function putQualityVote(db: pg.ClientBase, publicId: string, kind: string, body: unknown, user: SessionUser | null, ip: string | null, now: Date, remove: boolean): Promise<Res> {
  if (!user) return authRequired;
  if (!isOneOf(QUALITY_VOTES, kind)) return invalid('type');
  const storyId = await liveStory(db, publicId);
  if (!storyId) return notFound;
  let detail: Record<string, string> | null = null;
  if (!remove) {
    const raw = field(body, 'detail');
    if (kind === 'wrong_stock') {
      const isin = typeof field(raw, 'isin') === 'string' ? parseIsin(field(raw, 'isin') as string) : null;
      if (!isin) return invalid('detail');
      detail = { isin };
    } else if (kind === 'duplicate' && raw !== undefined && raw !== null) {
      const other = field(raw, 'story_id');
      if (typeof other !== 'string' || !/^st_[0-9A-Z]{26}$/.test(other)) return invalid('detail');
      detail = { story_id: other };
    }
  }
  const elig = voteEligibility(user, 'quality', now);
  if (!elig.ok) return blocked(elig);
  const retry = await voteRateRetry(db, user, now);
  if (retry !== null) return rateLimited(retry);
  await setQualityVote(db, storyId, user.id, kind, !remove, detail, ip, now);
  return { status: 200, body: { votes: await currentDisplay(db, storyId, publicId, user, now) } };
}

// ---------------------------------------------------------------- comments (PRD-006 §7)

function commentJson(r: any, replies: unknown[] | null) {
  return {
    comment_id: r.public_id,
    depth: r.depth,
    author: r.author_deleted ? null : { username: r.username },
    body: r.state === 'visible' ? r.body : null,
    created_at: r.created_at,
    edited: r.edited_at !== null,
    state: r.state,
    ...(r.state === 'removed' ? { removed_reason: r.removed_reason } : {}),
    ...(replies ? { replies } : {}),
  };
}

export async function getComments(db: pg.ClientBase, publicId: string, params: URLSearchParams, user: SessionUser | null, now: Date): Promise<Res> {
  const storyId = await liveStory(db, publicId);
  if (!storyId) return notFound;
  const rawCursor = params.get('cursor');
  const after = rawCursor === null ? null : decodeCursor(rawCursor);
  if (rawCursor !== null && after === null) return invalid('cursor');
  const sw = await commentSwitches(db, storyId);
  const posting: Record<string, unknown> = { enabled: sw.posting };
  if (user) {
    const e = commentEligibility(user, now);
    posting['can_post'] = sw.posting && e.ok;
    posting['reason'] = e.ok ? null : e.reason;
    if (!e.ok && e.eligibleFrom) posting['eligible_from'] = e.eligibleFrom.toISOString().slice(0, 10);
  }
  if (!sw.visible) return { status: 200, body: { comments: [], next_cursor: null, hidden: true, posting } };

  const { threads, replies, hasMore } = await commentThreads(db, storyId, after, COMMENT_PAGE_THREADS);
  const children = new Map<string, any[]>();
  for (const r of replies) {
    const k = String(r.parent_id);
    if (!children.has(k)) children.set(k, []);
    children.get(k)!.push(r);
  }
  const last = threads[threads.length - 1];
  const parentOf = new Map<string, string>([...threads, ...replies].map((r) => [String(r.id), r.public_id]));
  const tree = (r: any): unknown => ({ ...commentJson(r, (children.get(String(r.id)) ?? []).map(tree)), parent_id: r.parent_id === null ? null : parentOf.get(String(r.parent_id)) ?? null });
  return {
    status: 200,
    body: {
      comments: threads.map(tree),
      next_cursor: hasMore && last ? encodeCursor(last.created_at, String(last.id)) : null,
      posting,
    },
  };
}

export async function postComment(db: pg.ClientBase, publicId: string, body: unknown, user: SessionUser | null, now: Date): Promise<Res> {
  if (!user) return authRequired;
  const storyId = await liveStory(db, publicId);
  if (!storyId) return notFound;
  const text = field(body, 'body');
  if (typeof text !== 'string' || text.trim().length === 0 || text.length > COMMENT_MAX_CHARS) return invalid('body');
  const rawParent = field(body, 'parent_id');
  let parentId: string | null = null;
  if (rawParent !== undefined && rawParent !== null) {
    const parent = typeof rawParent === 'string' ? await findComment(db, rawParent) : null;
    if (!parent || parent.storyId !== storyId) return invalid('parent_id');
    parentId = parent.id;
  }
  const elig = commentEligibility(user, now);
  if (!elig.ok) return blocked(elig);
  if (!(await commentSwitches(db, storyId)).posting) return { status: 423, body: { error: 'comments_paused' } };
  const recent = await recentComments(db, user.id, now);
  if (recent.lastAt && now.getTime() - recent.lastAt.getTime() < COMMENT_MIN_INTERVAL_S * 1000) {
    return rateLimited(COMMENT_MIN_INTERVAL_S - (now.getTime() - recent.lastAt.getTime()) / 1000);
  }
  if (recent.lastHour >= COMMENTS_PER_HOUR && recent.oldestInHour) return rateLimited((recent.oldestInHour.getTime() + 3600_000 - now.getTime()) / 1000);
  const c = await createComment(db, storyId, user.id, text, parentId, now);
  // A reply to a level-3 comment is re-parented to keep depth at 3 (schema trigger).
  const parentPublic = c.parentId === null ? null : (await db.query('SELECT public_id FROM comment WHERE id = $1', [c.parentId])).rows[0].public_id;
  return {
    status: 201,
    body: { comment: { ...commentJson({ public_id: c.publicId, depth: c.depth, username: user.username, body: c.body, created_at: c.createdAt, edited_at: null, state: c.state }, []), parent_id: parentPublic } },
  };
}

export async function patchComment(db: pg.ClientBase, commentPublicId: string, body: unknown, user: SessionUser | null, now: Date): Promise<Res> {
  if (!user) return authRequired;
  const c = await findComment(db, commentPublicId);
  if (!c || c.state !== 'visible') return notFound;
  if (c.userId !== user.id) return { status: 403, body: { error: 'not_eligible', reason: 'not_author' } };
  const text = field(body, 'body');
  if (typeof text !== 'string' || text.trim().length === 0 || text.length > COMMENT_MAX_CHARS) return invalid('body');
  if (now.getTime() - c.createdAt.getTime() > COMMENT_EDIT_WINDOW_MS) return { status: 409, body: { error: 'edit_window_closed' } };
  if (user.commentSuspended) return blocked({ ok: false, reason: 'suspended' });
  await editComment(db, c, text, now);
  return { status: 200, body: { comment_id: c.publicId, body: text, edited: true } };
}

export async function deleteComment(db: pg.ClientBase, commentPublicId: string, user: SessionUser | null, now: Date): Promise<Res> {
  if (!user) return authRequired;
  const c = await findComment(db, commentPublicId);
  if (!c || c.state !== 'visible') return notFound;
  if (c.userId !== user.id) return { status: 403, body: { error: 'not_eligible', reason: 'not_author' } };
  await deleteOwnComment(db, c, now);
  return { status: 204, body: null };
}

export async function getRecentComments(db: pg.ClientBase): Promise<Res> {
  const comments = await recentGlobalComments(db, 8);
  return { status: 200, body: { comments } };
}

export async function postReport(db: pg.ClientBase, commentPublicId: string, body: unknown, user: SessionUser | null, now: Date): Promise<Res> {
  if (!user) return authRequired;
  const c = await findComment(db, commentPublicId);
  if (!c) return notFound;
  const reason = field(body, 'reason');
  if (!isOneOf(REPORT_REASONS, reason)) return invalid('reason');
  const detail = field(body, 'detail');
  if (detail !== undefined && detail !== null && (typeof detail !== 'string' || detail.length > 2000)) return invalid('detail');
  const r = await reportComment(db, c, user.id, reason, (detail as string | undefined) ?? null, now);
  return r.ok ? { status: 201, body: { reference: r.reference } } : { status: 409, body: { error: r.error } };
}

// POST /v1/stories/{story_id}/summary/reports — "this summary is inaccurate" (PRD-004 US-004.4 AC-5).
// Same bar as quality votes: a verified email (PRD-005 US-005.5).
export async function postSummaryReport(db: pg.ClientBase, publicId: string, user: SessionUser | null, now: Date): Promise<Res> {
  if (!user) return authRequired;
  const elig = voteEligibility(user, 'quality', now);
  if (!elig.ok) return blocked(elig);
  const r = await reportSummary(db, publicId, user.id, now);
  if (r === 'no_summary') return notFound;
  return r === 'created' ? { status: 201, body: { reported: true } } : { status: 409, body: { error: 'already_reported' } };
}

// Public grievance form; no account needed (PRD-006 US-006.8 AC-1).
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export async function postGrievance(db: pg.ClientBase, body: unknown, now: Date, ip: string | null = null): Promise<Res> {
  if (ip && !grievancesPerIp.allow(ip, now.getTime())) return rateLimited(3600);
  const email = field(body, 'email');
  const details = field(body, 'details');
  const rawComment = field(body, 'comment_id');
  const urgent = field(body, 'urgent');
  if (typeof email !== 'string' || !EMAIL.test(email)) return invalid('email');
  if (typeof details !== 'string' || details.trim().length === 0 || details.length > 5000) return invalid('details');
  if (urgent !== undefined && typeof urgent !== 'boolean') return invalid('urgent');
  let commentId: string | null = null;
  if (rawComment !== undefined && rawComment !== null) {
    const c = typeof rawComment === 'string' ? await findComment(db, rawComment) : null;
    if (!c) return invalid('comment_id');
    commentId = c.id;
  }
  const reference = await createGrievance(db, { email, details, commentId, urgent: urgent === true, source: 'form' }, now);
  return { status: 201, body: { reference } };
}

// ---------------------------------------------------------------- profiles, replies, notices

// Profiles carry no follower or reputation data and are not indexed (PRD-006 US-006.10).
export async function getProfile(db: pg.ClientBase, username: string): Promise<Res> {
  const p = await userProfile(db, username);
  return p ? { status: 200, body: p, headers: { 'x-robots-tag': 'noindex' } } : notFound;
}

export async function getReplies(db: pg.ClientBase, user: SessionUser | null, now: Date): Promise<Res> {
  if (!user) return authRequired;
  const rows = await repliesTo(db, user.id);
  await markRepliesSeen(db, user.id, now);
  return {
    status: 200,
    body: { replies: rows.map((r) => ({ comment_id: r.public_id, in_reply_to: r.in_reply_to, story_id: r.story_id, author: { username: r.username }, body: r.body, created_at: r.created_at })) },
  };
}

export async function getNotifications(db: pg.ClientBase, user: SessionUser | null): Promise<Res> {
  if (!user) return authRequired;
  return { status: 200, body: { unread_replies: await hasUnreadReplies(db, user.id), notices: await unseenNotices(db, user.id) } };
}

// Dismisses notices created up to `up_to` (the newest one shown), never ones that arrived later.
export async function postNoticesSeen(db: pg.ClientBase, body: unknown, user: SessionUser | null, now: Date): Promise<Res> {
  if (!user) return authRequired;
  const raw = field(body, 'up_to');
  const upTo = typeof raw === 'string' ? new Date(raw) : null;
  if (!upTo || Number.isNaN(upTo.getTime())) return invalid('up_to');
  return { status: 200, body: { dismissed: await markNoticesSeen(db, user.id, upTo, now) } };
}

// ---------------------------------------------------------------- operator 2FA (PRD-007 US-007.5 AC-2)

const MFA_ATTEMPTS_PER_15M = 5;

export async function postTotpEnrol(db: pg.ClientBase, user: SessionUser | null, authSecret: string): Promise<Res> {
  if (!user) return authRequired;
  if (user.totpEnabled) return { status: 409, body: { error: 'already_enabled' } };
  const secret = newTotpSecret();
  await setTotpSecret(db, user.id, encryptSecret(authSecret, secret));
  return { status: 200, body: { secret, otpauth_uri: totpUri(secret, user.username ?? user.publicId) } };
}

async function checkTotp(db: pg.ClientBase, user: SessionUser, body: unknown, authSecret: string, now: Date): Promise<Res | null> {
  const code = field(body, 'code');
  if (typeof code !== 'string') return invalid('code');
  const since = new Date(now.getTime() - 15 * 60_000);
  if ((await recentUserActions(db, user.id, 'mfa.failed', since)) >= MFA_ATTEMPTS_PER_15M) return rateLimited(15 * 60);
  const stored = await totpSecretOf(db, user.id);
  if (!stored) return { status: 409, body: { error: 'not_enrolled' } };
  if (!verifyTotp(decryptSecret(authSecret, stored), code, now)) {
    await db.query(`INSERT INTO audit_log (at, actor_type, actor_id, action, entity_type, entity_id) VALUES ($1, 'user', $2, 'mfa.failed', 'user', $3)`, [now, user.id, user.publicId]);
    return { status: 400, body: { error: 'invalid_code' } };
  }
  return null;
}

export async function postTotpConfirm(db: pg.ClientBase, body: unknown, user: SessionUser | null, authSecret: string, now: Date): Promise<Res> {
  if (!user) return authRequired;
  if (user.totpEnabled) return { status: 409, body: { error: 'already_enabled' } };
  const err = await checkTotp(db, user, body, authSecret, now);
  if (err) return err;
  await enableTotp(db, user.id);
  await markSessionMfa(db, user.sessionHash, now);
  return { status: 200, body: { totp_enabled: true } };
}

export async function postMfaVerify(db: pg.ClientBase, body: unknown, user: SessionUser | null, authSecret: string, now: Date): Promise<Res> {
  if (!user) return authRequired;
  if (!user.totpEnabled) return { status: 409, body: { error: 'not_enrolled' } };
  const err = await checkTotp(db, user, body, authSecret, now);
  if (err) return err;
  await markSessionMfa(db, user.sessionHash, now);
  return { status: 200, body: { mfa_verified_until: new Date(now.getTime() + OPERATOR_MFA_TTL_MS).toISOString() } };
}

// ---------------------------------------------------------------- moderation (operator only)

export function operatorGate(user: SessionUser | null, now: Date): Res | null {
  if (!user) return authRequired;
  if (user.role !== 'operator' && user.role !== 'admin') return { status: 403, body: { error: 'forbidden' } };
  if (!user.mfaVerifiedAt || now.getTime() - user.mfaVerifiedAt.getTime() > OPERATOR_MFA_TTL_MS) return { status: 403, body: { error: 'mfa_required' } };
  return null;
}

const reasonOf = (body: unknown): string | null => {
  const r = field(body, 'reason');
  return typeof r === 'string' && r.trim().length > 0 && r.length <= 1000 ? r.trim() : null;
};

export async function adminVoters(db: pg.ClientBase, publicId: string, params: URLSearchParams, op: SessionUser, now: Date): Promise<Res> {
  const vote = params.get('vote') ?? 'bullish';
  if (!isOneOf([...DIRECTIONS, 'important'], vote)) return invalid('vote');
  const storyId = await liveStory(db, publicId);
  if (!storyId) return notFound;
  return { status: 200, body: { voters: await votersForStory(db, storyId, vote, op.id, now), next_cursor: null } };
}

export async function adminTakedown(db: pg.ClientBase, commentPublicId: string, body: unknown, op: SessionUser, now: Date): Promise<Res> {
  const reason = field(body, 'reason');
  if (!isOneOf(TAKEDOWN_REASONS, reason)) return invalid('reason');
  const c = await findComment(db, commentPublicId);
  if (!c) return notFound;
  if (c.state === 'removed') return { status: 409, body: { error: 'already_removed' } };
  const rawRef = field(body, 'grievance_id');
  const grievance = typeof rawRef === 'string' ? await grievanceByReference(db, rawRef) : null;
  if (rawRef !== undefined && rawRef !== null && !grievance) return invalid('grievance_id');
  if ((reason === 'court_order' || reason === 'government_notice') && !grievance) return invalid('grievance_id');
  const reference = field(body, 'reference');
  if (reference !== undefined && reference !== null && (typeof reference !== 'string' || reference.length > 500)) return invalid('reference');
  await takedownComment(db, c, { operatorId: op.id, reason, grievanceId: grievance ? String(grievance.id) : null, reference: (reference as string | undefined) ?? null }, now);
  return { status: 200, body: { comment_id: c.publicId, state: 'removed', removed_reason: reason } };
}

export async function adminUserRestriction(db: pg.ClientBase, userPublicId: string, kind: 'commenting' | 'voting' | 'discount', body: unknown, op: SessionUser, now: Date): Promise<Res> {
  const reason = reasonOf(body);
  if (!reason) return invalid('reason');
  const key = kind === 'commenting' ? 'suspended' : kind === 'voting' ? 'revoked' : 'discounted';
  const flag = field(body, key);
  if (typeof flag !== 'boolean') return invalid(key);
  const userId = await userIdByPublicId(db, userPublicId);
  if (!userId) return notFound;
  if (kind === 'discount') return { status: 200, body: { votes_affected: await discountUserVotes(db, userId, flag, op.id, reason, now) } };
  await setUserRestriction(db, userId, kind, flag, op.id, reason, now);
  return { status: 200, body: { user_id: userPublicId, [key]: flag } };
}

export async function adminCommentSettings(db: pg.ClientBase, body: unknown, op: SessionUser, now: Date): Promise<Res> {
  const reason = reasonOf(body);
  if (!reason) return invalid('reason');
  const posting = field(body, 'posting');
  const visible = field(body, 'visible');
  if (typeof posting !== 'boolean') return invalid('posting');
  if (typeof visible !== 'boolean') return invalid('visible');
  const rawStory = field(body, 'story_id');
  if (rawStory === undefined || rawStory === null) {
    await changeSetting(db, 'comments_posting_enabled', posting, op.id, reason, now);
    await changeSetting(db, 'comments_visible', visible, op.id, reason, now);
    return { status: 200, body: { scope: 'global', posting, visible } };
  }
  const storyId = typeof rawStory === 'string' ? await liveStory(db, rawStory) : null;
  if (!storyId) return invalid('story_id');
  await setStoryCommentControl(db, storyId, posting, visible, op.id, reason, now);
  return { status: 200, body: { scope: 'story', story_id: rawStory, posting, visible } };
}

// PRD-005 US-005.7: the directional-voting kill switch.
export async function adminDirectionalSetting(db: pg.ClientBase, body: unknown, op: SessionUser, now: Date): Promise<Res> {
  const reason = reasonOf(body);
  if (!reason) return invalid('reason');
  const enabled = field(body, 'enabled');
  if (typeof enabled !== 'boolean') return invalid('enabled');
  await changeSetting(db, 'directional_voting_enabled', enabled, op.id, reason, now);
  return { status: 200, body: { directional_voting_enabled: enabled } };
}

// Court orders and government notices arrive by post or email; the operator records them with the
// time received, which starts the 36-hour clock (US-006.8 AC-4).
export async function adminCreateGrievance(db: pg.ClientBase, body: unknown, op: SessionUser, now: Date): Promise<Res> {
  const source = field(body, 'source');
  if (source !== 'court_order' && source !== 'government_notice') return invalid('source');
  const details = field(body, 'details');
  if (typeof details !== 'string' || details.trim().length === 0 || details.length > 5000) return invalid('details');
  const rawAt = field(body, 'received_at');
  const receivedAt = rawAt === undefined || rawAt === null ? now : typeof rawAt === 'string' ? new Date(rawAt) : null;
  if (!receivedAt || Number.isNaN(receivedAt.getTime()) || receivedAt > now || now.getTime() - receivedAt.getTime() > 30 * 86_400_000) return invalid('received_at');
  const rawComment = field(body, 'comment_id');
  let commentId: string | null = null;
  if (rawComment !== undefined && rawComment !== null) {
    const c = typeof rawComment === 'string' ? await findComment(db, rawComment) : null;
    if (!c) return invalid('comment_id');
    commentId = c.id;
  }
  const reference = await createGrievance(db, { email: null, details: details.trim(), commentId, urgent: false, source }, receivedAt);
  await db.query(
    `INSERT INTO audit_log (at, actor_type, actor_id, action, entity_type, entity_id, after) VALUES ($1, 'operator', $2, 'grievance.recorded', 'grievance', $3, $4)`,
    [now, op.id, reference, JSON.stringify({ source, received_at: receivedAt.toISOString() })],
  );
  return { status: 201, body: { reference } };
}

// GET /v1/admin/settings — current kill-switch state for the console.
export async function adminSettings(db: pg.ClientBase): Promise<Res> {
  const { rows } = await db.query(`SELECT key, value #>> '{}' AS v FROM setting WHERE key IN ('comments_posting_enabled', 'comments_visible', 'directional_voting_enabled', 'article_tags_enabled')`);
  const on = (k: string) => rows.find((r) => r.key === k)?.v !== 'false';
  return { status: 200, body: { comments_posting_enabled: on('comments_posting_enabled'), comments_visible: on('comments_visible'), directional_voting_enabled: on('directional_voting_enabled'), article_tags_enabled: on('article_tags_enabled') } };
}

// PRD-002 US-002.8 AC-5: article tags off (or back on after a passing re-audit); D-051.
export async function adminArticleTagsSetting(db: pg.ClientBase, body: unknown, op: SessionUser, now: Date): Promise<Res> {
  const reason = reasonOf(body);
  if (!reason) return invalid('reason');
  const enabled = field(body, 'enabled');
  if (typeof enabled !== 'boolean') return invalid('enabled');
  await changeSetting(db, 'article_tags_enabled', enabled, op.id, reason, now);
  return { status: 200, body: { article_tags_enabled: enabled } };
}

export async function adminGrievances(db: pg.ClientBase, now: Date): Promise<Res> {
  return { status: 200, body: { grievances: await grievanceQueue(db, now) } };
}

export async function adminGrievanceUpdate(db: pg.ClientBase, reference: string, body: unknown, op: SessionUser, now: Date): Promise<Res> {
  const status = field(body, 'status');
  if (!isOneOf(['acknowledged', 'resolved', 'rejected'] as const, status)) return invalid('status');
  const decision = field(body, 'decision');
  if (status !== 'acknowledged' && (typeof decision !== 'string' || decision.trim().length === 0)) return invalid('decision');
  if (decision !== undefined && decision !== null && (typeof decision !== 'string' || decision.length > 5000)) return invalid('decision');
  return (await updateGrievance(db, reference, { status, decision: (decision as string | undefined) ?? null }, op.id, now)) ? { status: 200, body: { reference, status } } : notFound;
}

export async function adminAbuse(db: pg.ClientBase, now: Date): Promise<Res> {
  return { status: 200, body: await abuseReport(db, now) };
}
