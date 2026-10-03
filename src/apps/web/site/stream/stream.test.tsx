// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveContext } from '../live.tsx';
import type { StoryCard, StreamQuery } from '../types.ts';
import { voteErrorMessage, voteRequest } from '../votes/vote.ts';
import { applyUpdate, belongsToView, mergeStories, parseQuery, streamParams, unreadDividerIndex } from './logic.ts';
import { Stream } from './Stream.tsx';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const A = 'INE00AST1018';
let n = 0;
function card(over: Partial<StoryCard> = {}): StoryCard {
  n++;
  return {
    story_id: `st_${String(n).padStart(26, '0')}`,
    headline: `Invented story ${n}`,
    first_seen_at: new Date(Date.UTC(2026, 9, 5, 6, 0, n)).toISOString(),
    updated_at: new Date(Date.UTC(2026, 9, 5, 6, 0, n)).toISOString(),
    primary_item: { kind: 'article', source: { source_id: 'src_x', name: 'Example Desk', tier: 3 }, url: 'https://example.invalid/x', published_at: null },
    source_count: 1,
    instruments: [{ isin: A, display_symbol: 'ASTERION', exchange_codes: { nse: 'ASTERION', bse: '500101' }, resolution: 'resolved', confidence: 1 }],
    unresolved_mentions: [],
    event_types: ['results'],
    votes: { directional: { state: 'none', label: 'Community opinion' }, important_count: 0 },
    comment_count: 0,
    ...over,
  };
}
const latest: StreamQuery = { view: 'latest', eventTypes: [], filingsOnly: false };

describe('stream logic (PRD-001)', () => {
  it('query ↔ URL round-trips; unknown views fall back to Latest', () => {
    const q: StreamQuery = { view: 'watchlist', eventTypes: ['results', 'dividend'], filingsOnly: true };
    expect(parseQuery(Object.fromEntries(streamParams(q)))).toEqual(q);
    expect(parseQuery({ view: 'everything' }).view).toBe('latest');
  });
  it('a live story joins only views it can belong to', () => {
    const c = card({ event_types: ['dividend'] });
    expect(belongsToView(c, latest, null)).toBe(true);
    expect(belongsToView(c, { ...latest, eventTypes: ['results'] }, null)).toBe(false);
    expect(belongsToView(c, { ...latest, filingsOnly: true }, null)).toBe(false);
    expect(belongsToView(c, { ...latest, view: 'watchlist' }, new Set([A]))).toBe(true);
    expect(belongsToView(c, { ...latest, view: 'watchlist' }, new Set(['INE00ZZZ1010']))).toBe(false);
    for (const view of ['important', 'bullish', 'bearish', 'trending'] as const) expect(belongsToView(c, { ...latest, view }, null)).toBe(false);
  });
  it('one row per story, newest first; updates in place keep the viewer’s own votes', () => {
    const [x, y] = [card(), card()];
    expect(mergeStories([x!], [y!, x!]).map((s) => s.story_id)).toEqual([y!.story_id, x!.story_id]);
    const mine = { ...x!, votes: { ...x!.votes, mine: { directional: 'bullish' as const, quality: [] } } };
    const updated = applyUpdate([mine], x!.story_id, { source_count: 5, votes: { important_count: 2, directional: { state: 'few', total: 2, label: 'Community opinion' } } });
    expect(updated[0]).toMatchObject({ source_count: 5, first_seen_at: x!.first_seen_at, votes: { important_count: 2, mine: { directional: 'bullish' } } });
  });
  it('the unread divider sits after the last unread story', () => {
    expect(unreadDividerIndex([card({ is_unread: true }), card({ is_unread: true }), card()])).toBe(2);
    expect(unreadDividerIndex([card(), card()])).toBe(-1);
  });
});

describe('votes (PRD-005)', () => {
  it('choosing the current vote again removes it; quality toggles', () => {
    const v = { important_count: 0, directional: { state: 'none' as const, label: 'x' }, mine: { directional: 'bullish' as const, quality: ['important' as const] } };
    expect(voteRequest('st_1', v, { kind: 'directional', value: 'bullish' }).method).toBe('DELETE');
    expect(voteRequest('st_1', v, { kind: 'directional', value: 'bearish' })).toMatchObject({ method: 'PUT', body: { vote: 'bearish' } });
    expect(voteRequest('st_1', v, { kind: 'quality', value: 'important' }).method).toBe('DELETE');
  });
  it('explains refusals in plain words', () => {
    expect(voteErrorMessage(403, { reason: 'account_too_new', eligible_from: '2026-10-12' })).toBe('Directional voting opens for your account on 12 Oct 2026.');
    expect(voteErrorMessage(429, { retry_after_s: 600 })).toBe('You have reached the hourly vote limit. Voting resumes in 10 min.');
    expect(voteErrorMessage(401, null)).toBe('Sign in to vote.');
  });
});

