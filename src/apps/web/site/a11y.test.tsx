// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Comments } from './comments/Comments.tsx';
import { GrievanceForm } from './community/GrievanceForm.tsx';
import { Header } from './Header.tsx';
import { LiveContext } from './live.tsx';
import { Stream } from './stream/Stream.tsx';
import type { StoryCard } from './types.ts';
import { Watchlist } from './watchlist/Watchlist.tsx';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));
afterEach(cleanup);
// jsdom has no layout; the stream scrolls the selected row into view.
Element.prototype.scrollIntoView = () => undefined;

// NFR-001.5 (WCAG 2.2 AA), structural rules. jsdom has no layout, so colour contrast and target
// size are checked in a real browser at each exit review (D-047), not here.
async function violations(container: HTMLElement) {
  const r = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, rules: { 'color-contrast': { enabled: false }, 'target-size': { enabled: false } } });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

// All companies and text are fictional.
const card = (i: number): StoryCard => ({
  story_id: `st_${String(i).padStart(26, '0')}`,
  headline: `Invented story ${i}`,
  first_seen_at: new Date(Date.UTC(2026, 9, 5, 6, 0, i)).toISOString(),
  updated_at: new Date(Date.UTC(2026, 9, 5, 6, 0, i)).toISOString(),
  primary_item: { item_id: `it_${i}`, kind: i % 2 ? 'filing' : 'article', source: { source_id: 'src_x', name: 'Example Desk', tier: 3 }, url: 'https://example.invalid/x', published_at: null },
  source_count: 2,
  instruments: [{ isin: 'INE00AST1018', display_symbol: 'ASTERION', exchange_codes: { nse: 'ASTERION', bse: '500101' }, resolution: 'resolved', confidence: 1 }],
  unresolved_mentions: [],
  event_types: ['results'],
  votes: { directional: { state: 'shown', total: 9, bullish: 5, bearish: 3, neutral: 1, label: 'Community opinion' }, important_count: 2 } as never,
  comment_count: 3,
  is_unread: i > 2,
});

describe('accessibility, structural (NFR-001.5)', () => {
  it('the stream, with a selected row and the unread divider', async () => {
    const live = { reconnecting: false, subscribe: () => () => undefined };
    const { container } = render(
      <LiveContext.Provider value={live as never}>
        <main>
          <Stream initial={{ stories: [card(4), card(3), card(2), card(1)], next_cursor: null }} query={{ view: 'latest', eventTypes: [], filingsOnly: false }} eventLabels={[['results', 'Results']]} signedIn watchlistIsins={[]} />
        </main>
      </LiveContext.Provider>,
    );
    fireEvent.keyDown(window, { key: 'j' });
    expect(container.querySelector('li.row[aria-current="true"]')).toBeTruthy();
    expect(await violations(container)).toEqual([]);
  });

  it('header, comments, watchlist, grievance form', async () => {
    const { container } = render(
      <>
        <Header session={{ state: 'open', exchange_date: '2026-10-05', next_transition_at: '2026-10-05T10:00:00Z' }} viewer={{ username: 'asha_k', tier: 'free', attention: true }} />
        <main>
          <Comments
            storyId="st_1"
            me="asha_k"
            initial={{
              comments: [{ comment_id: 'cm_A', parent_id: null, depth: 1, author: { username: 'other' }, body: 'See https://example.invalid', created_at: new Date().toISOString(), edited: false, state: 'visible', replies: [] }],
              next_cursor: null,
              posting: { enabled: true, can_post: true, reason: null },
            }}
          />
          <Watchlist initial={[{ isin: 'INE00AST1016', display_symbol: 'ASTERION', name: 'Asterion Industries Limited', status: 'listed', successor_isin: null, latest_story_at: null, added_at: '2026-10-01T00:00:00Z' }]} limit={20} welcome={false} />
          <GrievanceForm commentId={null} />
        </main>
      </>,
    );
    expect(await violations(container)).toEqual([]);
  });
});
