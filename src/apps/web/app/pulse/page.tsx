import type { Metadata } from 'next';
import { api } from '../../site/api.ts';
import { PulseScreen } from '../../site/pulse/PulseScreen.tsx';
import type { PulseResponse } from '../../src/pulse.ts';
import type { StoryCard } from '../../site/types.ts';

export const metadata: Metadata = {
  title: 'Market Pulse — Sector Heatmap & Breadth',
  description: 'Real-time Indian stock market breadth, NSE advances & declines, sector rotation heatmap, and targeted corporate filings.',
};

export default async function PulsePage() {
  const [pulseRes, streamRes] = await Promise.all([
    api<PulseResponse>('/v1/market/pulse').catch(() => null),
    api<{ stories: StoryCard[] }>('/v1/stream?limit=50').catch(() => null),
  ]);

  const pulseData = pulseRes && pulseRes.status === 200 && pulseRes.body ? pulseRes.body : null;
  const stories = streamRes && streamRes.status === 200 && streamRes.body?.stories ? streamRes.body.stories : [];

  if (!pulseData) {
    const { fetchMarketPulse } = await import('../../src/pulse.ts');
    const fallback = await fetchMarketPulse();
    return <PulseScreen initialPulse={fallback} initialStories={stories} />;
  }

  return <PulseScreen initialPulse={pulseData} initialStories={stories} />;
}
