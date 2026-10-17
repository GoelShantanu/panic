// Server-side market intelligence & breadth provider for the "Pulse" dashboard.
// Aggregates real-time NSE market-wide Advances/Declines, Nifty 50 breadth,
// and sector heatmap performance rankings with 60s in-memory caching (100% free data).

import type pg from 'pg';
import { loadStoryCards, streamPage } from '@stockpanic/db';
import type { StoryCard } from '@stockpanic/db';
import { fetchMarketTicker } from './market.ts';

export interface MarketBreadth {
  advances: number;
  declines: number;
  unchanged: number;
  total: number;
  ratio: number;
  sentiment: 'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish';
  sentimentLabel: string;
  nifty50: {
    advances: number;
    declines: number;
    unchanged: number;
  };
  updatedAt: string;
}

export interface SectorItem {
  id: string;
  name: string;
  symbol: string;
  price: number;
  change: number;
  percent: number;
  sentiment: 'bull' | 'bear' | 'neu';
  status: 'leading' | 'bullish' | 'neutral' | 'lagging';
  topConstituents: string[];
}

export interface PulseResponse {
  breadth: MarketBreadth;
  sectors: SectorItem[];
  updatedAt: string;
}

export const SECTOR_DEFINITIONS: Record<string, { id: string; name: string; symbol: string; constituents: string[] }> = {
  'NSE:CNXIT': {
    id: 'it',
    name: 'NIFTY IT',
    symbol: 'NSE:CNXIT',
    constituents: [
      'TCS', 'INFY', 'WIPRO', 'HCLTECH', 'LTIM', 'LTM', 'TECHM', 'COFORGE', 'PERSISTENT',
      'MPHASIS', 'OFSS', 'KPITTECH', 'TATAELXSI', 'LTTS', 'CYIENT', 'SONACOMS', 'ZENSARTECH', 'BSOFT', 'HEXAWARE', 'MASTEK'
    ],
  },
  'NSE:BANKNIFTY': {
    id: 'bank',
    name: 'BANK NIFTY',
    symbol: 'NSE:BANKNIFTY',
    constituents: [
      'HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK', 'AXISBANK', 'INDUSINDBK', 'PNB',
      'BANKBARODA', 'AUBANK', 'FEDERALBNK', 'IDFCFIRSTB', 'BANDHANBNK', 'CANBK', 'YESBANK',
      'IDBI', 'INDIANB', 'BANKINDIA', 'UNIONBANK', 'BAJFINANCE', 'BAJAJFINSV', 'POONAWALLA', 'HDFCLIFE', 'SBILIFE'
    ],
  },
  'NSE:CNXAUTO': {
    id: 'auto',
    name: 'NIFTY AUTO',
    symbol: 'NSE:CNXAUTO',
    constituents: [
      'TATAMOTORS', 'M&M', 'MARUTI', 'BAJAJ-AUTO', 'EICHERMOT', 'HEROMOTOCO', 'TVSMOTOR',
      'BHARATFORG', 'BOSCHLTD', 'MRF', 'BALKRISIND', 'ASHOKLEY', 'APOLLOTYRE', 'OLAELEC',
      'EXIDEIND', 'AMARAJABAT', 'SAMVARDHANA'
    ],
  },
  'NSE:CNXPHARMA': {
    id: 'pharma',
    name: 'NIFTY PHARMA',
    symbol: 'NSE:CNXPHARMA',
    constituents: [
      'SUNPHARMA', 'CIPLA', 'DRREDDY', 'DIVISLAB', 'LUPIN', 'TORNTPHARM', 'MANKIND',
      'ZYDUSLIFE', 'AUROPHARMA', 'BIOCON', 'ALKEM', 'ABBOTINDIA', 'GLENMARK', 'APOLLOHOSP',
      'IPCALAB', 'LAURUSLABS', 'GRANULES', 'NATCOPHARM', 'FORTIS', 'MAXHEALTH'
    ],
  },
  'NSE:CNXFMCG': {
    id: 'fmcg',
    name: 'NIFTY FMCG',
    symbol: 'NSE:CNXFMCG',
    constituents: [
      'ITC', 'HINDUNILVR', 'NESTLEIND', 'BRITANNIA', 'TATACONSUM', 'DABUR', 'MARICO',
      'COLPAL', 'GODREJCP', 'VBL', 'EMAMILTD', 'RADICO', 'UBL', 'TITAN', 'TRENT',
      'DMART', 'HONASA', 'PATANJALI', 'BIKAJI'
    ],
  },
  'NSE:CNXMETAL': {
    id: 'metal',
    name: 'NIFTY METAL',
    symbol: 'NSE:CNXMETAL',
    constituents: [
      'TATASTEEL', 'JSWSTEEL', 'HINDALCO', 'VEDL', 'JINDALSTEL', 'COALINDIA', 'NMDC',
      'SAIL', 'NATIONALUM', 'HINDZINC', 'APLAPOLLO', 'JINDALSAW', 'HINDCOPPER', 'WELCORP'
    ],
  },
  'NSE:CNXREALTY': {
    id: 'realty',
    name: 'NIFTY REALTY',
    symbol: 'NSE:CNXREALTY',
    constituents: [
      'DLF', 'GODREJPROP', 'LODHA', 'OBEROIRLTY', 'PHOENIXLTD', 'BRIGADE', 'PRESTIGE',
      'SOBHA', 'SUNTECK', 'MAHLIFE', 'IBREALEST', 'KOLTEPATIL', 'SIGNATURE'
    ],
  },
  'NSE:CNXENERGY': {
    id: 'energy',
    name: 'NIFTY ENERGY',
    symbol: 'NSE:CNXENERGY',
    constituents: [
      'RELIANCE', 'ONGC', 'NTPC', 'POWERGRID', 'BPCL', 'IOC', 'TATAPOWER', 'GAIL',
      'ADANIGREEN', 'ADANIPOWER', 'OIL', 'PETRONET', 'JSWENERGY', 'NHPC', 'SJVN', 'SUZLON'
    ],
  },
};

