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

export default async function PulsePage() {
  const [pulseRes, storiesRes, sessionRes] = await Promise.all([
    api<PulseResponse>('/v1/market/pulse').catch(() => null),
    api<{ stories: StoryCard[] }>('/v1/market/pulse/stories').catch(() => null),
    api<{ session: SessionInfo }>('/v1/session').catch(() => null),
  ]);

  const pulseData = pulseRes && pulseRes.status === 200 && pulseRes.body ? pulseRes.body : null;
  const stories = storiesRes && storiesRes.status === 200 && storiesRes.body?.stories ? storiesRes.body.stories : [];
  const session = sessionRes && sessionRes.status === 200 && sessionRes.body?.session ? sessionRes.body.session : null;

  if (!pulseData) {
    const { fetchMarketPulse } = await import('../../src/pulse.ts');
    const fallback = await fetchMarketPulse();
    return <PulseScreen initialPulse={fallback} initialStories={stories} session={session} />;
  }

  return <PulseScreen initialPulse={pulseData} initialStories={stories} session={session} />;
}
