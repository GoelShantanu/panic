import type { Metadata } from 'next';
import { api } from '../../site/api.ts';
import { HeatmapScreen } from '../../site/heatmap/HeatmapScreen.tsx';
import type { HeatmapResponse } from '../../src/heatmap.ts';
import { FALLBACK_HEATMAP } from '../../src/heatmap.ts';

export const metadata: Metadata = {
  title: 'Nifty 200 Heatmap — Live Sector Performance & Market Cap Treemap',
  description:
    'Interactive real-time Nifty 200 stock market heatmap. Stocks grouped by sector, sized by market capitalization, and colored by live percentage gains and losses.',
  openGraph: {
    title: 'Nifty 200 Market Heatmap — BazaarPanic',
    description:
      'Real-time Indian market treemap covering top 200 NSE stocks across all sectors.',
    url: 'https://bazaarpanic.com/heatmap',
  },
};

export default async function HeatmapPage() {
  const res = await api<HeatmapResponse>('/v1/market/heatmap').catch(() => null);
  const heatmapData = res && res.status === 200 && res.body && Array.isArray(res.body.stocks) && res.body.stocks.length > 0
    ? res.body
    : FALLBACK_HEATMAP;

  return <HeatmapScreen initialHeatmap={heatmapData} />;
}