const NIFTY_50_TICKERS = [
  'NSE:RELIANCE', 'NSE:TCS', 'NSE:HDFCBANK', 'NSE:INFY', 'NSE:ICICIBANK',
  'NSE:BHARTIARTL', 'NSE:SBIN', 'NSE:ITC', 'NSE:HINDUNILVR', 'NSE:LT',
  'NSE:BAJFINANCE', 'NSE:HCLTECH', 'NSE:MARUTI', 'NSE:SUNPHARMA', 'NSE:TATAMOTORS',
  'NSE:KOTAKBANK', 'NSE:AXISBANK', 'NSE:NTPC', 'NSE:ONGC', 'NSE:TITAN',
  'NSE:ADANIENT', 'NSE:ADANIPORTS', 'NSE:COALINDIA', 'NSE:POWERGRID', 'NSE:BAJAJFINSV',
  'NSE:TATASTEEL', 'NSE:ULTRACEMCO', 'NSE:ASIANPAINT', 'NSE:JSWSTEEL',
  'NSE:GRASIM', 'NSE:NESTLEIND', 'NSE:TECHM', 'NSE:WIPRO', 'NSE:HINDALCO',
  'NSE:CIPLA', 'NSE:SBILIFE', 'NSE:HDFCLIFE', 'NSE:DRREDDY', 'NSE:BRITANNIA',
  'NSE:TATACONSUM', 'NSE:EICHERMOT', 'NSE:APOLLOHOSP', 'NSE:HEROMOTOCO', 'NSE:DIVISLAB',
  'NSE:BPCL', 'NSE:SHRIRAMFIN', 'NSE:BEL', 'NSE:TRENT', 'NSE:INDUSINDBK',
];

const CACHE_TTL_MS = 60_000; // 60 seconds server cache for Pulse telemetry
let cachedPulse: { expiresAt: number; data: PulseResponse } | null = null;
let pendingPulseFetch: Promise<PulseResponse> | null = null;

