// Casting votes (PRD-005 US-005.1, §9.2). Optimistic: the caller shows the expected state at once,
// then takes the server's display, or reverts and shows the reason (AC-3).
import type { Direction, QualityKind, VoteDisplay } from '../types.ts';

export type VoteAction = { kind: 'directional'; value: Direction } | { kind: 'quality'; value: QualityKind; detail?: Record<string, string> };

export function optimistic(v: VoteDisplay, a: VoteAction): VoteDisplay {
  const mine = v.mine ?? { directional: null, quality: [] };
  if (a.kind === 'directional') return { ...v, mine: { ...mine, directional: mine.directional === a.value ? null : a.value } };
  const has = mine.quality.includes(a.value);
  return { ...v, mine: { ...mine, quality: has ? mine.quality.filter((q) => q !== a.value) : [...mine.quality, a.value] } };
}

export function voteRequest(storyId: string, v: VoteDisplay, a: VoteAction): { method: 'PUT' | 'DELETE'; url: string; body?: unknown } {
  const base = `/v1/stories/${encodeURIComponent(storyId)}/votes`;
  if (a.kind === 'directional') {
    // Choosing the current vote again removes it (AC-4).
    return v.mine?.directional === a.value ? { method: 'DELETE', url: `${base}/directional` } : { method: 'PUT', url: `${base}/directional`, body: { vote: a.value } };
  }
  const has = v.mine?.quality.includes(a.value);
  return has ? { method: 'DELETE', url: `${base}/quality/${a.value}` } : { method: 'PUT', url: `${base}/quality/${a.value}`, body: a.detail ? { detail: a.detail } : {} };
}

const istDate = (d: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${d}T00:00:00+05:30`));

// Server errors in plain words (PRD-005 US-005.2, §9.2).
export function voteErrorMessage(status: number, body: any): string {
  if (status === 401) return 'Sign in to vote.';
  if (status === 404) return 'Voting on this story is not available right now.';
  if (status === 429) return `You have reached the hourly vote limit. Voting resumes in ${Math.ceil((body?.retry_after_s ?? 60) / 60)} min.`;
  if (status === 403) {
    switch (body?.reason) {
      case 'account_too_new':
        return body.eligible_from ? `Directional voting opens for your account on ${istDate(body.eligible_from)}.` : 'Your account is too new to vote this way yet.';
      case 'email_unverified':
        return 'Verify your email address to vote.';
      case 'revoked':
        return 'Voting has been turned off for your account.';
      default:
        return 'You cannot vote on this story.';
    }
  }
  if (status === 400) return 'That vote could not be recorded.';
  return 'Something went wrong. Your vote was not recorded.';
}

export async function sendVote(storyId: string, v: VoteDisplay, a: VoteAction): Promise<{ ok: true; votes: VoteDisplay } | { ok: false; message: string }> {
  const r = voteRequest(storyId, v, a);
  try {
    const res = await fetch(r.url, { method: r.method, headers: { 'content-type': 'application/json' }, credentials: 'same-origin', ...(r.body ? { body: JSON.stringify(r.body) } : {}) });
    const body = await res.json().catch(() => null);
    return res.ok ? { ok: true, votes: body.votes } : { ok: false, message: voteErrorMessage(res.status, body) };
  } catch {
    return { ok: false, message: 'No connection. Your vote was not recorded.' };
  }
}
