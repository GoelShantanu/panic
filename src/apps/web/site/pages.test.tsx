// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FollowButton } from './FollowButton.tsx';
import { Search } from './Search.tsx';
import { StoryVotes } from './story/StoryVotes.tsx';
import { CommunityOpinion } from './votes/VoteControls.tsx';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

beforeEach(() => push.mockReset());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('community opinion display (PRD-005 US-005.3)', () => {
  it('progressive: none, few, counts — always labelled, words beside colour', () => {
    const { rerender, container } = render(<CommunityOpinion votes={{ important_count: 0, directional: { state: 'none', label: 'Community opinion' } }} />);
    expect(container.textContent).toBe('Be the first to vote');
    rerender(<CommunityOpinion votes={{ important_count: 0, directional: { state: 'few', total: 2, label: 'Community opinion' } }} />);
    expect(container.textContent).toBe('2 people voted');
    rerender(<CommunityOpinion votes={{ important_count: 0, directional: { state: 'counts', total: 9, bullish: 5, bearish: 3, neutral: 1, label: 'Community opinion' } }} />);
    expect(container.textContent).toBe('Community opinion: Bullish 5 · Bearish 3 · Neutral 1');
  });
  it('absent when the kill switch is off; compact rows show only counts', () => {
    const { container, rerender } = render(<CommunityOpinion votes={{ important_count: 3 }} />);
    expect(container.textContent).toBe('');
    rerender(<CommunityOpinion compact votes={{ important_count: 0, directional: { state: 'few', total: 2, label: 'Community opinion' } }} />);
    expect(container.textContent).toBe('');
  });
});

describe('follow button (PRD-003 §2)', () => {
  it('visitors are sent to sign in', () => {
    render(<FollowButton isin="INE00AST1016" initial={false} signedIn={false} />);
    expect(screen.getByRole('link', { name: 'Sign in to follow' }).getAttribute('href')).toBe('/sign-in');
  });
  it('follows and unfollows; a full free watchlist explains the limit', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response('{"error":"upgrade_required"}', { status: 402 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<FollowButton isin="INE00AST1016" initial={false} signedIn />);
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Follow' })));
    expect(fetchMock.mock.calls[0]).toMatchObject(['/v1/watchlist', { method: 'POST', body: '{"isin":"INE00AST1016"}' }]);
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Following' })));
    expect(fetchMock.mock.calls[1]![0]).toBe('/v1/watchlist/INE00AST1016');
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Follow' })));
    expect(screen.getByRole('status').textContent).toContain('watchlist is full');
  });
  it('disabled for delisted or merged companies', () => {
    render(<FollowButton isin="INE00AST1016" initial={false} signedIn disabled />);
    expect((screen.getByRole('button', { name: 'Follow' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('company search', () => {
  it('debounced results; arrow keys and Enter open the company', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ results: [{ isin: 'INE00AST1016', name: 'Asterion Industries Limited', display_symbol: 'ASTERION', segment: 'mainboard', status: 'listed' }, { isin: 'INE00ASX1010', name: 'Astra Example Limited', display_symbol: 'ASTRAEX', segment: 'sme', status: 'suspended' }] })),
      ),
    );
    render(<Search />);
    const box = screen.getByRole('combobox');
    fireEvent.change(box, { target: { value: 'ast' } });
    await act(async () => void vi.advanceTimersByTime(200));
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getAllByRole('option')[1]!.textContent).toContain('suspended');
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/c/INE00ASX1010');
  });
});

describe('story page votes (PRD-005 US-005.1 AC-2)', () => {
  it('+ casts bullish on the open story; shortcuts do nothing for visitors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ votes: { important_count: 0, directional: { state: 'few', total: 1, label: 'Community opinion' }, mine: { directional: 'bullish', quality: [] }, can_vote: { directional: true, quality: true, reason: null } } })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const votes = { important_count: 0, directional: { state: 'none' as const, label: 'Community opinion' }, mine: { directional: null, quality: [] }, can_vote: { directional: true, quality: true, reason: null } };
    const { unmount } = render(<StoryVotes storyId="st_1" initial={votes} instruments={[]} signedIn={false} />);
    fireEvent.keyDown(window, { key: '+' });
    expect(fetchMock).not.toHaveBeenCalled();
    unmount();
    render(<StoryVotes storyId="st_1" initial={votes} instruments={[]} signedIn />);
    await act(async () => void fireEvent.keyDown(window, { key: '+' }));
    expect(fetchMock.mock.calls[0]).toMatchObject(['/v1/stories/st_1/votes/directional', { method: 'PUT', body: '{"vote":"bullish"}' }]);
    expect(screen.getByRole('button', { name: 'Bullish' }).getAttribute('aria-pressed')).toBe('true');
  });
});
