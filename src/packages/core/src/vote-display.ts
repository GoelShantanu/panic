// PRD-005 §3 and §9.1: the vote display object. Raw counts, no percentages or
// ratios (C-005.2); progressive display (0 → none, 1–2 → few, ≥ 3 → counts);
// directional block absent when the kill switch is off (US-005.7).

export type VoteDirection = 'bullish' | 'bearish' | 'neutral';
export type QualityVote = 'important' | 'duplicate' | 'wrong_stock' | 'spam' | 'old_news';
export type CanVoteReason = 'not_signed_in' | 'email_unverified' | 'account_too_new' | 'revoked' | 'rate_limited';

export const COMMUNITY_OPINION_LABEL = 'Community opinion';
export const COUNTS_THRESHOLD = 3;
// PRD-005 §4: votes needed for a story to enter the Important / Bullish / Bearish views.
export const VIEW_VOTE_THRESHOLD = 3;

export interface VoteCounts {
  readonly bullish: number;
  readonly bearish: number;
  readonly neutral: number;
  readonly important: number;
}

export interface Viewer {
  readonly mine: { readonly directional: VoteDirection | null; readonly quality: readonly QualityVote[] };
  readonly canVote: { readonly directional: boolean; readonly quality: boolean; readonly reason: CanVoteReason | null };
}

export type DirectionalDisplay =
  | { state: 'none'; label: typeof COMMUNITY_OPINION_LABEL }
  | { state: 'few'; total: number; label: typeof COMMUNITY_OPINION_LABEL }
  | { state: 'counts'; total: number; bullish: number; bearish: number; neutral: number; label: typeof COMMUNITY_OPINION_LABEL };

export interface VoteDisplay {
  directional?: DirectionalDisplay;
  important_count: number;
  mine?: { directional: VoteDirection | null; quality: QualityVote[] };
  can_vote?: { directional: boolean; quality: boolean; reason: CanVoteReason | null };
}

export function directionalDisplay(counts: VoteCounts): DirectionalDisplay {
  const total = counts.bullish + counts.bearish + counts.neutral;
  if (total === 0) return { state: 'none', label: COMMUNITY_OPINION_LABEL };
  if (total < COUNTS_THRESHOLD) return { state: 'few', total, label: COMMUNITY_OPINION_LABEL };
  return {
    state: 'counts',
    total,
    bullish: counts.bullish,
    bearish: counts.bearish,
    neutral: counts.neutral,
    label: COMMUNITY_OPINION_LABEL,
  };
}

export function voteDisplay(counts: VoteCounts, options: { directionalEnabled: boolean; viewer?: Viewer }): VoteDisplay {
  const display: VoteDisplay = { important_count: counts.important };
  if (options.directionalEnabled) display.directional = directionalDisplay(counts);
  if (options.viewer) {
    display.mine = {
      directional: options.directionalEnabled ? options.viewer.mine.directional : null,
      quality: [...options.viewer.mine.quality],
    };
    display.can_vote = {
      directional: options.directionalEnabled && options.viewer.canVote.directional,
      quality: options.viewer.canVote.quality,
      reason: options.viewer.canVote.reason,
    };
  }
  return display;
}
