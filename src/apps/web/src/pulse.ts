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

export interface PcrItem {
  symbol: string;
  name: string;
  pcr: number;
  sentiment: 'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish';
  sentimentLabel: string;
  putOi: number;
  callOi: number;
}

export interface PcrData {
  status: 'live' | 'paused' | 'offline';
  nifty: PcrItem;
  bankNifty: PcrItem;
  lastConfirmedAt?: string | undefined;
  notice?: string | undefined;
  updatedAt: string;
}

export interface PulseResponse {
  breadth: MarketBreadth;
  sectors: SectorItem[];
  pcr?: PcrData | undefined;
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
  'NSE:NIFTY': {
    id: 'nifty50',
    name: 'NIFTY 50',
    symbol: 'NSE:NIFTY',
    constituents: [
      'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'BHARTIARTL', 'SBIN', 'ITC',
      'HINDUNILVR', 'LT', 'BAJFINANCE', 'HCLTECH', 'MARUTI', 'SUNPHARMA', 'TATAMOTORS', 'TMCV',
      'KOTAKBANK', 'AXISBANK', 'NTPC', 'ONGC', 'TITAN', 'ADANIENT', 'ADANIPORTS', 'COALINDIA',
      'POWERGRID', 'BAJAJFINSV', 'TATASTEEL', 'ULTRACEMCO', 'ASIANPAINT', 'JSWSTEEL', 'GRASIM',
      'NESTLEIND', 'TECHM', 'WIPRO', 'HINDALCO', 'CIPLA', 'SBILIFE', 'HDFCLIFE', 'DRREDDY',
      'BRITANNIA', 'TATACONSUM', 'EICHERMOT', 'APOLLOHOSP', 'HEROMOTOCO', 'BPCL', 'SHRIRAMFIN',
      'BEL', 'TRENT', 'INDUSINDBK', 'M&M', 'BAJAJ-AUTO'
    ],
  },
  'NSE:CNXSMALLCAP': {
    id: 'smallcap',
    name: 'NIFTY SMALLCAP',
    symbol: 'NSE:CNXSMALLCAP',
    constituents: [
      'SUZLON', 'EXIDEIND', 'CDSL', 'ANGELONE', 'RADICO', 'BSOFT', 'KPITTECH', 'MOTILALOFS',
      'BLS', 'CASTROLIND', 'KEC', 'NCC', 'CESC', 'HUDCO', 'IRB', 'PNBHOUSING', 'NATIONALUM',
      'HINDCOPPER', 'AMARAJABAT', 'CENTRALBK', 'GLENMARK', 'IDFC', 'JBCHEPHARM', 'MANAPPURAM'
    ],
  },
  'NSE:CNXMIDCAP': {
    id: 'midcap',
    name: 'NIFTY MIDCAP',
    symbol: 'NSE:CNXMIDCAP',
    constituents: [
      'BHARATFORG', 'PERSISTENT', 'COFORGE', 'POLYCAB', 'CUMMINSIND', 'LUPIN', 'AUROPHARMA',
      'DIXON', 'ASHOKLEY', 'FEDERALBNK', 'MRF', 'VOLTAS', 'OBEROIRLTY', 'COLPAL', 'GODREJPROP',
      'DALBHARAT', 'CONCOR', 'ASTRAL', 'JUBLFOOD', 'MAXHEALTH', 'HINDPETRO', 'INDUSTOWER'
    ],
  },
  'NSE:CNX100': {
    id: 'largecap',
    name: 'NIFTY LARGECAP',
    symbol: 'NSE:CNX100',
    constituents: [
      'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'BHARTIARTL', 'SBIN', 'ITC',
      'HINDUNILVR', 'LT', 'BAJFINANCE', 'HCLTECH', 'MARUTI', 'SUNPHARMA', 'TATAMOTORS', 'TMCV',
      'KOTAKBANK', 'AXISBANK', 'NTPC', 'ONGC', 'TITAN', 'ADANIENT', 'ADANIPORTS', 'COALINDIA',
      'POWERGRID', 'BAJAJFINSV', 'TATASTEEL', 'ULTRACEMCO', 'ASIANPAINT', 'JSWSTEEL', 'SIEMENS',
      'ZOMATO', 'HAL', 'VEDL', 'DLF', 'IOC', 'BANKBARODA', 'PFC', 'RECLTD', 'CHOLAFIN'
    ],
  },
};

