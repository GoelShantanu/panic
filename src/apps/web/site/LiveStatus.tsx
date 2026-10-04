'use client';

import { useEffect, useState } from 'react';
import { sessionLabel } from './format.ts';
import type { SessionInfo } from './format.ts';
import { useLive, useLiveEvent } from './live.tsx';
import type { StaleSource } from './types.ts';
import { istDateTime } from './format.ts';

// Header session state, kept current by session.changed (PRD-001 US-001.7 AC-1, AC-3).
export function SessionStatus({ initial }: { initial: SessionInfo | null }) {
  const [session, setSession] = useState(initial);
  const [, tick] = useState(0);
  useLiveEvent('session.changed', (e) => setSession(e.session));
  // Re-render each minute so "opens 09:00" never lags behind the clock.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const { reconnecting } = useLive();
  if (!session) return null;
  // "Closed · opens Mon 09:00 IST": the state and its detail stack in the desktop rail.
  const [state, detail] = sessionLabel(session).split(' · ');
  return (
    <>
      {reconnecting && (
        <span className="reconnecting" role="status">
          Reconnecting…
        </span>
      )}
      <span className="session" data-state={session.state} title={`Exchange date ${session.exchange_date}`}>
        <span className="session-state">
          <span className="session-dot" aria-hidden="true" />
          {state}
        </span>
        {detail && (
          <span className="session-detail">
            <span className="sr-only"> · </span>
            {detail}
          </span>
        )}
      </span>
    </>
  );
}

// Tier-1 sources stale or down (US-001.6 AC-3/AC-5): refreshed whenever any source's health changes.
export function StaleBanner({ initial }: { initial: StaleSource[] }) {
  const [stale, setStale] = useState(initial);
  useLiveEvent('source.health', () => {
    fetch('/v1/session', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b && setStale(b.stale_sources))
      .catch(() => undefined);
  });
  if (stale.length === 0) return null;
  return (
    <div className="notice notice-warn" role="status">
      {stale.map((s) => (
        <div key={s.source_id}>
          <strong>{s.name}</strong> is {s.health === 'down' ? 'down' : 'delayed'} since {istDateTime(s.since)} IST. Filings from it may be missing until it recovers.
        </div>
      ))}
    </div>
  );
}
