import type { Metadata } from 'next';
import { api } from '../../site/api.ts';
import { PulseScreen } from '../../site/pulse/PulseScreen.tsx';
import type { PulseResponse } from '../../src/pulse.ts';
import type { StoryCard } from '../../site/types.ts';
import type { SessionInfo } from '../../site/format.ts';

export const metadata: Metadata = {
  title: 'Market Pulse — Sector Heatmap & Breadth',
  description: 'Real-time Indian stock market breadth, NSE advances & declines, sector rotation heatmap, and targeted corporate filings.',
};

const FALLBACK_PULSE: PulseResponse = {
  breadth: {
    advances: 1684,
    declines: 1427,
    unchanged: 84,
    total: 3195,
    ratio: 1.18,
    sentiment: 'bullish',
    sentimentLabel: 'Bullish Breadth',
    nifty50: { advances: 27, declines: 23, unchanged: 0 },
    updatedAt: new Date().toISOString(),
  },
  sectors: [
    { id: 'nifty50', name: 'NIFTY 50', symbol: 'NSE:NIFTY', price: 23146.15, change: 148.8, percent: 0.65, sentiment: 'bull', status: 'bullish', topConstituents: ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK'] },
    { id: 'smallcap', name: 'NIFTY SMALLCAP', symbol: 'NSE:CNXSMALLCAP', price: 19129.8, change: -1.9, percent: -0.01, sentiment: 'bear', status: 'neutral', topConstituents: ['SUZLON', 'EXIDEIND', 'CDSL', 'ANGELONE', 'RADICO'] },
    { id: 'midcap', name: 'NIFTY MIDCAP', symbol: 'NSE:CNXMIDCAP', price: 59129.75, change: -67.5, percent: -0.11, sentiment: 'bear', status: 'neutral', topConstituents: ['BHARATFORG', 'PERSISTENT', 'COFORGE', 'POLYCAB', 'CUMMINSIND'] },
    { id: 'largecap', name: 'NIFTY LARGECAP', symbol: 'NSE:CNX100', price: 24133.1, change: 147.0, percent: 0.61, sentiment: 'bull', status: 'bullish', topConstituents: ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK'] },
    { id: 'it', name: 'NIFTY IT', symbol: 'NSE:CNXIT', price: 31924.1, change: 1204.3, percent: 3.92, sentiment: 'bull', status: 'leading', topConstituents: ['TCS', 'INFY', 'WIPRO', 'HCLTECH'] },
    { id: 'metal', name: 'NIFTY METAL', symbol: 'NSE:CNXMETAL', price: 12133.2, change: 114.7, percent: 0.95, sentiment: 'bull', status: 'bullish', topConstituents: ['TATASTEEL', 'JSWSTEEL', 'HINDALCO', 'VEDL'] },
    { id: 'auto', name: 'NIFTY AUTO', symbol: 'NSE:CNXAUTO', price: 25768.5, change: 192.1, percent: 0.75, sentiment: 'bull', status: 'bullish', topConstituents: ['TATAMOTORS', 'M&M', 'MARUTI', 'BAJAJ-AUTO'] },
    { id: 'bank', name: 'BANK NIFTY', symbol: 'NSE:BANKNIFTY', price: 55844.0, change: 33.5, percent: 0.06, sentiment: 'bull', status: 'neutral', topConstituents: ['HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK'] },
    { id: 'energy', name: 'NIFTY ENERGY', symbol: 'NSE:CNXENERGY', price: 36190.85, change: -22.85, percent: -0.06, sentiment: 'bear', status: 'neutral', topConstituents: ['RELIANCE', 'ONGC', 'NTPC', 'POWERGRID'] },
    { id: 'pharma', name: 'NIFTY PHARMA', symbol: 'NSE:CNXPHARMA', price: 25781.65, change: -36.15, percent: -0.14, sentiment: 'bear', status: 'neutral', topConstituents: ['SUNPHARMA', 'CIPLA', 'DRREDDY', 'DIVISLAB'] },
    { id: 'realty', name: 'NIFTY REALTY', symbol: 'NSE:CNXREALTY', price: 825.95, change: -2.75, percent: -0.33, sentiment: 'bear', status: 'lagging', topConstituents: ['DLF', 'GODREJPROP', 'LODHA', 'OBEROIRLTY'] },
    { id: 'fmcg', name: 'NIFTY FMCG', symbol: 'NSE:CNXFMCG', price: 44616.15, change: -175.45, percent: -0.39, sentiment: 'bear', status: 'lagging', topConstituents: ['ITC', 'HINDUNILVR', 'NESTLEIND', 'BRITANNIA'] },
  ],
  updatedAt: new Date().toISOString(),
};

export default async function PulsePage() {
  const [pulseRes, storiesRes, sessionRes, meRes] = await Promise.all([
    api<PulseResponse & { usage?: { daily_hits: number; hits_left: number; max_daily: number } | null }>('/v1/market/pulse').catch(() => null),
    api<{ stories: StoryCard[] }>('/v1/market/pulse/stories').catch(() => null),
    api<{ session: SessionInfo }>('/v1/session').catch(() => null),
    api<{ tier?: 'free' | 'paid'; trial?: { used: boolean; ends_at: string | null } }>('/v1/me').catch(() => null),
  ]);

  const pulseData = pulseRes && pulseRes.status === 200 && pulseRes.body ? pulseRes.body : FALLBACK_PULSE;
  const stories = storiesRes && storiesRes.status === 200 && storiesRes.body?.stories ? storiesRes.body.stories : [];
  const session = sessionRes && sessionRes.status === 200 && sessionRes.body?.session ? sessionRes.body.session : null;
  const signedIn = meRes?.status === 200;
  const isTrial = Boolean(meRes?.status === 200 && meRes.body?.trial?.ends_at && new Date(meRes.body.trial.ends_at) > new Date());
  const isPaid = meRes?.status === 200 && meRes.body?.tier === 'paid';
  const isPro = isPaid || isTrial;
  const userTier: 'free' | 'paid' = isPro ? 'paid' : 'free';
  const trialUsed = meRes?.status === 200 ? Boolean(meRes.body?.trial?.used) : false;

  const initialUsage = pulseRes && pulseRes.status === 200 && pulseRes.body?.usage
    ? {
        dailyHits: pulseRes.body.usage.daily_hits,
        hitsLeft: pulseRes.body.usage.hits_left,
        maxDaily: pulseRes.body.usage.max_daily,
      }
    : null;

  return (
    <PulseScreen
      initialPulse={pulseData}
      initialStories={stories}
      session={session}
      userTier={userTier}
      initialUsage={initialUsage}
      signedIn={signedIn}
      trialUsed={trialUsed}
    />
  );
}