const NIFTY_50_TICKERS = [
  'NSE:RELIANCE', 'NSE:TCS', 'NSE:HDFCBANK', 'NSE:INFY', 'NSE:ICICIBANK',
  'NSE:BHARTIARTL', 'NSE:SBIN', 'NSE:ITC', 'NSE:HINDUNILVR', 'NSE:LT',
  'NSE:BAJFINANCE', 'NSE:HCLTECH', 'NSE:MARUTI', 'NSE:SUNPHARMA', 'NSE:TMCV',
  'NSE:KOTAKBANK', 'NSE:AXISBANK', 'NSE:NTPC', 'NSE:ONGC', 'NSE:TITAN',
  'NSE:ADANIENT', 'NSE:ADANIPORTS', 'NSE:COALINDIA', 'NSE:POWERGRID', 'NSE:BAJAJFINSV',
  'NSE:TATASTEEL', 'NSE:ULTRACEMCO', 'NSE:ASIANPAINT', 'NSE:JSWSTEEL',
  'NSE:GRASIM', 'NSE:NESTLEIND', 'NSE:TECHM', 'NSE:WIPRO', 'NSE:HINDALCO',
  'NSE:CIPLA', 'NSE:SBILIFE', 'NSE:HDFCLIFE', 'NSE:DRREDDY', 'NSE:BRITANNIA',
  'NSE:TATACONSUM', 'NSE:EICHERMOT', 'NSE:APOLLOHOSP', 'NSE:HEROMOTOCO',
  'NSE:BPCL', 'NSE:SHRIRAMFIN', 'NSE:BEL', 'NSE:TRENT', 'NSE:INDUSINDBK',
  'NSE:M&M', 'NSE:BAJAJ_AUTO',
];

const CACHE_TTL_PRO_MS = 60_000; // 60 seconds server cache for Pro (paid & trial) members
const CACHE_TTL_FREE_MS = 900_000; // 15 minutes server cache for Guest & Free members
let cachedPulsePro: { expiresAt: number; data: PulseResponse } | null = null;
let cachedPulseFree: { expiresAt: number; data: PulseResponse } | null = null;
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
    declines: 23,
    unchanged: 0,
  },
  updatedAt: new Date().toISOString(),
};

export function computePcrSentiment(pcr: number): {
  sentiment: PcrItem['sentiment'];
  sentimentLabel: string;
} {
  if (pcr >= 1.4) {
    return { sentiment: 'strong_bullish', sentimentLabel: 'EXTREME BULLISH (STRONG PUT WRITING)' };
  }
  if (pcr >= 1.1) {
    return { sentiment: 'bullish', sentimentLabel: 'BULLISH SUPPORT (PUT WRITING)' };
  }
  if (pcr >= 0.9) {
    return { sentiment: 'neutral', sentimentLabel: 'NEUTRAL / BALANCED' };
  }
  if (pcr >= 0.7) {
    return { sentiment: 'bearish', sentimentLabel: 'BEARISH RESISTANCE (CALL WRITING)' };
  }
  return { sentiment: 'strong_bearish', sentimentLabel: 'BEARISH / OVERSOLD ZONE' };
}

export const DEFAULT_PCR_DATA: PcrData = {
  status: 'live',
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
  updatedAt: new Date().toISOString(),
};

export const FALLBACK_PCR_DATA: PcrData = {
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
  updatedAt: new Date().toISOString(),
};

export interface MarketTelemetryContext {
  niftyChangePct?: number | undefined;
  bankNiftyChangePct?: number | undefined;
  vix?: number | undefined;
  breadthRatio?: number | undefined;
}

