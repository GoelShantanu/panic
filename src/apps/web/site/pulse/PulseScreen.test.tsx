// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('free user clicking sector card opens upgrade modal', () => {
    render(<PulseScreen initialPulse={mockPulse} initialStories={mockStories} userTier="free" />);

    // Click NIFTY IT sector card
    const itCard = screen.getByRole('button', { name: /NIFTY IT/i });
    fireEvent.click(itCard);

    // Modal appears
    expect(screen.getByText(/Sector Intelligence is a Paid Feature/i)).toBeTruthy();
    expect(screen.getByText(/Upgrade to Paid \(from ₹149\/mo\)/i)).toBeTruthy();
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

  it('free user clicking refresh opens upgrade modal', () => {
    render(<PulseScreen initialPulse={mockPulse} initialStories={mockStories} userTier="free" />);

    const refreshBtn = screen.getByRole('button', { name: /Refresh Now/i });
    fireEvent.click(refreshBtn);

    expect(screen.getByText(/Manual Telemetry Refresh is a Paid Feature/i)).toBeTruthy();
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
});
