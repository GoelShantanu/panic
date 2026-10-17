// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isGiftNiftyActive, isMcxActive, MarketTicker } from './MarketTicker.tsx';
import type { TickerResponse } from '../src/market.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mockTicker: TickerResponse = {
  indices: [
    { symbol: 'NSEIX:NIFTY1!', name: 'GIFT NIFTY', price: 23094.5, change: 106.5, percent: 0.46, tag: 'GIFT', isFutures: true },
    { symbol: 'NSE:NIFTY', name: 'NIFTY 50', price: 23146.15, change: 148.8, percent: 0.65 },
    { symbol: 'BSE:SENSEX', name: 'SENSEX', price: 74729.27, change: -413.66, percent: -0.56 },
    { symbol: 'MCX:CRUDEOIL1!', name: 'CRUDE OIL', price: 9573.0, change: 288.0, percent: 3.10, tag: 'MCX' },
    { symbol: 'MCX:GOLD1!', name: 'GOLD', price: 147918.0, change: 429.0, percent: 0.29, tag: 'MCX' },
    { symbol: 'MCX:SILVER1!', name: 'SILVER', price: 211187.0, change: 527.0, percent: 0.25, tag: 'MCX' },
    { symbol: 'NSE:CNXIT', name: 'NIFTY IT', price: 31924.1, change: 1204.3, percent: 3.92 },
    { symbol: 'NSE:CNXAUTO', name: 'NIFTY AUTO', price: 25768.5, change: 192.1, percent: 0.75 },
    { symbol: 'NSE:CNXPHARMA', name: 'NIFTY PHARMA', price: 25781.65, change: -36.15, percent: -0.14 },
    { symbol: 'NSE:CNXFMCG', name: 'NIFTY FMCG', price: 44616.15, change: -175.45, percent: -0.39 },
    { symbol: 'NSE:CNXMETAL', name: 'NIFTY METAL', price: 12133.2, change: 114.7, percent: 0.95 },
    { symbol: 'NSE:CNXREALTY', name: 'NIFTY REALTY', price: 825.95, change: -2.75, percent: -0.33 },
    { symbol: 'NSE:CNXENERGY', name: 'NIFTY ENERGY', price: 36190.85, change: -22.85, percent: -0.06 },
    { symbol: 'NSE:CNXMIDCAP', name: 'NIFTY MIDCAP', price: 59129.75, change: -67.50, percent: -0.11, tag: 'NSE' },
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

describe('isMcxActive schedule helper', () => {
  it('returns false on weekends', () => {
    expect(isMcxActive(new Date('2026-10-17T12:30:00Z'))).toBe(false);
    expect(isMcxActive(new Date('2026-10-18T10:00:00Z'))).toBe(false);
  });

  it('returns true on Monday at 20:00 IST (evening session)', () => {
    // 2026-10-19 20:00 IST = 14:30 UTC
    expect(isMcxActive(new Date('2026-10-19T14:30:00Z'))).toBe(true);
  });

  it('returns false late night after 23:30 IST', () => {
    // 2026-10-19 23:45 IST = 18:15 UTC
    expect(isMcxActive(new Date('2026-10-19T18:15:00Z'))).toBe(false);
  });
});

describe('MarketTicker component', () => {
  it('renders moving infinite marquee with OFFLINE badge on weekends', () => {
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

    // Verify viewport and sequences for marquee animation
    const viewport = document.querySelector('.ticker-viewport');
    expect(viewport).toBeTruthy();
    const sequences = document.querySelectorAll('.ticker-sequence');
    expect(sequences.length).toBe(2);

    // Verify index names & tags across sequences
    expect(screen.getAllByText('GIFT NIFTY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('NIFTY 50').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SENSEX').length).toBeGreaterThan(0);
    expect(screen.getAllByText('GIFT').length).toBeGreaterThan(0);

    // Verify MCX commodities
    expect(screen.getAllByText('CRUDE OIL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('GOLD').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SILVER').length).toBeGreaterThan(0);
    expect(screen.getAllByText('MCX').length).toBeGreaterThan(0);

    // Verify Sectoral indices
    expect(screen.getAllByText('NIFTY IT').length).toBeGreaterThan(0);
    expect(screen.getAllByText('NIFTY AUTO').length).toBeGreaterThan(0);
    expect(screen.getAllByText('NIFTY PHARMA').length).toBeGreaterThan(0);
    expect(screen.getAllByText('NIFTY FMCG').length).toBeGreaterThan(0);
    expect(screen.getAllByText('NIFTY METAL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('NIFTY REALTY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('NIFTY ENERGY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('NIFTY MIDCAP').length).toBeGreaterThan(0);
    expect(screen.getAllByText('NSE').length).toBeGreaterThan(0);

    // Verify USD/INR is NOT rendered
    expect(screen.queryByText('USD/INR')).toBeNull();
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
