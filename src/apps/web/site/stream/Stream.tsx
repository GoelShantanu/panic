'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useShortcuts } from '../keyboard.ts';
import { useLiveEvent } from '../live.tsx';
import { ShortcutHelp } from '../ShortcutHelp.tsx';
import { StoryPanel } from '../story/StoryPanel.tsx';
import type { ReaderData } from '../story/StoryPanel.tsx';
import type { RelatedGroup } from '../story/StoryView.tsx';
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
  // Company timeline (PRD-004 US-004.3 AC-3): pages from its own endpoint, takes only its company's stories.
  timeline?: { isin: string; depthLimitReached: boolean };
  // The signed-in reader's username, so their own comments show Edit and Delete in the reader.
  viewerUsername?: string | null;
  // Tabs, filters and banners: the top of the list column, beside the reader (D-055).
  header?: ReactNode;
  // The first story, server-rendered into the reader so wide screens open with it showing (D-055).
  reader?: ReaderData | null;
  // A story's own URL (/s/{id}, D-057): the reader holds that story as the page's main content; on
  // narrow screens it is shown alone, without the list.
  pageStory?: { id: string; related: RelatedGroup[] };
}

// Wide enough for list and reader side by side (D-055); narrower screens hide the reader and open the full page.
export const PANEL_QUERY = '(min-width: 1100px)';
const panelState = () => (typeof history !== 'undefined' ? ((history.state as { spStory?: string } | null)?.spStory ?? null) : null);

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

