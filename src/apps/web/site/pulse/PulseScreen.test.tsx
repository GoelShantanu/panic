// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PulseScreen } from './PulseScreen.tsx';
import type { PulseResponse } from '../../src/pulse.ts';
import type { StoryCard } from '../types.ts';

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
      source: { source_id: 'et', name: 'Economic Times', tier: 1 },
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
    event_types: ['corporate_action'],
    votes: { important_count: 0 },
    comment_count: 0,
  },
];

describe('PulseScreen component', () => {
  it('renders market breadth metrics and ratio', () => {
    render(<PulseScreen initialPulse={mockPulse} initialStories={mockStories} />);

    expect(screen.getByText('Market Pulse')).toBeTruthy();
    expect(screen.getByText('NSE Market Breadth & Participation')).toBeTruthy();

    // Verify breadth metrics
    expect(screen.getAllByText(/1,684/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1,427/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/84/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1\.18\s*:\s*1/).length).toBeGreaterThan(0);
  });

  it('renders sector heatmap cards and filters stories on click', () => {
    render(<PulseScreen initialPulse={mockPulse} initialStories={mockStories} />);

    // Both stories initially shown
    expect(screen.getByText('TCS signs major enterprise deal')).toBeTruthy();
    expect(screen.getByText('Tata Motors expands EV production capacity')).toBeTruthy();

    // Click NIFTY IT sector card
    const itCard = screen.getByRole('button', { name: /NIFTY IT/i });
    fireEvent.click(itCard);

    // Only TCS story should now be visible
    expect(screen.getByText('TCS signs major enterprise deal')).toBeTruthy();
    expect(screen.queryByText('Tata Motors expands EV production capacity')).toBeNull();

    // Clear filter
    const clearBtn = screen.getByRole('button', { name: /Show All News/i });
    fireEvent.click(clearBtn);

    // Both stories visible again
    expect(screen.getByText('TCS signs major enterprise deal')).toBeTruthy();
    expect(screen.getByText('Tata Motors expands EV production capacity')).toBeTruthy();
  });
});
