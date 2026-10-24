import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeHeatmapStats,
  fetchMarketHeatmap,
  FALLBACK_HEATMAP,
} from './heatmap.ts';
import type { HeatmapStock } from './heatmap.ts';
import { isOfficialNifty50, isOfficialNifty100 } from './niftyConstituents.ts';

describe('Nifty 200 Heatmap Module (heatmap.ts)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockStocks: HeatmapStock[] = [
    {
      symbol: 'RELIANCE',
      name: 'Reliance Industries Limited',
      price: 1190.8,
      change: 0.53,
      marketCap: 15000000000000,
      sector: 'Energy Minerals',
      rank: 1,
      isNifty50: true,
      isNifty100: true,
      isNifty200: true,
    },
    {
      symbol: 'HDFCBANK',
      name: 'HDFC Bank Limited',
      price: 694.55,
      change: -1.2,
      marketCap: 10000000000000,
      sector: 'Finance',
      rank: 2,
      isNifty50: true,
      isNifty100: true,
      isNifty200: true,
    },
    {
      symbol: 'ITC',
      name: 'ITC Limited',
      price: 430.0,
      change: 0.0,
      marketCap: 5000000000000,
      sector: 'Consumer Non-Durables',
      rank: 3,
      isNifty50: true,
      isNifty100: true,
      isNifty200: true,
    },
  ];

  it('computes accurate advances, declines, unchanged and total market cap', () => {
    const stats = computeHeatmapStats(mockStocks);
    expect(stats.advances).toBe(1);
    expect(stats.declines).toBe(1);
    expect(stats.unchanged).toBe(1);
    expect(stats.totalMarketCap).toBe(30000000000000);
    expect(stats.updatedAt).toBeTruthy();
  });

  it('provides a valid fallback containing 200 stocks', () => {
    expect(FALLBACK_HEATMAP.stocks.length).toBe(200);
    expect(FALLBACK_HEATMAP.stocks[0]?.symbol).toBeTruthy();
    expect(FALLBACK_HEATMAP.totalMarketCap).toBeGreaterThan(0);
    expect(FALLBACK_HEATMAP.advances + FALLBACK_HEATMAP.declines + FALLBACK_HEATMAP.unchanged).toBe(200);
  });

  it('falls back gracefully to fallback data when external fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));
    const result = await fetchMarketHeatmap(true);
    expect(result.stocks.length).toBeGreaterThan(0);
    expect(result.totalMarketCap).toBeGreaterThan(0);
  });

  it('correctly maps raw scanner response into HeatmapStock objects', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { s: 'NSE:TCS', d: ['TCS', 'Tata Consultancy Services', 2570.6, 2.54, 9000000000000, 'Technology Services'] },
          { s: 'NSE:INFY', d: ['INFY', 'Infosys Limited', 1450.0, -0.85, 4500000000000, 'Technology Services'] },
        ],
      }),
    } as unknown as Response);

    const result = await fetchMarketHeatmap(true);
    expect(result.stocks.length).toBe(2);
    expect(result.stocks[0]?.symbol).toBe('TCS');
    expect(result.stocks[0]?.sector).toBe('Technology Services');
    expect(result.stocks[0]?.isNifty50).toBe(true);
    expect(result.stocks[0]?.isNifty100).toBe(true);
    expect(result.stocks[0]?.isNifty200).toBe(true);
    expect(result.advances).toBe(1);
    expect(result.declines).toBe(1);
  });

  it('correctly maps official Nifty 50 and Nifty 100 constituents according to NSE methodology', () => {
    expect(isOfficialNifty50('RELIANCE')).toBe(true);
    expect(isOfficialNifty50('TCS')).toBe(true);
    expect(isOfficialNifty50('HDFCBANK')).toBe(true);
    expect(isOfficialNifty50('TRENT')).toBe(true);

    // TATAPOWER and LICI are in Nifty 100 (Next 50), but NOT in Nifty 50
    expect(isOfficialNifty50('TATAPOWER')).toBe(false);
    expect(isOfficialNifty100('TATAPOWER')).toBe(true);
    expect(isOfficialNifty50('LICI')).toBe(false);
    expect(isOfficialNifty100('LICI')).toBe(true);

    // Unknown or smallcap symbols are in neither
    expect(isOfficialNifty50('RANDOMCO')).toBe(false);
    expect(isOfficialNifty100('RANDOMCO')).toBe(false);
  });
});