export function Stream({ initial, query, eventLabels, signedIn, watchlistIsins, timeline, viewerUsername = null, header, reader = null, pageStory }: StreamProps) {
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
  // Reader column (D-055): always beside the list on wide screens, showing the first story until the
  // reader picks another. CSS hides it on narrow screens, where a click opens the full page instead.
  const defaultStory = reader?.story.story_id ?? initial.stories[0]?.story_id ?? null;
  const [shown, setShown] = useState<string | null>(defaultStory);
  // Read on the first client render (it only changes click handlers, never markup), so a click right
  // after load already uses the reader.
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(PANEL_QUERY).matches === true);
  const streamUrl = useRef<string | null>(null);
  useEffect(() => {
    const mq = window.matchMedia?.(PANEL_QUERY);
    if (!mq) return;
    setWide(mq.matches);
    const on = () => setWide(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  // A chosen story puts its own URL in the address bar, so it can be copied or shared; Back returns.
  const openPanel = useCallback((id: string) => {
    setSelected(id);
    if (panelState() === null) {
      streamUrl.current = window.location.pathname + window.location.search;
      history.pushState({ spStory: id }, '', `/s/${id}`);
    } else if (panelState() !== id) history.replaceState({ spStory: id }, '', `/s/${id}`);
    setShown(id);
  }, []);
  useEffect(() => {
    const onPop = () => {
      const id = panelState();
      setShown(id ?? defaultStory);
      setSelected(id);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [defaultStory]);
  // Narrowed while a chosen story is in the address bar: hand over to its full page.
  useEffect(() => {
    if (!wide && shown && panelState() && streamUrl.current !== null) window.location.assign(`/s/${shown}`);
  }, [shown, wide]);
  // Follow from any stream row (PRD-003 US-003.1 AC-3).
  const [followed, setFollowed] = useState<Set<string> | null>(watchlistIsins ? new Set(watchlistIsins) : null);
  async function follow(isin: string, on: boolean) {
    const res = await fetch(on ? '/v1/watchlist' : `/v1/watchlist/${isin}`, {
      method: on ? 'POST' : 'DELETE',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      ...(on ? { body: JSON.stringify({ isin }) } : {}),
    }).catch(() => null);
    if (res && (res.ok || res.status === 409)) {
      setFollowed((f) => {
        const n = new Set(f ?? []);
        on ? n.add(isin) : n.delete(isin);
        return n;
      });
    } else if (res?.status === 402 && selected) setMessages((m) => ({ ...m, [selected]: 'Your watchlist is full on this plan. Paid holds 200 companies.' }));
  }
  const [depthLimit, setDepthLimit] = useState(timeline?.depthLimitReached ?? false);
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
    if (timeline && !e.story.instruments.some((i) => i.isin === timeline.isin)) return;
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
  useLiveEvent('resync', () => {
    // A refresh renders the URL in the address bar; put the stream's back first if a story is open.
    if (panelState() && streamUrl.current) history.replaceState({}, '', streamUrl.current);
    setShown(defaultStory);
    router.refresh();
  });

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
      const base = timeline ? `/v1/companies/${timeline.isin}/timeline` : '/v1/stream';
      const res = await fetch(`${base}?${streamParams(query, cursor)}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { stories: StoryCard[]; next_cursor: string | null; depth_limit_reached?: boolean };
      if (body.depth_limit_reached) setDepthLimit(true);
      setStories((list) => mergeStories(list, signedIn ? body.stories : markUnread(body.stories, readLocalSeen(query.view))));
      setCursor(body.next_cursor);
    } catch {
      setLoadError(true); // already-loaded stories stay (§5 Fetch error)
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, query, signedIn, timeline]);

  const sentinel = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // On wide screens the list scrolls inside its own pane (D-057): measure against that, so the next
    // page still starts loading 400 px early.
    const box = scroller.current;
    const root = box && getComputedStyle(box).overflowY !== 'visible' ? box : null;
    const io = new IntersectionObserver((entries) => entries.some((x) => x.isIntersecting) && !loadError && void loadMore(), { root, rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, loadError, wide]);

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
    const from = selected ?? (wide ? shown : null); // on wide screens J/K start from the story being read
    const i = from === null ? -1 : stories.findIndex((s) => s.story_id === from);
    const next = stories[Math.max(0, Math.min(stories.length - 1, i + delta))]!;
    setSelected(next.story_id);
    if (wide) openPanel(next.story_id); // the reader follows J/K
    const row = document.getElementById(`row-${next.story_id}`);
    row?.scrollIntoView({ block: 'nearest' });
    // Focus follows the selection so screen readers announce the headline.
    row?.querySelector<HTMLElement>('.row-headline')?.focus({ preventScroll: true });
  };
  const current = () => stories.find((s) => s.story_id === selected);
  const dir = (value: Direction) => () => void vote({ kind: 'directional', value });
  const qual = (value: QualityKind) => () => void vote({ kind: 'quality', value });
  // A story page on a narrow screen shows no list, so the list's keys stay off; the reader keeps its own.
  const listKeys = !(pageStory && !wide);
  useShortcuts(listKeys ? {
    j: () => move(1),
    ArrowDown: () => move(1),
    k: () => move(-1),
    ArrowUp: () => move(-1),
    Enter: () => {
      const s = current();
      if (!s) return;
      if (wide) openPanel(s.story_id);
      else router.push(`/s/${s.story_id}`);
    },
    o: () => {
      const s = current();
      if (s) window.open(`/v1/out/${s.primary_item.item_id}?from=stream`, '_blank', 'noopener,noreferrer');
    },
    '?': () => setHelp(true),
    Escape: () => (help ? setHelp(false) : setSelected(null)),
    // On wide screens the reader's vote buttons own these keys (for the story it shows), so a vote is never cast twice.
    ...(wide ? {} : { '+': dir('bullish'), '=': dir('bullish'), '-': dir('bearish'), '0': dir('neutral'), i: qual('important') }),
  } : {});

  const divider = unreadDividerIndex(stories);
  return (
    <div className="stream-layout" data-page-story={pageStory ? '' : undefined}>
      <div className="stream-col">
        {header && <div className="pane-head">{header}</div>}
        {/* Focusable: on wide screens it scrolls on its own, and Page Down or Space must reach it (WCAG 2.1.1). */}
        <div className="stream" ref={scroller} tabIndex={0} role="region" aria-label="Story list">
          {/* Zero-height sticky anchor: the control floats over the list and never moves it (WORKFLOW §7). */}
          <div className="new-stories-anchor">
            {pending.length > 0 && (
              <button type="button" className="new-stories" onClick={showPending}>
                {pending.length === 1 ? '1 new story' : `${pending.length} new stories`}
              </button>
            )}
          </div>
          <ol className="rows panel" ref={listRef} aria-label="Stories">
            {stories.map((s, i) => (
              <StoryRowWithDivider
                key={s.story_id}
                showDivider={i === divider}
                unreadCount={unreadCount}
                story={s}
                selected={s.story_id === selected}
                shown={s.story_id === shown}
                labels={labels}
                signedIn={signedIn}
                message={messages[s.story_id] ?? null}
                onSelect={() => (wide ? openPanel(s.story_id) : setSelected(s.story_id))}
                onOpen={wide ? () => openPanel(s.story_id) : undefined}
                actions={!wide}
                onVotes={(v) => setVotes(s.story_id, v)}
                followed={followed}
                onFollow={(isin, on) => void follow(isin, on)}
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
            {!cursor && !loadingMore && stories.length > 0 && query.view !== 'trending' && (
              <span className="faint">{depthLimit ? 'Older stories are available on the paid plan.' : 'No more stories.'}</span>
            )}
            {cursor && !loadingMore && !loadError && (
              <button type="button" className="button" onClick={() => void loadMore()}>
                Load more
              </button>
            )}
          </div>
          {help && <ShortcutHelp onClose={() => setHelp(false)} />}
        </div>
      </div>
      {shown && (
        <StoryPanel
          storyId={shown}
          initial={reader}
          eventLabels={eventLabels}
          signedIn={signedIn}
          me={viewerUsername}
          active={wide || !!pageStory}
          onVotes={(v) => setVotes(shown, v)}
          pageStory={pageStory}
        />
      )}
    </div>
  );
}

function StoryRowWithDivider({ showDivider, unreadCount, ...row }: { showDivider: boolean; unreadCount: number | null } & Parameters<typeof StoryRow>[0]) {
  return (
    <>
      {showDivider && (
        <li className="unread-divider">
          <span>New since your last visit{unreadCount !== null ? ` (${unreadCount})` : ''} ↑</span>
        </li>
      )}
      <StoryRow {...row} />
    </>
  );
}
