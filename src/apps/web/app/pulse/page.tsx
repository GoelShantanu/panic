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
  const [pulseRes, storiesRes, sessionRes] = await Promise.all([
    api<PulseResponse>('/v1/market/pulse').catch(() => null),
    api<{ stories: StoryCard[] }>('/v1/market/pulse/stories').catch(() => null),
    api<{ session: SessionInfo }>('/v1/session').catch(() => null),
  ]);

  const pulseData = pulseRes && pulseRes.status === 200 && pulseRes.body ? pulseRes.body : FALLBACK_PULSE;
  const stories = storiesRes && storiesRes.status === 200 && storiesRes.body?.stories ? storiesRes.body.stories : [];
  const session = sessionRes && sessionRes.status === 200 && sessionRes.body?.session ? sessionRes.body.session : null;

  return <PulseScreen initialPulse={pulseData} initialStories={stories} session={session} />;
}
