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

const SYMBOLS_MAP: Record<string, { name: string; tag?: string; isFutures?: boolean; yahooSymbol?: string }> = {
  'NSEIX:NIFTY1!': { name: 'GIFT NIFTY', tag: 'GIFT', isFutures: true },
  'NSE:NIFTY': { name: 'NIFTY 50' },
  'BSE:SENSEX': { name: 'SENSEX' },
  'NSE:BANKNIFTY': { name: 'BANK NIFTY' },
  'NSE:INDIAVIX': { name: 'INDIA VIX' },
  'MCX:CRUDEOIL1!': { name: 'CRUDE OIL', tag: 'MCX' },
  'MCX:GOLD1!': { name: 'GOLD', tag: 'MCX' },
  'MCX:SILVER1!': { name: 'SILVER', tag: 'MCX' },
  'NSE:CNXIT': { name: 'NIFTY IT', yahooSymbol: '^CNXIT' },
  'NSE:CNXAUTO': { name: 'NIFTY AUTO', yahooSymbol: '^CNXAUTO' },
  'NSE:CNXPHARMA': { name: 'NIFTY PHARMA', yahooSymbol: '^CNXPHARMA' },
  'NSE:CNXFMCG': { name: 'NIFTY FMCG', yahooSymbol: '^CNXFMCG' },
  'NSE:CNXMETAL': { name: 'NIFTY METAL', yahooSymbol: '^CNXMETAL' },
  'NSE:CNXREALTY': { name: 'NIFTY REALTY', yahooSymbol: '^CNXREALTY' },
  'NSE:CNXENERGY': { name: 'NIFTY ENERGY', yahooSymbol: '^CNXENERGY' },
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
  { symbol: 'NSE:CNXIT', name: 'NIFTY IT', price: 31924.10, change: 1204.30, percent: 3.92 },
  { symbol: 'NSE:CNXAUTO', name: 'NIFTY AUTO', price: 25768.50, change: 192.10, percent: 0.75 },
  { symbol: 'NSE:CNXPHARMA', name: 'NIFTY PHARMA', price: 25781.65, change: -36.15, percent: -0.14 },
  { symbol: 'NSE:CNXFMCG', name: 'NIFTY FMCG', price: 44616.15, change: -175.45, percent: -0.39 },
  { symbol: 'NSE:CNXMETAL', name: 'NIFTY METAL', price: 12133.20, change: 114.70, percent: 0.95 },
  { symbol: 'NSE:CNXREALTY', name: 'NIFTY REALTY', price: 825.95, change: -2.75, percent: -0.33 },
  { symbol: 'NSE:CNXENERGY', name: 'NIFTY ENERGY', price: 36190.85, change: -22.85, percent: -0.06 },
];

let cachedTicker: { expiresAt: number; data: TickerResponse } | null = null;
let pendingFetch: Promise<TickerResponse> | null = null;
const lastKnownMap = new Map<string, TickerItem>(FALLBACK_TICKER.map((item) => [item.symbol, item]));

async function fetchFromYahoo(ySymbol: string): Promise<{ price: number; change: number; percent: number } | null> {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=1d&range=1d`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: {
            regularMarketPrice?: number;
            chartPreviousClose?: number;
            fulldayChange?: number;
            regularMarketChangePercent?: number;
          };
        }>;
      };
    };
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta || typeof meta.regularMarketPrice !== 'number') return null;
    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose ?? price;
    const change = meta.fulldayChange ?? (price - prevClose);
    const percent = meta.regularMarketChangePercent ?? (prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0);
    return {
      price: Number(price.toFixed(2)),
      change: Number(change.toFixed(2)),
      percent: Number(percent.toFixed(2)),
    };
  } catch {
    return null;
  }
}

export async function fetchMarketTicker(): Promise<TickerResponse> {
  const now = Date.now();
  if (cachedTicker && cachedTicker.expiresAt > now) {
    return cachedTicker.data;
  }
  if (pendingFetch) return pendingFetch;

  pendingFetch = (async () => {
    try {
      const tickers = Object.keys(SYMBOLS_MAP);
      let dataMap = new Map<string, [number, number, number]>();

      try {
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

        if (res.ok) {
          const json = (await res.json()) as { data?: Array<{ s: string; d: [number, number, number] }> };
          const rawData = json?.data ?? [];
          dataMap = new Map(rawData.map((item) => [item.s, item.d]));
        }
      } catch {
        // TradingView fetch failed or timed out; fallback will be used
      }

      // Query Yahoo Finance for missing symbols (e.g. sectors not indexed on TradingView scanner)
      const missingYahoo = tickers.filter((sym) => {
        const d = dataMap.get(sym);
        return (!d || typeof d[0] !== 'number') && SYMBOLS_MAP[sym]?.yahooSymbol;
      });

      const yahooMap = new Map<string, { price: number; change: number; percent: number }>();
      if (missingYahoo.length > 0) {
        const yahooResults = await Promise.allSettled(
          missingYahoo.map(async (sym) => {
            const ySymbol = SYMBOLS_MAP[sym]!.yahooSymbol!;
            const quote = await fetchFromYahoo(ySymbol);
            return { sym, quote };
          }),
        );
        for (const r of yahooResults) {
          if (r.status === 'fulfilled' && r.value.quote) {
            yahooMap.set(r.value.sym, r.value.quote);
          }
        }
      }

      const indices: TickerItem[] = tickers.map((sym) => {
        const meta = SYMBOLS_MAP[sym]!;
        const tv = dataMap.get(sym);
        if (tv && typeof tv[0] === 'number') {
          const [close, pctChange, absChange] = tv;
          const item: TickerItem = {
            symbol: sym,
            name: meta.name,
            price: Number(close.toFixed(2)),
            change: Number((absChange ?? 0).toFixed(2)),
            percent: Number((pctChange ?? 0).toFixed(2)),
            tag: meta.tag,
            isFutures: meta.isFutures,
          };
          lastKnownMap.set(sym, item);
          return item;
        }

        const yQuote = yahooMap.get(sym);
        if (yQuote) {
          const item: TickerItem = {
            symbol: sym,
            name: meta.name,
            price: yQuote.price,
            change: yQuote.change,
            percent: yQuote.percent,
            tag: meta.tag,
            isFutures: meta.isFutures,
          };
          lastKnownMap.set(sym, item);
          return item;
        }

        const fallback = lastKnownMap.get(sym) ?? FALLBACK_TICKER.find((f) => f.symbol === sym)!;
        return fallback;
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
        indices: Array.from(lastKnownMap.values()),
        updatedAt: new Date().toISOString(),
      };
    } finally {
      pendingFetch = null;
    }
  })();

  return pendingFetch;
}