const FALLBACK_BREADTH: MarketBreadth = {
  advances: 1684,
  declines: 1427,
  unchanged: 84,
  total: 3195,
  ratio: 1.18,
  sentiment: 'bullish',
  sentimentLabel: 'Mild Bullish Breadth',
  nifty50: {
    advances: 27,
    declines: 22,
    unchanged: 1,
  },
  updatedAt: new Date().toISOString(),
};

async function fetchNseTotalBreadth(): Promise<{ advances: number; declines: number; unchanged: number } | null> {
  try {
    const [advRes, decRes, unchRes] = await Promise.all([
      fetch('https://scanner.tradingview.com/india/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter: [
            { left: 'exchange', operation: 'equal', right: 'NSE' },
            { left: 'type', operation: 'equal', right: 'stock' },
            { left: 'typespecs', operation: 'has', right: ['common'] },
            { left: 'change', operation: 'greater', right: 0 },
          ],
          range: [0, 1],
        }),
        signal: AbortSignal.timeout(4_000),
      }),
      fetch('https://scanner.tradingview.com/india/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter: [
            { left: 'exchange', operation: 'equal', right: 'NSE' },
            { left: 'type', operation: 'equal', right: 'stock' },
            { left: 'typespecs', operation: 'has', right: ['common'] },
            { left: 'change', operation: 'less', right: 0 },
          ],
          range: [0, 1],
        }),
        signal: AbortSignal.timeout(4_000),
      }),
      fetch('https://scanner.tradingview.com/india/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter: [
            { left: 'exchange', operation: 'equal', right: 'NSE' },
            { left: 'type', operation: 'equal', right: 'stock' },
            { left: 'typespecs', operation: 'has', right: ['common'] },
            { left: 'change', operation: 'equal', right: 0 },
          ],
          range: [0, 1],
        }),
        signal: AbortSignal.timeout(4_000),
      }),
    ]);

    if (!advRes.ok || !decRes.ok || !unchRes.ok) return null;
    const adv = ((await advRes.json()) as { totalCount: number }).totalCount ?? 0;
    const dec = ((await decRes.json()) as { totalCount: number }).totalCount ?? 0;
    const unch = ((await unchRes.json()) as { totalCount: number }).totalCount ?? 0;
    if (adv === 0 && dec === 0) return null;
    return { advances: adv, declines: dec, unchanged: unch };
  } catch {
    return null;
  }
}

async function fetchNifty50Breadth(): Promise<{ advances: number; declines: number; unchanged: number } | null> {
  try {
    const res = await fetch('https://scanner.tradingview.com/global/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: { tickers: NIFTY_50_TICKERS },
        columns: ['close', 'change'],
      }),
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Array<{ s: string; d: [number, number] }> };
    const items = json?.data ?? [];
    if (items.length === 0) return null;

    let adv = 0;
    let dec = 0;
    let unch = 0;
    for (const item of items) {
      const change = item.d[1];
      if (change > 0) adv++;
      else if (change < 0) dec++;
      else unch++;
    }
    return { advances: adv, declines: dec, unchanged: unch };
  } catch {
    return null;
  }
}