describe('<Stream>', () => {
  let emit: (type: string, data: unknown) => void;
  const listeners = new Map<string, Set<(d: unknown) => void>>();
  const live = {
    reconnecting: false,
    subscribe: (type: string, fn: (d: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
      return () => void listeners.get(type)!.delete(fn);
    },
  };
  emit = (type, data) => listeners.get(type)?.forEach((fn) => fn(data));

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.scrollTo = vi.fn() as never;
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    cleanup();
    listeners.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  const mount = (stories: StoryCard[], props: Partial<Parameters<typeof Stream>[0]> = {}) =>
    render(
      <LiveContext.Provider value={live as never}>
        <Stream initial={{ stories, next_cursor: null }} query={latest} eventLabels={[['results', 'Results']]} signedIn={false} watchlistIsins={null} {...props} />
      </LiveContext.Provider>,
    );
  const headlines = () => screen.getAllByRole('option').map((li) => li.querySelector('.row-headline')!.textContent);

  it('J/K select rows; Esc clears; shortcuts pause in text fields', () => {
    const [a, b] = [card(), card()];
    mount([b!, a!]);
    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'j' });
    expect(screen.getAllByRole('option')[1]!.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(window, { key: 'k' });
    expect(screen.getAllByRole('option')[0]!.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getAllByRole('option').some((o) => o.getAttribute('aria-selected') === 'true')).toBe(false);
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'j' });
    expect(screen.getAllByRole('option').some((o) => o.getAttribute('aria-selected') === 'true')).toBe(false);
    input.remove();
  });

  it('new stories insert at the top when idle; are held behind a control when a row is selected', async () => {
    const old = card();
    mount([old]);
    const fresh = card();
    act(() => emit('story.created', { story: fresh }));
    await act(async () => void vi.advanceTimersByTime(1100));
    expect(headlines()[0]).toBe(fresh.headline);

    fireEvent.keyDown(window, { key: 'j' });
    const later = card();
    act(() => emit('story.created', { story: later }));
    await act(async () => void vi.advanceTimersByTime(1100));
    expect(headlines()[0]).toBe(fresh.headline);
    const control = screen.getByRole('button', { name: '1 new story' });
    fireEvent.click(control);
    expect(headlines()[0]).toBe(later.headline);
    expect(screen.getAllByRole('option').find((o) => o.getAttribute('aria-selected') === 'true')!.textContent).toContain(fresh.headline);
  });

  it('stories outside the view are ignored; updates change rows in place', async () => {
    const [a, b] = [card(), card()];
    mount([b!, a!], { query: { ...latest, eventTypes: ['results'] } });
    act(() => emit('story.created', { story: card({ event_types: ['dividend'] }) }));
    await act(async () => void vi.advanceTimersByTime(1100));
    expect(headlines()).toHaveLength(2);
    act(() => emit('story.updated', { story_id: a!.story_id, changes: { source_count: 6 } }));
    expect(headlines()[1]).toBe(a!.headline);
    expect(screen.getAllByRole('option')[1]!.textContent).toContain('6 sources');
  });

  it('loads the next page by cursor; a failed load keeps the stories and offers retry', async () => {
    const page2 = card({ first_seen_at: '2026-10-01T00:00:00.000Z' });
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 500 })).mockResolvedValueOnce(new Response(JSON.stringify({ stories: [page2], next_cursor: null })));
    vi.stubGlobal('fetch', fetchMock);
    mount([card()], { initial: { stories: [card()], next_cursor: 'c1' } });
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Load more' })));
    expect(screen.getByText(/Couldn.t load more stories/)).toBeTruthy();
    expect(headlines()).toHaveLength(1);
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Retry' })));
    expect(headlines()).toContain(page2.headline);
    expect(String(fetchMock.mock.calls[1]![0])).toContain('cursor=c1');
  });

  it('keyboard votes are optimistic and revert with the reason on refusal', async () => {
    const s = card({ votes: { directional: { state: 'none', label: 'Community opinion' }, important_count: 0, mine: { directional: null, quality: [] }, can_vote: { directional: true, quality: true, reason: null } } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'not_eligible', reason: 'email_unverified' }), { status: 403 })));
    mount([s], { signedIn: true });
    fireEvent.keyDown(window, { key: 'j' });
    await act(async () => void fireEvent.keyDown(window, { key: '+' }));
    expect(screen.getByRole('button', { name: 'Bullish' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getAllByText('Verify your email address to vote.').length).toBeGreaterThan(0);
  });

  it('anonymous unread marker comes from browser storage', () => {
    const [a, b, c] = [card(), card(), card()];
    localStorage.setItem('sp-seen:latest', a!.first_seen_at);
    mount([c!, b!, a!]);
    expect(screen.getByRole('separator').textContent).toBe('New since your last visit (2) ↑');
  });
});