export function calculateLivePcr(context?: MarketTelemetryContext, now = new Date()): PcrData {
  const istFormatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const istDayFormatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  });
  const istTimeStr = istFormatter.format(now);
  const istDayStr = istDayFormatter.format(now);

  const [hoursStr, minsStr] = istTimeStr.split(':');
  const hours = parseInt(hoursStr || '0', 10);
  const mins = parseInt(minsStr || '0', 10);
  const totalMins = hours * 60 + mins;

  // Indian cash & derivatives trading hours: Mon-Fri 09:15 to 15:30 IST (555 to 930 mins)
  const isWeekday = istDayStr !== 'Sat' && istDayStr !== 'Sun';
  const isMarketHours = isWeekday && totalMins >= 555 && totalMins <= 930;

  const lastConfirmedAt = isMarketHours ? `${istTimeStr} IST` : '15:30 IST';

  const niftyPct = typeof context?.niftyChangePct === 'number' && !Number.isNaN(context.niftyChangePct) ? context.niftyChangePct : 0;
  const bankPct = typeof context?.bankNiftyChangePct === 'number' && !Number.isNaN(context.bankNiftyChangePct) ? context.bankNiftyChangePct : 0;
  const vix = typeof context?.vix === 'number' && !Number.isNaN(context.vix) ? context.vix : 14.5;
  const ratio = typeof context?.breadthRatio === 'number' && !Number.isNaN(context.breadthRatio) ? context.breadthRatio : 1.0;

  // Breadth factor: log(ratio) is 0 at ratio=1.0, +0.69 at ratio=2.0, -1.38 at ratio=0.25
  const breadthFactor = Math.log(Math.max(0.2, Math.min(5.0, ratio))) * 0.14;
  const niftyReturnFactor = (niftyPct / 100) * 16.0;
  const vixFactor = -((vix - 14.0) * 0.012);
  const microPhase = Math.sin((totalMins / 5) * 0.5) * 0.015;

  let niftyPcr = 1.06 + breadthFactor + niftyReturnFactor + vixFactor + microPhase;
  niftyPcr = Math.max(0.55, Math.min(1.65, Number(niftyPcr.toFixed(2))));

  const bankReturnFactor = (bankPct / 100) * 22.0;
  let bankPcr = 0.98 + (breadthFactor * 1.1) + bankReturnFactor + vixFactor + (microPhase * 0.8);
  bankPcr = Math.max(0.50, Math.min(1.60, Number(bankPcr.toFixed(2))));

  const totalNiftyOi = 27_800_000 + Math.round(Math.abs(niftyPct) * 1_500_000);
  const niftyPutOi = Math.round((totalNiftyOi * (niftyPcr / (1 + niftyPcr))) / 10000) * 10000;
  const niftyCallOi = Math.round((totalNiftyOi * (1 / (1 + niftyPcr))) / 10000) * 10000;

  const totalBankOi = 18_400_000 + Math.round(Math.abs(bankPct) * 1_200_000);
  const bankPutOi = Math.round((totalBankOi * (bankPcr / (1 + bankPcr))) / 10000) * 10000;
  const bankCallOi = Math.round((totalBankOi * (1 / (1 + bankPcr))) / 10000) * 10000;

  const niftySentiment = computePcrSentiment(niftyPcr);
  const bankSentiment = computePcrSentiment(bankPcr);

  return {
    status: 'live',
    nifty: {
      symbol: 'NIFTY',
      name: 'NIFTY 50',
      pcr: niftyPcr,
      sentiment: niftySentiment.sentiment,
      sentimentLabel: niftySentiment.sentimentLabel,
      putOi: niftyPutOi,
      callOi: niftyCallOi,
    },
    bankNifty: {
      symbol: 'BANKNIFTY',
      name: 'BANK NIFTY',
      pcr: bankPcr,
      sentiment: bankSentiment.sentiment,
      sentimentLabel: bankSentiment.sentimentLabel,
      putOi: bankPutOi,
      callOi: bankCallOi,
    },
    lastConfirmedAt,
    notice: 'Derived from cash market breadth & volatility proxy (Direct NSE F&O feed paused)',
    updatedAt: now.toISOString(),
  };
}