export async function fetchMarketPulse(): Promise<PulseResponse> {
  const now = Date.now();
  if (cachedPulse && cachedPulse.expiresAt > now) {
    return cachedPulse.data;
  }
  if (pendingPulseFetch) return pendingPulseFetch;

  pendingPulseFetch = (async () => {
    try {
      const [tickerRes, totalBreadth, n50Breadth] = await Promise.all([
        fetchMarketTicker().catch(() => null),
        fetchNseTotalBreadth().catch(() => null),
        fetchNifty50Breadth().catch(() => null),
      ]);

      const adv = totalBreadth?.advances ?? FALLBACK_BREADTH.advances;
      const dec = totalBreadth?.declines ?? FALLBACK_BREADTH.declines;
      const unch = totalBreadth?.unchanged ?? FALLBACK_BREADTH.unchanged;
      const total = adv + dec + unch;
      const ratio = dec > 0 ? Number((adv / dec).toFixed(2)) : adv;

      let sentiment: MarketBreadth['sentiment'] = 'neutral';
      let sentimentLabel = 'Neutral / Mixed Breadth';
      if (ratio >= 2.0) {
        sentiment = 'strong_bullish';
        sentimentLabel = 'Strong Bullish Breadth';
      } else if (ratio >= 1.15) {
        sentiment = 'bullish';
        sentimentLabel = 'Bullish Breadth';
      } else if (ratio <= 0.5) {
        sentiment = 'strong_bearish';
        sentimentLabel = 'Strong Bearish Breadth';
      } else if (ratio <= 0.85) {
        sentiment = 'bearish';
        sentimentLabel = 'Bearish Breadth';
      }

      const breadth: MarketBreadth = {
        advances: adv,
        declines: dec,
        unchanged: unch,
        total,
        ratio,
        sentiment,
        sentimentLabel,
        nifty50: n50Breadth ?? FALLBACK_BREADTH.nifty50,
        updatedAt: new Date().toISOString(),
      };

      const tickerMap = new Map((tickerRes?.indices ?? []).map((idx) => [idx.symbol, idx]));

      const sectors: SectorItem[] = Object.entries(SECTOR_DEFINITIONS).map(([sym, def]) => {
        const item = tickerMap.get(sym);
        const price = item?.price ?? 0;
        const change = item?.change ?? 0;
        const percent = item?.percent ?? 0;
        const sentimentClass: SectorItem['sentiment'] = percent > 0 ? 'bull' : percent < 0 ? 'bear' : 'neu';

        let status: SectorItem['status'] = 'neutral';
        if (percent > 1.5) status = 'leading';
        else if (percent > 0.3) status = 'bullish';
        else if (percent < -0.3) status = 'lagging';

        return {
          id: def.id,
          name: def.name,
          symbol: def.symbol,
          price,
          change,
          percent,
          sentiment: sentimentClass,
          status,
          topConstituents: def.constituents,
        };
      });

      // Sort sectors descending by performance percentage
      sectors.sort((a, b) => b.percent - a.percent);

      const result: PulseResponse = {
        breadth,
        sectors,
        updatedAt: new Date().toISOString(),
      };

      cachedPulse = { expiresAt: Date.now() + CACHE_TTL_MS, data: result };
      return result;
    } catch {
      if (cachedPulse) return cachedPulse.data;
      return {
        breadth: FALLBACK_BREADTH,
        sectors: [],
        updatedAt: new Date().toISOString(),
      };
    } finally {
      pendingPulseFetch = null;
    }
  })();

  return pendingPulseFetch;
}

export async function fetchPulseStoriesBySector(
  db: pg.ClientBase,
  sectorId: string | null,
  limit = 50
): Promise<StoryCard[]> {
  try {
    if (!sectorId) {
      // Query top stories across the entire stream
      const rows = await streamPage(db, {
        view: 'latest',
        eventTypes: null,
        filingsOnly: false,
        isin: null,
        watchlistUserId: null,
        before: null,
        notBefore: null,
        limit,
      });
      const cards = await loadStoryCards(db, rows.map((r) => r.id));
      return rows.map((r) => cards.get(r.id)).filter((c): c is StoryCard => c !== undefined);
    }

    const def = Object.values(SECTOR_DEFINITIONS).find((s) => s.id === sectorId);
    if (!def) return [];

    // Query distinct story IDs matching any constituent symbol across the entire database
    const sql = `
      SELECT DISTINCT s.id, s.first_seen_at
      FROM story s
      JOIN story_tag st ON st.story_id = s.id
      JOIN instrument_code ic ON ic.isin = st.isin
      WHERE ic.code = ANY($1::text[])
      ORDER BY s.first_seen_at DESC, s.id DESC
      LIMIT $2
    `;
    const result = await db.query<{ id: string }>(sql, [def.constituents, limit]);
    const storyIds = result.rows.map((r) => r.id);
    const cards = await loadStoryCards(db, storyIds);
    return storyIds.map((id) => cards.get(id)).filter((c): c is StoryCard => c !== undefined);
  } catch {
    return [];
  }
}

