// Real-time market index & futures quote provider with server-side in-memory caching.
// Fetches benchmark indices (NIFTY 50, SENSEX, BANK NIFTY, INDIA VIX, USD/INR)
// and extended-hours GIFT Nifty continuous futures (NSE IX) in a single request.

export interface TickerItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  percent: number;
  tag?: string | undefined;
  isFutures?: boolean | undefined;
}

export interface TickerResponse {
  indices: TickerItem[];
  updatedAt: string;
}

const CACHE_TTL_MS = 30_000; // 30 seconds server-side cache

const SYMBOLS_MAP: Record<string, { name: string; tag?: string; isFutures?: boolean }> = {
  'NSEIX:NIFTY1!': { name: 'GIFT NIFTY', tag: 'GIFT', isFutures: true },
  'NSE:NIFTY': { name: 'NIFTY 50' },
  'BSE:SENSEX': { name: 'SENSEX' },
  'NSE:BANKNIFTY': { name: 'BANK NIFTY' },
  'NSE:INDIAVIX': { name: 'INDIA VIX' },
  'MCX:CRUDEOIL1!': { name: 'CRUDE OIL', tag: 'MCX' },
  'MCX:GOLD1!': { name: 'GOLD', tag: 'MCX' },
  'MCX:SILVER1!': { name: 'SILVER', tag: 'MCX' },
};

const FALLBACK_TICKER: TickerItem[] = [
  { symbol: 'NSEIX:NIFTY1!', name: 'GIFT NIFTY', price: 23094.50, change: 106.50, percent: 0.46, tag: 'GIFT', isFutures: true },
  { symbol: 'NSE:NIFTY', name: 'NIFTY 50', price: 23146.15, change: 148.80, percent: 0.65 },
  { symbol: 'BSE:SENSEX', name: 'SENSEX', price: 74729.27, change: 413.66, percent: 0.56 },
  { symbol: 'NSE:BANKNIFTY', name: 'BANK NIFTY', price: 55844.00, change: 33.50, percent: 0.06 },
  { symbol: 'NSE:INDIAVIX', name: 'INDIA VIX', price: 14.02, change: 0, percent: 0 },
  { symbol: 'MCX:CRUDEOIL1!', name: 'CRUDE OIL', price: 9573.00, change: 288.00, percent: 3.10, tag: 'MCX' },
  { symbol: 'MCX:GOLD1!', name: 'GOLD', price: 147918.00, change: 429.00, percent: 0.29, tag: 'MCX' },
  { symbol: 'MCX:SILVER1!', name: 'SILVER', price: 211187.00, change: 527.00, percent: 0.25, tag: 'MCX' },
];

let cachedTicker: { expiresAt: number; data: TickerResponse } | null = null;
let pendingFetch: Promise<TickerResponse> | null = null;

export async function fetchMarketTicker(): Promise<TickerResponse> {
  const now = Date.now();
  if (cachedTicker && cachedTicker.expiresAt > now) {
    return cachedTicker.data;
  }
  if (pendingFetch) return pendingFetch;

  pendingFetch = (async () => {
    try {
      const tickers = Object.keys(SYMBOLS_MAP);
      const res = await fetch('https://scanner.tradingview.com/global/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        body: JSON.stringify({
          symbols: { tickers },
          columns: ['close', 'change', 'change_abs'],
        }),
        signal: AbortSignal.timeout(5_000),
      });

      if (!res.ok) throw new Error(`Scanner returned HTTP ${res.status}`);
      const json = (await res.json()) as { data?: Array<{ s: string; d: [number, number, number] }> };
      const rawData = json?.data ?? [];
      const dataMap = new Map(rawData.map((item) => [item.s, item.d]));

      const indices: TickerItem[] = tickers.map((sym) => {
        const d = dataMap.get(sym);
        const meta = SYMBOLS_MAP[sym]!;
        if (!d || typeof d[0] !== 'number') {
          const fallback = FALLBACK_TICKER.find((f) => f.symbol === sym)!;
          return fallback;
        }
        const [close, pctChange, absChange] = d;
        return {
          symbol: sym,
          name: meta.name,
          price: Number(close.toFixed(2)),
          change: Number((absChange ?? 0).toFixed(2)),
          percent: Number((pctChange ?? 0).toFixed(2)),
          tag: meta.tag,
          isFutures: meta.isFutures,
        };
      });

      const result: TickerResponse = {
        indices,
        updatedAt: new Date().toISOString(),
      };
      cachedTicker = { expiresAt: Date.now() + CACHE_TTL_MS, data: result };
      return result;
    } catch {
      if (cachedTicker) return cachedTicker.data;
      return {
        indices: FALLBACK_TICKER,
        updatedAt: new Date().toISOString(),
      };
    } finally {
      pendingFetch = null;
    }
  })();

  return pendingFetch;
}
