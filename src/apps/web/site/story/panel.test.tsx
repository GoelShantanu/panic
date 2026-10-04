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

describe('stream reader column (D-055)', () => {
  const live = { reconnecting: false, subscribe: () => () => undefined };
  const noComments = { comments: [], next_cursor: null, posting: { enabled: true } };
  let fetchMock: ReturnType<typeof vi.fn>;
  const fetched = (i: number) => fetchMock.mock.calls.some(([u]) => u === `/v1/stories/${card(i).story_id}`);
  const reader = () => screen.getByRole('complementary', { name: 'Story' });
  const mount = (withReader = true) =>
    render(
      <LiveContext.Provider value={live as never}>
        <Stream
          initial={{ stories: [card(2), card(1)], next_cursor: null }}
          query={{ view: 'latest', eventTypes: [], filingsOnly: false }}
          eventLabels={[['results', 'Results']]}
          signedIn={false}
          watchlistIsins={null}
          reader={withReader ? { story: detail(2), comments: noComments as never } : null}
        />
      </LiveContext.Provider>,
    );
  beforeEach(() => {
    Element.prototype.scrollIntoView = () => undefined;
    history.replaceState({}, '', '/?view=latest');
    fetchMock = vi.fn(async (url: string) => {
      const m = /\/v1\/stories\/(st_\d+)(\/comments)?$/.exec(url);
      if (!m) return json({}, 404);
      return m[2] ? json(noComments) : json(detail(Number(m[1]!.slice(3))));
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => (cleanup(), vi.unstubAllGlobals()));

  it('opens with the first story already in the reader, server-rendered, and the list beside it', () => {
    wide(true);
    mount();
    expect(within(reader()).getByText('Blurb for story 2 from the publisher feed.')).toBeTruthy();
    expect(within(reader()).getByText('From Example Desk')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(location.pathname + location.search).toBe('/?view=latest'); // landing does not change the address
    expect(document.getElementById(`row-${card(2).story_id}`)!.hasAttribute('data-shown')).toBe(true);
    expect(screen.getAllByRole('listitem').length).toBe(2);
  });

  it('without server data the reader fetches the first story itself, but only while it is visible', async () => {
    wide(false);
    mount(false);
    await act(async () => undefined);
    expect(fetchMock).not.toHaveBeenCalled(); // phones: the column is hidden
    cleanup();
    wide(true);
    mount(false);
    await within(reader()).findByText('Blurb for story 2 from the publisher feed.');
    expect(fetched(2)).toBe(true);
  });

  it('click, J and K change the story; the address bar shows its link; Back returns to the first story; Esc keeps the reader', async () => {
    wide(true);
    mount();
    // J starts from the story being read.
    await act(async () => void fireEvent.keyDown(window, { key: 'j' }));
    await within(reader()).findByText('Blurb for story 1 from the publisher feed.');
    expect(location.pathname).toBe(`/s/${card(1).story_id}`);
    expect(document.getElementById(`row-${card(1).story_id}`)!.hasAttribute('data-shown')).toBe(true);

    // K moves back, replacing (not adding) the history entry; story 2 comes from the server data.
    const depth = history.length;
    await act(async () => void fireEvent.keyDown(window, { key: 'k' }));
    await within(reader()).findByText('Blurb for story 2 from the publisher feed.');
    expect(location.pathname).toBe(`/s/${card(2).story_id}`);
    expect(history.length).toBe(depth);
    expect(fetched(2)).toBe(false);

    // A plain click on a headline.
    await act(async () => void fireEvent.click(screen.getByText('Invented story 1'), { button: 0 }));
    await within(reader()).findByText('Blurb for story 1 from the publisher feed.');
    expect(location.pathname).toBe(`/s/${card(1).story_id}`);

    await act(async () => void fireEvent.keyDown(window, { key: 'Escape' }));
    expect(within(reader()).getByText('Blurb for story 1 from the publisher feed.')).toBeTruthy();

    await act(async () => {
      history.back();
      await new Promise((r) => setTimeout(r, 50)); // history.back() is asynchronous
    });
    expect(location.pathname + location.search).toBe('/?view=latest');
    await within(reader()).findByText('Blurb for story 2 from the publisher feed.');
  });

  it('modifier clicks and narrow screens leave the link alone (new tab, or the full page)', async () => {
    wide(true);
    mount();
    await act(async () => void fireEvent.click(screen.getByText('Invented story 1'), { button: 0, ctrlKey: true }));
    expect(location.pathname).toBe('/');
    expect(fetched(1)).toBe(false);
    cleanup();
    wide(false);
    mount();
    await act(async () => void fireEvent.click(screen.getByText('Invented story 1'), { button: 0 }));
    expect(location.pathname).toBe('/');
    expect(fetched(1)).toBe(false);
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
