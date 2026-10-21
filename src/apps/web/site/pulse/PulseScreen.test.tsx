// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PulseScreen } from './PulseScreen.tsx';
import type { PulseResponse } from '../../src/pulse.ts';
import type { StoryCard } from '../types.ts';

beforeEach(() => {
  global.fetch = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('sector=it')) {
      return {
        ok: true,
        json: async () => ({ stories: [mockStories[0]] }),
      };
    }
    if (url.includes('/market/pulse/refresh')) {
      return {
        ok: true,
        json: async () => ({
          pulse: { ...mockPulse, updatedAt: '2026-10-17T12:01:00.000Z' },
          usage: { daily_hits: 1, hits_left: 99, max_daily: 100 },
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({ stories: mockStories }),
    };
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mockPulse: PulseResponse = {
  breadth: {
    advances: 1684,
    declines: 1427,
    unchanged: 84,
    total: 3195,
    ratio: 1.18,
    sentiment: 'bullish',
    sentimentLabel: 'Bullish Breadth',
    nifty50: {
      advances: 26,
      declines: 22,
      unchanged: 2,
    },
    updatedAt: '2026-10-17T12:00:00.000Z',
  },
  sectors: [
    {
      id: 'it',
      name: 'NIFTY IT',
      symbol: 'NSE:CNXIT',
      price: 31924.1,
      change: 1204.3,
      percent: 3.92,
      sentiment: 'bull',
      status: 'leading',
      topConstituents: ['TCS', 'INFY', 'WIPRO', 'HCLTECH'],
    },
    {
      id: 'auto',
      name: 'NIFTY AUTO',
      symbol: 'NSE:CNXAUTO',
      price: 25768.5,
      change: 192.1,
      percent: 0.75,
      sentiment: 'bull',
      status: 'bullish',
      topConstituents: ['TATAMOTORS', 'M&M', 'MARUTI'],
    },
  ],
  updatedAt: '2026-10-17T12:00:00.000Z',
};

const mockStories: StoryCard[] = [
  {
    story_id: 'story-it-1',
    headline: 'TCS signs major enterprise deal',
    first_seen_at: '2026-10-17T11:00:00Z',
    updated_at: '2026-10-17T11:00:00Z',
    primary_item: {
      item_id: 'item-1',
      kind: 'article',
      source: { source_id: 'mint', name: 'Livemint', tier: 1 },
      url: 'https://example.com/1',
      published_at: '2026-10-17T11:00:00Z',
    },
    source_count: 1,
    instruments: [
      {
        isin: 'INE467B01029',
        display_symbol: 'TCS',
        exchange_codes: { nse: 'TCS', bse: '532540' },
        resolution: 'resolved',
        confidence: 1,
      },
    ],
    unresolved_mentions: [],
    event_types: ['order_contract'],
    votes: { important_count: 0 },
    comment_count: 0,
  },
  {
    story_id: 'story-auto-1',
    headline: 'Tata Motors expands EV production capacity',
    first_seen_at: '2026-10-17T10:30:00Z',
    updated_at: '2026-10-17T10:30:00Z',
    primary_item: {
      item_id: 'item-2',
      kind: 'article',
      source: { source_id: 'bse', name: 'BSE Announcements', tier: 1 },
      url: 'https://example.com/2',
      published_at: '2026-10-17T10:30:00Z',
    },
    source_count: 1,
    instruments: [
      {
        isin: 'INE155A01022',
        display_symbol: 'TATAMOTORS',
        exchange_codes: { nse: 'TATAMOTORS', bse: '500570' },
        resolution: 'resolved',
        confidence: 1,
      },
    ],
    unresolved_mentions: [],
    event_types: ['capex'],
    votes: { important_count: 0 },
    comment_count: 0,
  },
];

describe('PulseScreen component', () => {
  it('renders market breadth and offline market badge when session is closed', () => {
    render(
      <PulseScreen
        initialPulse={mockPulse}
        initialStories={mockStories}
        session={{ state: 'closed', exchange_date: '2026-10-17', next_transition_at: '2026-10-19T03:30:00Z' }}
      />
    );

    expect(screen.getByText('Market Pulse')).toBeTruthy();
    expect(screen.getByText('NSE Market Breadth & Participation')).toBeTruthy();
    expect(screen.getByText('OFFLINE (MARKET CLOSED)')).toBeTruthy();

    // Verify breadth metrics
    expect(screen.getAllByText(/1,684/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1,427/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/84/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1\.18\s*:\s*1/).length).toBeGreaterThan(0);

    // Verify refresh text
    expect(screen.getByText(/Data as of:/)).toBeTruthy();
    expect(screen.getByText(/Refresh:/)).toBeTruthy();
  });

  it('renders LIVE TELEMETRY when session is open', () => {
    render(
      <PulseScreen
        initialPulse={mockPulse}
        initialStories={mockStories}
        session={{ state: 'open', exchange_date: '2026-10-19', next_transition_at: '2026-10-19T10:00:00Z' }}
      />
    );

    expect(screen.getByText('LIVE TELEMETRY')).toBeTruthy();
  });

  it('free user clicking sector card opens free member unlock modal', () => {
    render(<PulseScreen initialPulse={mockPulse} initialStories={mockStories} userTier="free" />);

    // Verify refresh text shows 15 min for free user
    expect(screen.getByText(/Every 15 min\./i)).toBeTruthy();

    // Click NIFTY IT sector card
    const itCard = screen.getByRole('button', { name: /NIFTY IT/i });
    fireEvent.click(itCard);

    // Modal appears
    expect(screen.getByText(/Sign in to Filter Sector Intelligence/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Sign in with Google \/ Email — 100% Free →/i })).toBeTruthy();

    // Verify updated copy and all features present
    expect(screen.getByText(/Sector Intelligence:/i)).toBeTruthy();
    expect(screen.getByText(/On-Demand Instant Refresh:/i)).toBeTruthy();
    expect(screen.getByText(/200-Stock Watchlists:/i)).toBeTruthy();
  });

  it('paid user can click sector heatmap cards and filter stories', async () => {
    render(<PulseScreen initialPulse={mockPulse} initialStories={mockStories} userTier="paid" />);

    // Both stories initially shown
    expect(screen.getByText('TCS signs major enterprise deal')).toBeTruthy();
    expect(screen.getByText('Tata Motors expands EV production capacity')).toBeTruthy();

    // Click NIFTY IT sector card
    const itCard = screen.getByRole('button', { name: /NIFTY IT/i });
    fireEvent.click(itCard);

    // Wait for fetch to update stories: only TCS story visible
    await waitFor(() => {
      expect(screen.getByText('TCS signs major enterprise deal')).toBeTruthy();
      expect(screen.queryByText('Tata Motors expands EV production capacity')).toBeNull();
    });

    // Clear filter
    const clearBtn = screen.getByRole('button', { name: /Show All News/i });
    fireEvent.click(clearBtn);

    // Both stories visible again
    await waitFor(() => {
      expect(screen.getByText('TCS signs major enterprise deal')).toBeTruthy();
      expect(screen.getByText('Tata Motors expands EV production capacity')).toBeTruthy();
    });
  });

  it('free user clicking refresh opens free member unlock modal', () => {
    render(<PulseScreen initialPulse={mockPulse} initialStories={mockStories} userTier="free" />);

    const refreshBtn = screen.getByRole('button', { name: /Refresh Now/i });
    fireEvent.click(refreshBtn);

    expect(screen.getByText(/Sign in to Refresh Market Pulse/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Sign in with Google \/ Email — 100% Free →/i })).toBeTruthy();
  });

  it('paid user clicking refresh triggers rate limit and runs cooldown timer', async () => {
    render(<PulseScreen initialPulse={mockPulse} initialStories={mockStories} userTier="paid" />);

    const refreshBtn = screen.getByRole('button', { name: /Refresh Now/i });
    fireEvent.click(refreshBtn);

    // Button updates to countdown timer: Wait 15s...
    await waitFor(() => {
      expect(screen.getByText(/Wait 15s\.\.\./i)).toBeTruthy();
    });
  });

  it('shows warning message when paid user reaches 90 hits for the day', () => {
    render(
      <PulseScreen
        initialPulse={mockPulse}
        initialStories={mockStories}
        userTier="paid"
        initialUsage={{ dailyHits: 92, hitsLeft: 8, maxDaily: 100 }}
      />
    );

    expect(screen.getByText(/Only 8 hits left for the day/i)).toBeTruthy();
  });

  it('renders PCR lock overlay for guest free users', () => {
    render(
      <PulseScreen
        initialPulse={mockPulse}
        initialStories={mockStories}
        userTier="free"
        session={{ state: 'open', exchange_date: '2026-10-19', next_transition_at: '2026-10-19T10:00:00Z' }}
      />
    );

    // Lock overlay is present on PCR card
    const pcrOverlay = screen.getByRole('region', { name: /Member Feature: Put\/Call Ratio/i });
    expect(within(pcrOverlay).getByText(/MEMBER FEATURE/i)).toBeTruthy();
    expect(within(pcrOverlay).getByText(/Put\/Call Ratio \(PCR\) Sentiment/i)).toBeTruthy();
    expect(within(pcrOverlay).getByRole('link', { name: /Sign in to Unlock \(Free\) →/i })).toBeTruthy();
  });

  it('clicking unlock on PCR lock overlay navigates to sign in', () => {
    render(
      <PulseScreen
        initialPulse={mockPulse}
        initialStories={mockStories}
        userTier="free"
      />
    );

    const pcrOverlay = screen.getByRole('region', { name: /Member Feature: Put\/Call Ratio/i });
    const unlockLink = within(pcrOverlay).getByRole('link', { name: /Sign in to Unlock \(Free\) →/i });
    expect(unlockLink.getAttribute('href')).toBe('/sign-in?next=/pulse');
  });

  it('renders F&O Derivatives Sentiment (PCR) card in LIVE state for paid users', () => {
    render(
      <PulseScreen
        initialPulse={mockPulse}
        initialStories={mockStories}
        userTier="paid"
        session={{ state: 'open', exchange_date: '2026-10-19', next_transition_at: '2026-10-19T10:00:00Z' }}
      />
    );

    // Header displays 1 min refresh for PRO
    expect(screen.getByText(/Every 1 min/i)).toBeTruthy();
    expect(screen.getAllByText('PRO').length).toBeGreaterThan(0);

    // Lock overlay should NOT be present
    expect(screen.queryByText(/PRO EXCLUSIVE/i)).toBeNull();

    // PCR card title & live badge
    expect(screen.getByText('F&O Derivatives Sentiment (PCR)')).toBeTruthy();
    expect(screen.getByText(/● LIVE/)).toBeTruthy();

    // Nifty & Bank Nifty PCR values and sentiment
    expect(screen.getByText('NIFTY 50 PCR')).toBeTruthy();
    expect(screen.getByText('BANK NIFTY PCR')).toBeTruthy();
    expect(screen.getAllByText('1.18').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0.84').length).toBeGreaterThan(0);
    expect(screen.getByText(/BULLISH SUPPORT \(PUT WRITING\)/)).toBeTruthy();
    expect(screen.getByText(/NEUTRAL \/ RESISTANCE/)).toBeTruthy();

    // Open Interest stats
    expect(screen.getByText('14.3M')).toBeTruthy();
    expect(screen.getByText('12.1M')).toBeTruthy();
    expect(screen.getByText('+2.2M Puts')).toBeTruthy();
  });

  it('renders PCR card in graceful FALLBACK (PAUSED) state for paid users', () => {
    const pausedPulse: PulseResponse = {
      ...mockPulse,
      pcr: {
        status: 'paused',
        nifty: {
          symbol: 'NIFTY',
          name: 'NIFTY 50',
          pcr: 1.18,
          sentiment: 'bullish',
          sentimentLabel: 'BULLISH SUPPORT (PUT WRITING)',
          putOi: 14_250_000,
          callOi: 12_080_000,
        },
        bankNifty: {
          symbol: 'BANKNIFTY',
          name: 'BANK NIFTY',
          pcr: 0.84,
          sentiment: 'neutral',
          sentimentLabel: 'NEUTRAL / RESISTANCE',
          putOi: 8_120_000,
          callOi: 9_640_000,
        },
        lastConfirmedAt: '14:30 IST',
        notice: 'Exchange feed paused • Background retry in progress (No impact on cash breadth)',
        updatedAt: '2026-10-17T12:00:00.000Z',
      },
    };

    render(
      <PulseScreen
        initialPulse={pausedPulse}
        initialStories={mockStories}
        userTier="paid"
      />
    );

    // Paused badge & retry notice banner
    expect(screen.getByText('PAUSED / OFFLINE')).toBeTruthy();
    expect(screen.getByText(/Exchange feed paused • Background retry in progress/)).toBeTruthy();

    // Last confirmed timestamp
    expect(screen.getAllByText(/LAST CONFIRMED \(14:30 IST\)/).length).toBeGreaterThan(0);

    // Cash breadth remains 100% operational alongside fallback PCR
    expect(screen.getByText('NSE Market Breadth & Participation')).toBeTruthy();
    expect(screen.getAllByText(/1,684/).length).toBeGreaterThan(0);

    // OI figures show graceful placeholders (--)
    expect(screen.getAllByText('--').length).toBeGreaterThanOrEqual(3);
  });

  it('allows clicking the status pill to toggle preview between Live and Paused states', () => {
    render(
      <PulseScreen
        initialPulse={mockPulse}
        initialStories={mockStories}
        userTier="paid"
      />
    );

    // Starts in Live
    const statusBtn = screen.getByRole('button', { name: /PCR status:/i });
    expect(screen.getByText(/● LIVE/)).toBeTruthy();

    // Click to toggle to Paused
    fireEvent.click(statusBtn);
    expect(screen.getByText('PAUSED / OFFLINE')).toBeTruthy();
    expect(screen.getByText(/Exchange feed paused • Background retry in progress/)).toBeTruthy();

    // Click again to toggle back to Live
    fireEvent.click(statusBtn);
    expect(screen.getByText(/● LIVE/)).toBeTruthy();
    expect(screen.queryByText(/Exchange feed paused • Background retry in progress/)).toBeNull();
  });

  it('modal can be closed via the close button', () => {
    render(<PulseScreen initialPulse={mockPulse} initialStories={mockStories} userTier="free" />);

    const itCard = screen.getByRole('button', { name: /NIFTY IT/i });
    fireEvent.click(itCard);

    expect(screen.getByRole('dialog')).toBeTruthy();

    const closeBtn = screen.getByRole('button', { name: /Close/i });
    fireEvent.click(closeBtn);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('modal link points to sign-in with next redirect to pulse', () => {
    render(<PulseScreen initialPulse={mockPulse} initialStories={mockStories} userTier="free" />);

    const itCard = screen.getByRole('button', { name: /NIFTY IT/i });
    fireEvent.click(itCard);

    const link = screen.getByRole('link', { name: /Sign in with Google \/ Email — 100% Free →/i });
    expect(link.getAttribute('href')).toBe('/sign-in?next=/pulse');
  });
});

