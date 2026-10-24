import type { Metadata } from 'next';
import { api } from '../../site/api.ts';
import { HeatmapScreen } from '../../site/heatmap/HeatmapScreen.tsx';
import type { HeatmapResponse } from '../../src/heatmap.ts';
import { FALLBACK_HEATMAP } from '../../src/heatmap.ts';
import type { SessionInfo } from '../../site/format.ts';

export const metadata: Metadata = {
  title: 'Nifty Heatmap — Market Capitalization & Sector Treemap',
  description:
    'Interactive Nifty 50, Nifty 100, and Nifty 200 stock market heatmap. Stocks grouped by sector, sized by market capitalization, and colored by live percentage gains and losses.',
  openGraph: {
    title: 'Nifty Market Heatmap — BazaarPanic',
    description:
      'Real-time Indian equity market treemap covering Nifty 50, Nifty 100, and Nifty 200 stocks across all sectors.',
    url: 'https://bazaarpanic.com/heatmap',
  },
};

export default async function HeatmapPage() {
  const [heatmapRes, sessionRes, meRes] = await Promise.all([
    api<HeatmapResponse>('/v1/market/heatmap').catch(() => null),
    api<{ session: SessionInfo }>('/v1/session').catch(() => null),
    api<{ tier?: 'free' | 'paid' }>('/v1/me').catch(() => null),
  ]);

  const heatmapData =
    heatmapRes && heatmapRes.status === 200 && heatmapRes.body && Array.isArray(heatmapRes.body.stocks) && heatmapRes.body.stocks.length > 0
      ? heatmapRes.body
      : FALLBACK_HEATMAP;

  const session = sessionRes && sessionRes.status === 200 && sessionRes.body?.session ? sessionRes.body.session : null;
  const signedIn = meRes?.status === 200;
  const userTier: 'free' | 'paid' = signedIn ? 'paid' : 'free';

  return (
    <HeatmapScreen
      initialHeatmap={heatmapData}
      session={session}
      userTier={userTier}
      signedIn={signedIn}
    />
  );
}
