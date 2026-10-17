'use client';

import { useEffect, useState } from 'react';
import type { TickerItem, TickerResponse } from '../src/market.ts';

export interface MarketTickerProps {
  initial?: TickerResponse | null;
}

export function MarketTicker({ initial }: MarketTickerProps) {
  const [data, setData] = useState<TickerResponse | null>(initial ?? null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/v1/market/ticker', { signal: AbortSignal.timeout(6_000) });
        if (!res.ok) return;
        const json = (await res.json()) as TickerResponse;
        if (active && json && Array.isArray(json.indices)) {
          setData(json);
        }
      } catch {
        // Silently preserve last good state
      }
    }

    // Refresh every 30 seconds when tab is active
    const timer = setInterval(load, 30_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        load();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Initial client fetch if not provided server-side
    if (!initial) {
      load();
    }

    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [initial]);

  if (!data || !data.indices || data.indices.length === 0) {
    return null;
  }

  return (
    <div className="market-ticker" aria-label="Live Market Indices & Futures">
      <div className="ticker-header">
        <span className="ticker-live-dot" aria-hidden="true" />
        <span className="ticker-header-title">LIVE</span>
      </div>
      <div className="ticker-track">
        {data.indices.map((idx: TickerItem) => {
          const isBull = idx.change > 0;
          const isBear = idx.change < 0;
          const changeSign = isBull ? '+' : '';
          const arrow = isBull ? '▲' : isBear ? '▼' : '';
          const sentimentClass = isBull ? 'bull' : isBear ? 'bear' : 'neu';

          return (
            <div key={idx.symbol} className="ticker-item" data-futures={idx.isFutures || undefined}>
              <div className="ticker-label-group">
                {idx.isFutures && <span className="ticker-futures-tag">GIFT</span>}
                <span className="ticker-name">{idx.name}</span>
              </div>
              <span className="ticker-price mono">
                {idx.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className={`ticker-change mono ${sentimentClass}`}>
                {arrow} {changeSign}{idx.change.toFixed(2)} ({changeSign}{idx.percent.toFixed(2)}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
