'use client';

import { useEffect, useState } from 'react';
import type { TickerItem, TickerResponse } from '../src/market.ts';
import type { SessionInfo } from './format.ts';
import { useLiveEvent } from './live.tsx';

export interface MarketTickerProps {
  initial?: TickerResponse | null;
  session?: SessionInfo | null;
}

/**
 * Checks if GIFT Nifty futures continuous session is active (NSE IX at GIFT City).
 * Trading days: Monday to Friday (excl. holidays)
 * - Session 1: 06:30 to 15:40 IST
 * - Session 2: 16:35 to 03:40 IST next morning
 * Weekends (Saturday after 03:40 IST & all Sunday): CLOSED
 */
export function isGiftNiftyActive(now: Date = new Date()): boolean {
  const istFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hourCycle: 'h23',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
  });
  const parts = istFormatter.formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value;
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  const mins = hour * 60 + minute;

  // Saturday: Friday's Session 2 ends at 03:40 AM IST.
  if (weekday === 'Sat') {
    return mins < 3 * 60 + 40;
  }
  // Sunday: Closed all day
  if (weekday === 'Sun') {
    return false;
  }
  // Monday: Opens at 06:30 AM IST. Closed prior to 06:30.
  if (weekday === 'Mon' && mins < 6 * 60 + 30) {
    return false;
  }
  // Tuesday to Friday: Morning break between 03:40 AM and 06:30 AM IST
  if (mins >= 3 * 60 + 40 && mins < 6 * 60 + 30) {
    return false;
  }
  // Monday to Friday: Afternoon break between Session 1 and Session 2 (15:40 - 16:35 IST)
  if (mins >= 15 * 60 + 40 && mins < 16 * 60 + 35) {
    return false;
  }

  return true;
}

/**
 * Checks if MCX commodities market session is active.
 * Trading days: Monday to Friday (excl. holidays)
 * - Morning & Evening sessions: 09:00 AM to 11:30 PM IST (23:30)
 * Weekends (Saturday & Sunday): CLOSED
 */
export function isMcxActive(now: Date = new Date()): boolean {
  const istFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hourCycle: 'h23',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
  });
  const parts = istFormatter.formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value;
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  const mins = hour * 60 + minute;

  if (weekday === 'Sat' || weekday === 'Sun') {
    return false;
  }
  return mins >= 9 * 60 && mins < 23 * 60 + 30;
}

export function MarketTicker({ initial, session: initialSession }: MarketTickerProps) {
  const [data, setData] = useState<TickerResponse | null>(initial ?? null);
  const [session, setSession] = useState<SessionInfo | null>(initialSession ?? null);
  const [, tick] = useState(0);

  // Keep session in sync via SSE
  useLiveEvent('session.changed', (e) => setSession(e.session));

  // Periodic tick every minute to re-evaluate time-based status
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

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

  const isCashOpen = session?.state === 'open' || session?.state === 'special';
  const isPreOpen = session?.state === 'pre_open';
  const isGiftLive = isGiftNiftyActive();
  const isMcxLive = isMcxActive();

  let statusKind: 'live' | 'gift-live' | 'offline' = 'offline';
  let statusLabel = 'OFFLINE';
  let statusTooltip = 'Markets are currently closed';

  if (isCashOpen) {
    statusKind = 'live';
    statusLabel = 'LIVE';
    statusTooltip = 'NSE/BSE Indian stock market is OPEN';
  } else if (isPreOpen) {
    statusKind = 'live';
    statusLabel = 'PRE-OPEN';
    statusTooltip = 'NSE/BSE pre-market session active';
  } else if (isGiftLive && isMcxLive) {
    statusKind = 'gift-live';
    statusLabel = 'EXTENDED LIVE';
    statusTooltip = 'GIFT Nifty futures & MCX commodities sessions are ACTIVE';
  } else if (isGiftLive) {
    statusKind = 'gift-live';
    statusLabel = 'GIFT LIVE';
    statusTooltip = 'NSE IX GIFT Nifty futures session is ACTIVE';
  } else if (isMcxLive) {
    statusKind = 'gift-live';
    statusLabel = 'MCX LIVE';
    statusTooltip = 'MCX Commodity market session is ACTIVE';
  } else {
    statusKind = 'offline';
    statusLabel = 'OFFLINE';
    statusTooltip = 'Markets are currently closed';
  }

  return (
    <div className="market-ticker" aria-label="Live Market Indices & Futures">
      <div className="ticker-header" data-status={statusKind} title={statusTooltip}>
        <span className="ticker-dot" aria-hidden="true" />
        <span className="ticker-header-title">{statusLabel}</span>
      </div>
      <div className="ticker-track">
        {data.indices.map((idx: TickerItem) => {
          const isBull = idx.change > 0;
          const isBear = idx.change < 0;
          const changeSign = isBull ? '+' : '';
          const arrow = isBull ? '▲' : isBear ? '▼' : '';
          const sentimentClass = isBull ? 'bull' : isBear ? 'bear' : 'neu';

          return (
            <div
              key={idx.symbol}
              className="ticker-item"
              data-futures={idx.isFutures || undefined}
              data-tag={idx.tag || undefined}
            >
              <div className="ticker-label-group">
                {idx.tag && (
                  <span className={`ticker-tag ticker-tag-${idx.tag.toLowerCase()}`}>
                    {idx.tag}
                  </span>
                )}
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
