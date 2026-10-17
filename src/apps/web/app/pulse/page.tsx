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
    nifty50: { advances: 26, declines: 22, unchanged: 0 },
    updatedAt: new Date().toISOString(),
  },
  sectors: [],
  updatedAt: new Date().toISOString(),
};

export default async function PulsePage() {
  const [pulseRes, storiesRes, sessionRes, meRes] = await Promise.all([
    api<PulseResponse & { usage?: { daily_hits: number; hits_left: number; max_daily: number } | null }>('/v1/market/pulse').catch(() => null),
    api<{ stories: StoryCard[] }>('/v1/market/pulse/stories').catch(() => null),
    api<{ session: SessionInfo }>('/v1/session').catch(() => null),
    api<{ tier?: 'free' | 'paid' }>('/v1/me').catch(() => null),
  ]);

  const pulseData = pulseRes && pulseRes.status === 200 && pulseRes.body ? pulseRes.body : FALLBACK_PULSE;
  const stories = storiesRes && storiesRes.status === 200 && storiesRes.body?.stories ? storiesRes.body.stories : [];
  const session = sessionRes && sessionRes.status === 200 && sessionRes.body?.session ? sessionRes.body.session : null;
  const userTier = meRes && meRes.status === 200 && meRes.body?.tier === 'paid' ? 'paid' : 'free';
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
    />
  );
}
