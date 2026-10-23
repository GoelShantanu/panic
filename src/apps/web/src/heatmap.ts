// Server-side market intelligence & sector heatmap data provider for Nifty 200.
// Fetches real-time price, percentage change, and market capitalization for top 200 NSE stocks
// in a single batch request, cached in memory for 60 seconds (100% free data).

export interface HeatmapStock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  marketCap: number;
  sector: string;
  rank: number;
  isNifty50: boolean;
  isNifty100: boolean;
  isNifty200: boolean;
}

export interface HeatmapResponse {
  stocks: HeatmapStock[];
  totalMarketCap: number;
  advances: number;
  declines: number;
  unchanged: number;
  updatedAt: string;
}

const CACHE_TTL_MS = 60_000; // 60 seconds server-side in-memory cache

let cachedHeatmap: { expiresAt: number; data: HeatmapResponse } | null = null;
let pendingFetch: Promise<HeatmapResponse> | null = null;

// Static baseline top 200 constituents fallback ensuring 100% uptime even if offline
import { FALLBACK_STOCKS } from './heatmapFallback.ts';

export function computeHeatmapStats(stocks: HeatmapStock[]): Omit<HeatmapResponse, 'stocks'> {
  let totalMarketCap = 0;
  let advances = 0;
  let declines = 0;
  let unchanged = 0;

  for (const s of stocks) {
    totalMarketCap += s.marketCap;
    if (s.change > 0) advances++;
    else if (s.change < 0) declines++;
    else unchanged++;
  }

  return {
    totalMarketCap,
    advances,
    declines,
    unchanged,
    updatedAt: new Date().toISOString(),
  };
}

export const FALLBACK_HEATMAP: HeatmapResponse = {
  stocks: FALLBACK_STOCKS,
  ...computeHeatmapStats(FALLBACK_STOCKS),
};

export async function fetchMarketHeatmap(forceRefresh = false): Promise<HeatmapResponse> {
  const now = Date.now();
  if (!forceRefresh && cachedHeatmap && cachedHeatmap.expiresAt > now) {
    return cachedHeatmap.data;
  }
  if (pendingFetch) return pendingFetch;

  pendingFetch = (async () => {
    try {
      const res = await fetch('https://scanner.tradingview.com/india/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        body: JSON.stringify({
          filter: [
            { left: 'exchange', operation: 'equal', right: 'NSE' },
            { left: 'type', operation: 'equal', right: 'stock' },
          ],
          sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
          range: [0, 200],
          columns: ['name', 'description', 'close', 'change', 'market_cap_basic', 'sector'],
        }),
        signal: AbortSignal.timeout(6_000),
      });

      if (!res.ok) {
        throw new Error(`TradingView scanner returned HTTP ${res.status}`);
      }

      const json = (await res.json()) as {
        data?: Array<{ s: string; d: [string, string, number, number, number, string] }>;
      };

      const rawList = json?.data ?? [];
      if (rawList.length === 0) {
        throw new Error('TradingView scanner returned empty stock list');
      }

      const stocks: HeatmapStock[] = rawList.map((item, idx) => {
        const d = item.d;
        const sym = d[0] || item.s.replace('NSE:', '');
        const name = d[1] || sym;
        const price = typeof d[2] === 'number' ? Number(d[2].toFixed(2)) : 0;
        const change = typeof d[3] === 'number' ? Number(d[3].toFixed(2)) : 0;
        const marketCap = typeof d[4] === 'number' && d[4] > 0 ? d[4] : 1;
        const sector = (d[5] && d[5].trim()) || 'Other';

        return {
          symbol: sym,
          name,
          price,
          change,
          marketCap,
          sector,
          rank: idx + 1,
          isNifty50: idx < 50,
          isNifty100: idx < 100,
          isNifty200: true,
        };
      });

      const stats = computeHeatmapStats(stocks);
      const result: HeatmapResponse = {
        stocks,
        ...stats,
      };

      cachedHeatmap = { expiresAt: Date.now() + CACHE_TTL_MS, data: result };
      return result;
    } catch {
      if (cachedHeatmap) return cachedHeatmap.data;
      return FALLBACK_HEATMAP;
    } finally {
      pendingFetch = null;
    }
  })();

  return pendingFetch;
}
