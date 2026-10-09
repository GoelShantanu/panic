// Stream rules that need no DOM (PRD-001 US-001.1–001.4, §4.2, §6).
import type { StoryCard, StreamQuery } from '../types.ts';

export const PAGE_SIZE = 50;

export function streamParams(q: StreamQuery, cursor: string | null = null): URLSearchParams {
  const p = new URLSearchParams();
  if (q.view !== 'latest') p.set('view', q.view);
  if (q.eventTypes.length) p.set('event_types', q.eventTypes.join(','));
  if (cursor) p.set('cursor', cursor);
  return p;
}

export function parseQuery(sp: Record<string, string | string[] | undefined>): StreamQuery {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined;
  const view = one('view');
  return {
    view: view === 'watchlist' || view === 'important' || view === 'bullish' || view === 'bearish' || view === 'trending' ? view : 'latest',
    eventTypes: (one('event_types') ?? '').split(',').filter(Boolean),
    filingsOnly: false,
  };
}

// The client decides whether a live story.created belongs in the current view (PRD-001 §4.2). A brand
// new story has no votes and no trending history, so vote-based views and Trending never take one.
export function belongsToView(card: StoryCard, q: StreamQuery, watchlist: ReadonlySet<string> | null): boolean {
  if (q.view === 'important' || q.view === 'bullish' || q.view === 'bearish' || q.view === 'trending') return false;
  if (q.view === 'watchlist' && !(watchlist && card.instruments.some((i) => watchlist.has(i.isin)))) return false;
  if (q.eventTypes.length && !card.event_types.some((t) => q.eventTypes.includes(t))) return false;
  if (card.primary_item.kind !== 'article') return false;
  return true;
}

const order = (a: StoryCard, b: StoryCard) => b.first_seen_at.localeCompare(a.first_seen_at) || b.story_id.localeCompare(a.story_id);

// One row per story (US-001.1 AC-3), newest first, ties by story_id descending (AC-1).
export function mergeStories(existing: readonly StoryCard[], incoming: readonly StoryCard[]): StoryCard[] {
  const byId = new Map(existing.map((s) => [s.story_id, s]));
  for (const s of incoming) if (!byId.has(s.story_id)) byId.set(s.story_id, s);
  return [...byId.values()].sort(order);
}

// In-place update (US-001.1 AC-4): the row keeps its position; the viewer's own vote state, which the
// broadcast cannot carry, is kept.
export function applyUpdate(list: readonly StoryCard[], storyId: string, changes: Partial<StoryCard>): StoryCard[] {
  return list.map((s) =>
    s.story_id !== storyId
      ? s
      : {
          ...s,
          ...changes,
          story_id: s.story_id,
          first_seen_at: s.first_seen_at,
          is_unread: s.is_unread,
          votes: changes.votes ? { ...changes.votes, ...(s.votes.mine ? { mine: s.votes.mine } : {}), ...(s.votes.can_vote ? { can_vote: s.votes.can_vote } : {}) } : s.votes,
        },
  );
}

// Index of the first read story when some stories above it are unread; -1 when no divider is due.
export function unreadDividerIndex(list: readonly StoryCard[]): number {
  const first = list.findIndex((s) => !s.is_unread);
  return first > 0 ? first : -1;
}

export function markUnread(list: readonly StoryCard[], lastSeen: string | null): StoryCard[] {
  if (!lastSeen) return list.map((s) => ({ ...s, is_unread: false }));
  return list.map((s) => ({ ...s, is_unread: s.first_seen_at > lastSeen }));
}