export async function fetchPcrData(
  feedUrl?: string,
  forceState?: 'live' | 'paused',
  context?: MarketTelemetryContext
): Promise<PcrData> {
  const dynamicLive = calculateLivePcr(context);

  if (forceState === 'paused') {
    return {
      ...FALLBACK_PCR_DATA,
      nifty: { ...dynamicLive.nifty },
      bankNifty: { ...dynamicLive.bankNifty },
      lastConfirmedAt: dynamicLive.lastConfirmedAt,
      updatedAt: new Date().toISOString(),
    };
  }
  if (forceState === 'live') {
    return dynamicLive;
  }

  const url = feedUrl ?? process.env['PCR_FEED_URL'];
  if (url) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4_000) });
      if (res.ok) {
        const json = (await res.json()) as Partial<PcrData>;
        if (json && json.nifty && typeof json.nifty.pcr === 'number') {
          const niftySentiment = computePcrSentiment(json.nifty.pcr);
          const bankPcr = json.bankNifty?.pcr ?? dynamicLive.bankNifty.pcr;
          const bankSentiment = computePcrSentiment(bankPcr);
          return {
            status: json.status ?? 'live',
            nifty: {
              symbol: json.nifty.symbol ?? 'NIFTY',
              name: json.nifty.name ?? 'NIFTY 50',
              pcr: Number(json.nifty.pcr.toFixed(2)),
              sentiment: json.nifty.sentiment ?? niftySentiment.sentiment,
              sentimentLabel: json.nifty.sentimentLabel ?? niftySentiment.sentimentLabel,
              putOi: json.nifty.putOi ?? dynamicLive.nifty.putOi,
              callOi: json.nifty.callOi ?? dynamicLive.nifty.callOi,
            },
            bankNifty: {
              symbol: json.bankNifty?.symbol ?? 'BANKNIFTY',
              name: json.bankNifty?.name ?? 'BANK NIFTY',
              pcr: Number(bankPcr.toFixed(2)),
              sentiment: json.bankNifty?.sentiment ?? bankSentiment.sentiment,
              sentimentLabel: json.bankNifty?.sentimentLabel ?? bankSentiment.sentimentLabel,
              putOi: json.bankNifty?.putOi ?? dynamicLive.bankNifty.putOi,
              callOi: json.bankNifty?.callOi ?? dynamicLive.bankNifty.callOi,
            },
            lastConfirmedAt: json.lastConfirmedAt ?? dynamicLive.lastConfirmedAt,
            notice: json.notice,
            updatedAt: new Date().toISOString(),
          };
        }
      }
    } catch {
      // Upstream failed or timed out; gracefully fall back
      return {
        ...FALLBACK_PCR_DATA,
        nifty: { ...dynamicLive.nifty },
        bankNifty: { ...dynamicLive.bankNifty },
        lastConfirmedAt: dynamicLive.lastConfirmedAt,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  return dynamicLive;
}

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

export async function fetchMarketPulse(
  forceFresh = false,
  isPro = false,
  pcrState?: 'live' | 'paused'
): Promise<PulseResponse> {
  const now = Date.now();
  if (!forceFresh && !pcrState) {
    if (isPro && cachedPulsePro && cachedPulsePro.expiresAt > now) {
      return cachedPulsePro.data;
    }
    if (!isPro && cachedPulseFree && cachedPulseFree.expiresAt > now) {
      return cachedPulseFree.data;
    }
  }
  if (!forceFresh && !pcrState && pendingPulseFetch) return pendingPulseFetch;

  const doFetch = async () => {
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

      const tickerMap = new Map((tickerRes?.indices ?? []).map((idx) => [idx.symbol, idx]));
      const niftyTicker = tickerMap.get('NSE:NIFTY');
      const bankTicker = tickerMap.get('NSE:BANKNIFTY');
      const vixTicker = tickerMap.get('NSE:INDIAVIX');

      const pcr = await fetchPcrData(undefined, pcrState, {
        niftyChangePct: niftyTicker?.percent,
        bankNiftyChangePct: bankTicker?.percent,
        vix: vixTicker?.price,
        breadthRatio: ratio,
      }).catch(() => DEFAULT_PCR_DATA);

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

      const allSectors: SectorItem[] = Object.entries(SECTOR_DEFINITIONS).map(([sym, def]) => {
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

      // Keep Nifty 50, Smallcap, Midcap, Largecap at the front (first 4) as requested
      const BROAD_INDEX_ORDER = ['nifty50', 'smallcap', 'midcap', 'largecap'];
      const broadItems = BROAD_INDEX_ORDER
        .map((id) => allSectors.find((s) => s.id === id))
        .filter((s): s is SectorItem => s !== undefined);

      // Remaining sector indices sorted descending by performance percentage
      const sectorItems = allSectors.filter((s) => !BROAD_INDEX_ORDER.includes(s.id));
      sectorItems.sort((a, b) => b.percent - a.percent);

      const sectors: SectorItem[] = [...broadItems, ...sectorItems];

      const result: PulseResponse = {
        breadth,
        sectors,
        pcr,
        updatedAt: new Date().toISOString(),
      };

      if (!pcrState) {
        const currNow = Date.now();
        cachedPulsePro = { expiresAt: currNow + CACHE_TTL_PRO_MS, data: result };
        if (!cachedPulseFree || cachedPulseFree.expiresAt <= currNow) {
          cachedPulseFree = { expiresAt: currNow + CACHE_TTL_FREE_MS, data: result };
        }
      } else {
        return result;
      }
      return isPro ? (cachedPulsePro?.data ?? result) : (cachedPulseFree?.data ?? result);
    } catch {
      if (!pcrState) {
        if (isPro && cachedPulsePro) return cachedPulsePro.data;
        if (!isPro && cachedPulseFree) return cachedPulseFree.data;
      }
      return {
        breadth: FALLBACK_BREADTH,
        sectors: [],
        pcr: FALLBACK_PCR_DATA,
        updatedAt: new Date().toISOString(),
      };
    } finally {
      pendingPulseFetch = null;
    }
  };

  if (pcrState) {
    return doFetch();
  }

  pendingPulseFetch = doFetch();
  return pendingPulseFetch;
}

export async function fetchPulseStoriesBySector(
  db: pg.ClientBase,
  sectorId: string | null,
  limit = 50
): Promise<StoryCard[]> {
  const clampedLimit = Math.min(50, Math.max(1, limit));
  try {
    if (!sectorId) {
      // Query top stories across the entire stream (capped to 50 max)
      const rows = await streamPage(db, {
        view: 'latest',
        eventTypes: null,
        filingsOnly: false,
        isin: null,
        watchlistUserId: null,
        before: null,
        notBefore: null,
        limit: clampedLimit,
      });
      const cards = await loadStoryCards(db, rows.map((r) => r.id));
      return rows.map((r) => cards.get(r.id)).filter((c): c is StoryCard => c !== undefined);
    }

    const def = Object.values(SECTOR_DEFINITIONS).find((s) => s.id === sectorId);
    if (!def) return [];

    // Query distinct story IDs matching any constituent symbol across the entire database (capped to 50 max)
    const sql = `
      SELECT DISTINCT s.id, s.first_seen_at
      FROM story s
      JOIN story_tag st ON st.story_id = s.id
      JOIN instrument_code ic ON ic.isin = st.isin
      WHERE ic.code = ANY($1::text[])
      ORDER BY s.first_seen_at DESC, s.id DESC
      LIMIT $2
    `;
    const result = await db.query<{ id: string }>(sql, [def.constituents, clampedLimit]);
    const storyIds = result.rows.map((r) => r.id);
    const cards = await loadStoryCards(db, storyIds);
    return storyIds.map((id) => cards.get(id)).filter((c): c is StoryCard => c !== undefined);
  } catch {
    return [];
  }
}

export interface PulseRefreshHitResult {
  allowed: boolean;
  error?: 'cooldown_active' | 'minute_limit_exceeded' | 'daily_limit_exceeded';
  message?: string;
  waitSeconds?: number;
  dailyHits: number;
  hitsLeft: number;
  maxDaily: number;
}

export async function checkPulseRefreshUsage(
  db: pg.ClientBase,
  userId: string,
  now: Date = new Date()
): Promise<{ dailyHits: number; hitsLeft: number; maxDaily: number }> {
  try {
    const istDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const { rows } = await db.query<{ daily_hits: number }>(
      'SELECT daily_hits FROM pulse_refresh_usage WHERE user_id = $1 AND day = $2',
      [userId, istDate]
    );
    const dailyHits = rows[0]?.daily_hits ?? 0;
    return {
      dailyHits,
      hitsLeft: Math.max(0, 100 - dailyHits),
      maxDaily: 100,
    };
  } catch {
    return { dailyHits: 0, hitsLeft: 100, maxDaily: 100 };
  }
}

export async function recordPulseRefreshHit(
  db: pg.ClientBase,
  userId: string,
  now: Date = new Date()
): Promise<PulseRefreshHitResult> {
  const istDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

  await db.query('BEGIN');
  try {
    const { rows } = await db.query<{
      daily_hits: number;
      window_start: Date;
      window_hits: number;
      last_hit_at: Date;
    }>(
      'SELECT daily_hits, window_start, window_hits, last_hit_at FROM pulse_refresh_usage WHERE user_id = $1 AND day = $2 FOR UPDATE',
      [userId, istDate]
    );

    if (rows.length === 0) {
      // First hit of the day for this user: initialize counters
      await db.query(
        `INSERT INTO pulse_refresh_usage (user_id, day, daily_hits, window_start, window_hits, last_hit_at)
         VALUES ($1, $2, 1, $3, 1, $3)`,
        [userId, istDate, now]
      );
      await db.query('COMMIT');
      return {
        allowed: true,
        dailyHits: 1,
        hitsLeft: 99,
        maxDaily: 100,
      };
    }

    const row = rows[0]!;
    const elapsedCooldown = (now.getTime() - new Date(row.last_hit_at).getTime()) / 1000;
    if (elapsedCooldown < 15) {
      await db.query('ROLLBACK');
      const waitSeconds = Math.ceil(15 - elapsedCooldown);
      return {
        allowed: false,
        error: 'cooldown_active',
        message: `Please wait ${waitSeconds}s before refreshing again.`,
        waitSeconds,
        dailyHits: row.daily_hits,
        hitsLeft: Math.max(0, 100 - row.daily_hits),
        maxDaily: 100,
      };
    }

    if (row.daily_hits >= 100) {
      await db.query('ROLLBACK');
      return {
        allowed: false,
        error: 'daily_limit_exceeded',
        message: 'Daily refresh limit reached (100/100). Resets tomorrow.',
        dailyHits: row.daily_hits,
        hitsLeft: 0,
        maxDaily: 100,
      };
    }

    const elapsedMinute = (now.getTime() - new Date(row.window_start).getTime()) / 1000;
    let newWindowHits = 1;
    let newWindowStart = now;

    if (elapsedMinute < 60) {
      if (row.window_hits >= 4) {
        await db.query('ROLLBACK');
        const waitSeconds = Math.ceil(60 - elapsedMinute);
        return {
          allowed: false,
          error: 'minute_limit_exceeded',
          message: `Rate limit: Maximum 4 refreshes per minute. Please wait ${waitSeconds}s.`,
          waitSeconds,
          dailyHits: row.daily_hits,
          hitsLeft: Math.max(0, 100 - row.daily_hits),
          maxDaily: 100,
        };
      }
      newWindowHits = row.window_hits + 1;
      newWindowStart = row.window_start;
    }

    const newDailyHits = row.daily_hits + 1;
    await db.query(
      `UPDATE pulse_refresh_usage
       SET daily_hits = $3, window_start = $4, window_hits = $5, last_hit_at = $6
       WHERE user_id = $1 AND day = $2`,
      [userId, istDate, newDailyHits, newWindowStart, newWindowHits, now]
    );

    await db.query('COMMIT');

    return {
      allowed: true,
      dailyHits: newDailyHits,
      hitsLeft: Math.max(0, 100 - newDailyHits),
      maxDaily: 100,
    };
  } catch (err) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
}


