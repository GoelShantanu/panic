'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShortcuts } from '../keyboard.ts';
import { useLiveEvent } from '../live.tsx';
import { ShortcutHelp } from '../ShortcutHelp.tsx';
import type { Direction, QualityKind, StoryCard, StreamQuery, VoteDisplay } from '../types.ts';
import { optimistic, sendVote } from '../votes/vote.ts';
import type { VoteAction } from '../votes/vote.ts';
import { applyUpdate, belongsToView, markUnread, mergeStories, streamParams, unreadDividerIndex } from './logic.ts';
import { StoryRow } from './StoryRow.tsx';

export interface StreamProps {
  initial: { stories: StoryCard[]; next_cursor: string | null; unread_count?: number };
  query: StreamQuery;
  eventLabels: [string, string][];
  signedIn: boolean;
  watchlistIsins: string[] | null;
}

const SEEN_KEY = (view: string) => `sp-seen:${view}`;
const VISIBLE_BEFORE_SEEN_MS = 10_000; // US-001.4 AC-3
const FLUSH_MS = 1000; // §6: inserts batched at most once per second

function readLocalSeen(view: string): string | null {
  try {
    return localStorage.getItem(SEEN_KEY(view));
  } catch {
    return null;
  }
}

export function Stream({ initial, query, eventLabels, signedIn, watchlistIsins }: StreamProps) {
  const router = useRouter();
  const labels = useMemo(() => new Map(eventLabels), [eventLabels]);
  const watchlist = useMemo(() => (watchlistIsins ? new Set(watchlistIsins) : null), [watchlistIsins]);
  const [stories, setStories] = useState<StoryCard[]>(initial.stories);
  const [unreadCount, setUnreadCount] = useState<number | null>(signedIn ? (initial.unread_count ?? 0) : null);
  const [cursor, setCursor] = useState(initial.next_cursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [pending, setPending] = useState<StoryCard[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [help, setHelp] = useState(false);
  const buffer = useRef<StoryCard[]>([]);
  const newestSeen = useRef<string | null>(initial.stories[0]?.first_seen_at ?? null);
  const listRef = useRef<HTMLOListElement>(null);

  // Anonymous unread marker from browser storage (US-001.4 AC-4); signed-in comes from the server.
  useEffect(() => {
    if (signedIn) return;
    const seen = readLocalSeen(query.view);
    if (!seen) return;
    setStories((list) => {
      const marked = markUnread(list, seen);
      setUnreadCount(marked.filter((s) => s.is_unread).length);
      return marked;
    });
  }, [signedIn, query.view]);

  // last_seen_at moves on only after ≥ 10 s visible, when the tab hides or closes (US-001.4 AC-3).
  useEffect(() => {
    let visibleSince = document.visibilityState === 'visible' ? Date.now() : null;
    const record = () => {
      if (visibleSince === null || Date.now() - visibleSince < VISIBLE_BEFORE_SEEN_MS || !newestSeen.current) return;
      const at = newestSeen.current;
      if (signedIn) {
        fetch('/v1/stream/seen', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ view: query.view, last_seen_at: at }) }).catch(() => undefined);
      } else {
        try {
          localStorage.setItem(SEEN_KEY(query.view), at);
        } catch {}
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        record();
        visibleSince = null;
      } else visibleSince = Date.now();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', record);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', record);
    };
  }, [signedIn, query.view]);

  const atTop = () => typeof window === 'undefined' || window.scrollY < 40;

  // New stories: straight in when the reader is at the top with nothing selected; otherwise held
  // behind the "N new stories" control so the list never moves under them (US-001.2 AC-2/AC-3).
  const flush = useCallback(() => {
    if (buffer.current.length === 0) return;
    const incoming = buffer.current;
    buffer.current = [];
    if (atTop() && selected === null) {
      setStories((list) => mergeStories(list, incoming));
      newestSeen.current = incoming.reduce((m, s) => (s.first_seen_at > (m ?? '') ? s.first_seen_at : m), newestSeen.current);
    } else {
      setPending((p) => mergeStories(p, incoming));
    }
  }, [selected]);
  useEffect(() => {
    const t = setInterval(flush, FLUSH_MS);
    return () => clearInterval(t);
  }, [flush]);

  useLiveEvent('story.created', (e: { story: StoryCard }) => {
    if (belongsToView(e.story, query, watchlist)) buffer.current.push(e.story);
  });
  useLiveEvent('story.updated', (e: { story_id: string; changes: Partial<StoryCard> }) => {
    setStories((list) => {
      const next = applyUpdate(list, e.story_id, e.changes);
      // A correction can take a story out of the Watchlist view (§6).
      if (query.view === 'watchlist' && watchlist) return next.filter((s) => s.story_id !== e.story_id || s.instruments.some((i) => watchlist.has(i.isin)));
      return next;
    });
    setPending((p) => applyUpdate(p, e.story_id, e.changes));
  });
  useLiveEvent('resync', () => router.refresh());

  function showPending() {
    window.scrollTo({ top: 0 });
    setStories((list) => mergeStories(list, pending));
    newestSeen.current = pending[0]?.first_seen_at && pending[0].first_seen_at > (newestSeen.current ?? '') ? pending[0].first_seen_at : newestSeen.current;
    setPending([]);
  }

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadError(false);
    try {
      const res = await fetch(`/v1/stream?${streamParams(query, cursor)}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { stories: StoryCard[]; next_cursor: string | null };
      setStories((list) => mergeStories(list, signedIn ? body.stories : markUnread(body.stories, readLocalSeen(query.view))));
      setCursor(body.next_cursor);
    } catch {
      setLoadError(true); // already-loaded stories stay (§5 Fetch error)
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, query, signedIn]);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => entries.some((x) => x.isIntersecting) && !loadError && void loadMore(), { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, loadError]);

  const setVotes = (id: string, v: VoteDisplay) => setStories((list) => list.map((s) => (s.story_id === id ? { ...s, votes: v } : s)));
  async function vote(a: VoteAction) {
    const s = stories.find((x) => x.story_id === selected);
    if (!s) return;
    if (!signedIn) return setMessages((m) => ({ ...m, [s.story_id]: 'Sign in to vote.' }));
    if (a.kind === 'directional' && !s.votes.directional) return;
    setVotes(s.story_id, optimistic(s.votes, a));
    const r = await sendVote(s.story_id, s.votes, a);
    if (r.ok) setVotes(s.story_id, r.votes);
    else {
      setVotes(s.story_id, s.votes);
      setMessages((m) => ({ ...m, [s.story_id]: r.message }));
    }
  }

  const move = (delta: number) => {
    if (stories.length === 0) return;
    const i = selected === null ? -1 : stories.findIndex((s) => s.story_id === selected);
    const next = stories[Math.max(0, Math.min(stories.length - 1, i + delta))]!;
    setSelected(next.story_id);
    document.getElementById(`row-${next.story_id}`)?.scrollIntoView({ block: 'nearest' });
  };
  const current = () => stories.find((s) => s.story_id === selected);
  const dir = (value: Direction) => () => void vote({ kind: 'directional', value });
  const qual = (value: QualityKind) => () => void vote({ kind: 'quality', value });
  useShortcuts({
    j: () => move(1),
    ArrowDown: () => move(1),
    k: () => move(-1),
    ArrowUp: () => move(-1),
    Enter: () => {
      const s = current();
      if (s) router.push(`/story/${s.story_id}`);
    },
    o: () => {
      const s = current();
      if (s) window.open(s.primary_item.url, '_blank', 'noopener,noreferrer');
    },
    '?': () => setHelp(true),
    Escape: () => (help ? setHelp(false) : setSelected(null)),
    '+': dir('bullish'),
    '=': dir('bullish'),
    '-': dir('bearish'),
    '0': dir('neutral'),
    i: qual('important'),
  });

  const divider = unreadDividerIndex(stories);
  return (
    <div className="stream">
      {/* Zero-height sticky anchor: the control floats over the list and never moves it (WORKFLOW §7). */}
      <div className="new-stories-anchor">
        {pending.length > 0 && (
          <button type="button" className="new-stories" onClick={showPending}>
            {pending.length === 1 ? '1 new story' : `${pending.length} new stories`}
          </button>
        )}
      </div>
      <ol className="rows panel" ref={listRef} role="listbox" aria-label="Stories" aria-activedescendant={selected ? `row-${selected}` : undefined}>
        {stories.map((s, i) => (
          <StoryRowWithDivider
            key={s.story_id}
            showDivider={i === divider}
            unreadCount={unreadCount}
            story={s}
            selected={s.story_id === selected}
            labels={labels}
            signedIn={signedIn}
            message={messages[s.story_id] ?? null}
            onSelect={() => setSelected(s.story_id)}
            onVotes={(v) => setVotes(s.story_id, v)}
          />
        ))}
      </ol>
      <div ref={sentinel} className="stream-end">
        {loadingMore && <span className="spinner" aria-label="Loading more stories" />}
        {loadError && (
          <span className="notice notice-error">
            Couldn&apos;t load more stories.{' '}
            <button type="button" className="button" onClick={() => void loadMore()}>
              Retry
            </button>
          </span>
        )}
        {!cursor && !loadingMore && stories.length > 0 && query.view !== 'trending' && <span className="faint">No more stories.</span>}
        {cursor && !loadingMore && !loadError && (
          <button type="button" className="button" onClick={() => void loadMore()}>
            Load more
          </button>
        )}
      </div>
      {help && <ShortcutHelp onClose={() => setHelp(false)} />}
    </div>
  );
}

function StoryRowWithDivider({ showDivider, unreadCount, ...row }: { showDivider: boolean; unreadCount: number | null } & Parameters<typeof StoryRow>[0]) {
  return (
    <>
      {showDivider && (
        <li className="unread-divider" role="separator" aria-label="New since your last visit">
          <span>New since your last visit{unreadCount !== null ? ` (${unreadCount})` : ''} ↑</span>
        </li>
      )}
      <StoryRow {...row} />
    </>
  );
}
