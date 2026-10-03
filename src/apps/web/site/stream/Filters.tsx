'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { EventType, StreamQuery, View } from '../types.ts';
import { streamParams } from './logic.ts';

export interface FiltersProps {
  query: StreamQuery;
  eventTypes: EventType[];
  directionalEnabled: boolean;
  entitlements: { multi_event_filter: boolean; stream_filings_only: boolean };
}

const href = (q: StreamQuery) => {
  const p = streamParams(q).toString();
  return p ? `/?${p}` : '/';
};

// PRD-001 US-001.3: one active view; event-type filter combines with any view; paid filters show an
// upgrade prompt rather than an empty list (AC-8). The URL carries the whole state (AC-3).
export function Filters({ query, eventTypes, directionalEnabled, entitlements }: FiltersProps) {
  const router = useRouter();
  const [upgrade, setUpgrade] = useState<string | null>(null);
  const views: { v: View; label: string }[] = [
    { v: 'latest', label: 'Latest' },
    { v: 'watchlist', label: 'Watchlist' },
    { v: 'important', label: 'Important' },
    ...(directionalEnabled ? ([{ v: 'bullish', label: 'Bullish' }, { v: 'bearish', label: 'Bearish' }] as const) : []),
    { v: 'trending', label: 'Trending' },
  ];
  const go = (q: StreamQuery) => {
    setUpgrade(null);
    router.push(href(q));
  };
  function toggleType(code: string) {
    const has = query.eventTypes.includes(code);
    if (!entitlements.multi_event_filter) return go({ ...query, eventTypes: has ? [] : [code] });
    go({ ...query, eventTypes: has ? query.eventTypes.filter((c) => c !== code) : [...query.eventTypes, code] });
  }
  return (
    <div className="filters">
      <nav className="tabs" aria-label="Views">
        {views.map(({ v, label }) => (
          <Link key={v} href={href({ ...query, view: v })} aria-current={query.view === v ? 'page' : undefined} className="tab">
            {label}
          </Link>
        ))}
      </nav>
      <div className="filter-row">
        <details className="dropdown">
          <summary className="button">
            {query.eventTypes.length === 0 ? 'All event types' : query.eventTypes.length === 1 ? (eventTypes.find((t) => t.code === query.eventTypes[0])?.label ?? query.eventTypes[0]) : `${query.eventTypes.length} event types`}
          </summary>
          <div className="dropdown-menu panel" role="group" aria-label="Event types">
            {!entitlements.multi_event_filter && (
              <p className="faint dropdown-note">
                Free plan: one type at a time. <Link href="/plans">Paid</Link> combines several.
              </p>
            )}
            {eventTypes.map((t) => (
              <label key={t.code} className="check">
                <input type={entitlements.multi_event_filter ? 'checkbox' : 'radio'} name="event_type" checked={query.eventTypes.includes(t.code)} onChange={() => toggleType(t.code)} />
                {t.label}
              </label>
            ))}
          </div>
        </details>
        <label className="check" title={entitlements.stream_filings_only ? undefined : 'Paid feature'}>
          <input
            type="checkbox"
            checked={query.filingsOnly}
            onChange={() => {
              if (!entitlements.stream_filings_only && !query.filingsOnly) return setUpgrade('Filings-only is part of the paid plan. It shows only stories led by an exchange filing.');
              go({ ...query, filingsOnly: !query.filingsOnly });
            }}
          />
          Filings only {!entitlements.stream_filings_only && <span className="paid-label">Paid</span>}
        </label>
        {(query.eventTypes.length > 0 || query.filingsOnly) && (
          <button type="button" className="icon-button" onClick={() => go({ ...query, eventTypes: [], filingsOnly: false })}>
            Clear filters
          </button>
        )}
        <span className="faint filter-hint">
          Press <kbd>?</kbd> for shortcuts
        </span>
      </div>
      {upgrade && (
        <div className="notice notice-warn" role="status">
          {upgrade} <Link href="/plans">See plans</Link>{' '}
          <button type="button" className="icon-button" onClick={() => setUpgrade(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
