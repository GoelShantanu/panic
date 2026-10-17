// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isGiftNiftyActive, MarketTicker } from './MarketTicker.tsx';
import type { TickerResponse } from '../src/market.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mockTicker: TickerResponse = {
  indices: [
    { symbol: 'NSEIX:NIFTY1!', name: 'GIFT NIFTY', price: 23094.5, change: 106.5, percent: 0.46, isFutures: true },
    { symbol: 'NSE:NIFTY', name: 'NIFTY 50', price: 23146.15, change: 148.8, percent: 0.65 },
    { symbol: 'BSE:SENSEX', name: 'SENSEX', price: 74729.27, change: -413.66, percent: -0.56 },
  ],
  updatedAt: '2026-10-17T12:00:00.000Z',
};

describe('isGiftNiftyActive schedule helper', () => {
  it('returns false on Sunday', () => {
    // 2026-10-18 is Sunday
    expect(isGiftNiftyActive(new Date('2026-10-18T06:00:00Z'))).toBe(false);
  });

  it('returns false on Saturday evening', () => {
    // 2026-10-17 is Saturday, 18:00 IST = 12:30 UTC
    expect(isGiftNiftyActive(new Date('2026-10-17T12:30:00Z'))).toBe(false);
  });

  it('returns true on Monday morning 07:00 IST', () => {
    // 2026-10-19 07:00 IST = 01:30 UTC
    expect(isGiftNiftyActive(new Date('2026-10-19T01:30:00Z'))).toBe(true);
  });

  it('returns true on Wednesday evening 20:00 IST', () => {
    // 2026-10-21 20:00 IST = 14:30 UTC
    expect(isGiftNiftyActive(new Date('2026-10-21T14:30:00Z'))).toBe(true);
  });
});

describe('MarketTicker component', () => {
  it('renders OFFLINE when session is closed on weekends', () => {
    render(
      <MarketTicker
        initial={mockTicker}
        session={{ state: 'closed', exchange_date: '2026-10-17', next_transition_at: '2026-10-19T03:30:00Z' }}
      />,
    );

    const header = document.querySelector('.ticker-header');
    expect(header).toBeTruthy();
    expect(header?.getAttribute('data-status')).toBe('offline');
    expect(screen.getByText('OFFLINE')).toBeTruthy();

    // Verify index names & formatted prices
    expect(screen.getByText('GIFT NIFTY')).toBeTruthy();
    expect(screen.getByText('NIFTY 50')).toBeTruthy();
    expect(screen.getByText('SENSEX')).toBeTruthy();
    expect(screen.getByText('GIFT')).toBeTruthy();
  });

  it('renders LIVE when session is open', () => {
    render(
      <MarketTicker
        initial={mockTicker}
        session={{ state: 'open', exchange_date: '2026-10-19', next_transition_at: '2026-10-19T10:00:00Z' }}
      />,
    );

    const header = document.querySelector('.ticker-header');
    expect(header).toBeTruthy();
    expect(header?.getAttribute('data-status')).toBe('live');
    expect(screen.getByText('LIVE')).toBeTruthy();
  });

  it('renders PRE-OPEN when session is in pre_open state', () => {
    render(
      <MarketTicker
        initial={mockTicker}
        session={{ state: 'pre_open', exchange_date: '2026-10-19', next_transition_at: '2026-10-19T03:45:00Z' }}
      />,
    );

    const header = document.querySelector('.ticker-header');
    expect(header).toBeTruthy();
    expect(header?.getAttribute('data-status')).toBe('live');
    expect(screen.getByText('PRE-OPEN')).toBeTruthy();
  });
});
