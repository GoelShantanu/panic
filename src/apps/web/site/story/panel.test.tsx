// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveContext } from '../live.tsx';
import { Stream } from '../stream/Stream.tsx';
import type { StoryCard } from '../types.ts';
import { StoryView } from './StoryView.tsx';
import type { StoryDetail } from './StoryView.tsx';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

// All companies and text are fictional.
const card = (i: number): StoryCard => ({
  story_id: `st_${String(i).padStart(26, '0')}`,
  headline: `Invented story ${i}`,
  first_seen_at: new Date(Date.UTC(2026, 9, 5, 6, 0, i)).toISOString(),
  updated_at: new Date(Date.UTC(2026, 9, 5, 6, 0, i)).toISOString(),
  primary_item: { item_id: `it_${i}`, kind: 'article', source: { source_id: 'src_x', name: 'Example Desk', tier: 3 }, url: 'https://example.invalid/x', published_at: null },
  source_count: 1,
  instruments: [],
  unresolved_mentions: [],
  event_types: ['results'],
  votes: { directional: { state: 'none', label: 'Community opinion' }, important_count: 0 },
  comment_count: 0,
});
const detail = (i: number, over: Partial<StoryDetail> = {}): StoryDetail => ({
  story_id: card(i).story_id,
  headline: `Invented story ${i}`,
  first_seen_at: card(i).first_seen_at,
  updated_at: card(i).updated_at,
  event_types: ['results'],
  instruments: [],
  unresolved_mentions: [],
  summary: null,
  primary_item_id: `it_${i}`,
  items: [{ item_id: `it_${i}`, kind: 'article', source: { source_id: 'src_x', name: 'Example Desk', tier: 3 }, headline: `Invented story ${i}`, url: 'https://example.invalid/x', published_at: null, status: 'live', excerpt: `Blurb for story ${i} from the publisher feed.` }],
  related: {},
  votes: { directional: { state: 'none', label: 'Community opinion' }, important_count: 0 },
  comment_count: 0,
  ...over,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const wide = (matches: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: matches && q === '(min-width: 1100px)', media: q, addEventListener() {}, removeEventListener() {} }));

describe('story side panel (D-055)', () => {
  const live = { reconnecting: false, subscribe: () => () => undefined };
  const mount = () =>
    render(
      <LiveContext.Provider value={live as never}>
        <Stream initial={{ stories: [card(2), card(1)], next_cursor: null }} query={{ view: 'latest', eventTypes: [], filingsOnly: false }} eventLabels={[['results', 'Results']]} signedIn={false} watchlistIsins={null} />
      </LiveContext.Provider>,
    );
  beforeEach(() => {
    Element.prototype.scrollIntoView = () => undefined;
    history.replaceState({}, '', '/?view=latest');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const m = /\/v1\/stories\/(st_\d+)(\/comments)?$/.exec(url);
        if (!m) return json({}, 404);
        const i = Number(m[1]!.slice(3));
        return m[2] ? json({ comments: [], next_cursor: null, posting: { enabled: true } }) : json(detail(i));
      }),
    );
  });
  afterEach(() => (cleanup(), vi.unstubAllGlobals()));

  it('wide screens: a plain click opens the story beside the list; the address bar shows its link; Esc and Back close it', async () => {
    wide(true);
    mount();
    const link = screen.getByText('Invented story 2');
    await act(async () => void fireEvent.click(link, { button: 0 }));
    const panel = await screen.findByRole('complementary', { name: 'Story' });
    await within(panel).findByText('Blurb for story 2 from the publisher feed.');
    expect(within(panel).getByText('From Example Desk')).toBeTruthy();
    expect(location.pathname).toBe(`/s/${card(2).story_id}`);
    expect(document.body.classList.contains('panel-open')).toBe(true);
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0); // the list stays

    // J moves the selection and the panel follows, replacing (not adding) the history entry.
    const depth = history.length;
    await act(async () => void fireEvent.keyDown(window, { key: 'j' }));
    await within(panel).findByText('Blurb for story 1 from the publisher feed.');
    expect(location.pathname).toBe(`/s/${card(1).story_id}`);
    expect(history.length).toBe(depth);

    // Esc goes back to the stream's own URL.
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
      await new Promise((r) => setTimeout(r, 50)); // history.back() is asynchronous
    });
    expect(location.pathname + location.search).toBe('/?view=latest');
    expect(screen.queryByRole('complementary', { name: 'Story' })).toBeNull();
    expect(document.body.classList.contains('panel-open')).toBe(false);
  });

  it('modifier clicks and narrow screens leave the link alone (new tab, or the full page)', async () => {
    wide(true);
    mount();
    await act(async () => void fireEvent.click(screen.getByText('Invented story 2'), { button: 0, ctrlKey: true }));
    expect(screen.queryByRole('complementary', { name: 'Story' })).toBeNull();
    cleanup();
    wide(false);
    mount();
    await act(async () => void fireEvent.click(screen.getByText('Invented story 2'), { button: 0 }));
    expect(screen.queryByRole('complementary', { name: 'Story' })).toBeNull();
  });
});

describe('story view content (D-055)', () => {
  afterEach(cleanup);
  it('articles show the publisher blurb with attribution; filings with a summary show the summary instead', () => {
    const { unmount } = render(<StoryView story={detail(3)} eventLabels={[]} signedIn={false} me={null} comments={null} variant="page" />);
    expect(screen.getByText('Blurb for story 3 from the publisher feed.')).toBeTruthy();
    expect(screen.getByText('From Example Desk')).toBeTruthy();
    unmount();
    render(
      <StoryView
        story={detail(4, { summary: { text: 'A short neutral summary of the filing.', label: 'AI summary of the BSE filing', source_item_id: 'it_4', generated_at: '2026-10-05T06:00:00Z' } })}
        eventLabels={[]}
        signedIn={false}
        me={null}
        comments={null}
        variant="page"
      />,
    );
    expect(screen.getByText('A short neutral summary of the filing.')).toBeTruthy();
    expect(screen.queryByText('Blurb for story 4 from the publisher feed.')).toBeNull();
  });
});
