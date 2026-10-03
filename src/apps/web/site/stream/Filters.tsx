'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import type { EventType, StreamQuery, View } from '../types.ts';
import { streamParams } from './logic.ts';

export interface FiltersProps {
  query: StreamQuery;
  eventTypes: EventType[];
  directionalEnabled: boolean;
  entitlements: { multi_event_filter: boolean; stream_filings_only: boolean; saved_views?: number };
  signedIn?: boolean;
  // Company timeline: no view tabs; filings-only is free there (PRD-007 §2.1, PRD-004 US-004.3 AC-3).
  basePath?: string;
  views?: boolean;
  // Server-rendered saved views, so the filter row does not shift after load (WORKFLOW §7).
  savedViews?: SavedView[];
}

export interface SavedView {
  id: string;
  name: string;
  params: { view: View; event_types: string[]; filings_only: boolean };
}

const hrefFor = (base: string) => (q: StreamQuery) => {
  const p = streamParams(q).toString();
  return p ? `${base}?${p}` : base;
};

// PRD-001 US-001.3: one active view; event-type filter combines with any view; paid filters show an
// upgrade prompt rather than an empty list (AC-8). The URL carries the whole state (AC-3).
export function Filters({ query, eventTypes, directionalEnabled, entitlements, basePath = '/', views: showViews = true, signedIn = false, savedViews }: FiltersProps) {
  const href = hrefFor(basePath);
  const filingsFree = basePath !== '/';
  const router = useRouter();
  const [upgrade, setUpgrade] = useState<string | null>(null);
  const views: { v: View; label: string }[] = [
    { v: 'latest', label: 'Latest' },
    { v: 'watchlist', label: 'Watchlist' },
    { v: 'important', label: 'Important' },
    ...(directionalEnabled ? ([{ v: 'bullish', label: 'Bullish' }, { v: 'bearish', label: 'Bearish' }] as const) : []),
    { v: 'trending', label: 'Trending' },
  ];
  // Saved views (PRD-001 US-001.3 AC-2b): paid, up to 10, stream only.
  const savedAllowed = (entitlements.saved_views ?? 0) > 0;
  const [saved, setSaved] = useState<SavedView[]>(savedViews ?? []);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  useEffect(() => {
    if (!signedIn || !showViews || savedViews) return;
    fetch('/v1/saved-views', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b && !b.disabled && setSaved(b.views))
      .catch(() => undefined);
  }, [signedIn, showViews, savedViews]);
  async function saveView(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/v1/saved-views', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, params: { view: query.view, event_types: query.eventTypes, filings_only: query.filingsOnly } }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => null) : null;
    if (res?.status === 201) {
      setSaved((x) => [...x, { id: body.id, name: body.name, params: { view: query.view, event_types: query.eventTypes, filings_only: query.filingsOnly } }]);
      setNaming(false);
      setName('');
    } else setUpgrade(body?.error === 'name_taken' ? 'You already have a saved view with that name.' : body?.error === 'saved_view_limit' ? 'You have 10 saved views. Delete one in settings to add another.' : 'Could not save this view.');
  }
  // Loading state (PRD-001 §5): a spinner while the next view loads. No Suspense boundary: a streamed
  // boundary is revealed on an animation frame, which hidden tabs never run, so a stream opened in a
  // background tab would never go live (US-001.2 AC-5).
  const [pending, startTransition] = useTransition();
  const go = (q: StreamQuery) => {
    setUpgrade(null);
    startTransition(() => router.push(href(q)));
  };
  function toggleType(code: string) {
    const has = query.eventTypes.includes(code);
    if (!entitlements.multi_event_filter) return go({ ...query, eventTypes: has ? [] : [code] });
    go({ ...query, eventTypes: has ? query.eventTypes.filter((c) => c !== code) : [...query.eventTypes, code] });
  }
  return (
    <div className="filters">
      {showViews && <nav className="tabs" aria-label="Views">
        {views.map(({ v, label }) => (
          <Link
            key={v}
            href={href({ ...query, view: v })}
            aria-current={query.view === v ? 'page' : undefined}
            className="tab"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              go({ ...query, view: v });
            }}
          >
            {label}
          </Link>
        ))}
      </nav>}
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
        <label className="check" title={entitlements.stream_filings_only || filingsFree ? undefined : 'Paid feature'}>
          <input
            type="checkbox"
            checked={query.filingsOnly}
            onChange={() => {
              if (!entitlements.stream_filings_only && !filingsFree && !query.filingsOnly) return setUpgrade('Filings-only is part of the paid plan. It shows only stories led by an exchange filing.');
              go({ ...query, filingsOnly: !query.filingsOnly });
            }}
          />
          Filings only {!entitlements.stream_filings_only && !filingsFree && <span className="paid-label">Paid</span>}
        </label>
        {(query.eventTypes.length > 0 || query.filingsOnly) && (
          <button type="button" className="icon-button" onClick={() => go({ ...query, eventTypes: [], filingsOnly: false })}>
            Clear filters
          </button>
        )}
        {showViews && signedIn && saved.length > 0 && (
          <details className="dropdown">
            <summary className="button">Saved views</summary>
            <div className="dropdown-menu panel">
              {saved.map((v) => (
                <Link key={v.id} href={href({ view: v.params.view, eventTypes: v.params.event_types, filingsOnly: v.params.filings_only })}>
                  {v.name}
                </Link>
              ))}
            </div>
          </details>
        )}
        {showViews && signedIn && !naming && (
          <button type="button" className="icon-button" onClick={() => (savedAllowed ? setNaming(true) : setUpgrade('Saved views are part of the paid plan: save a view and its filters, reopen it in one click.'))}>
            Save view {!savedAllowed && <span className="paid-label">Paid</span>}
          </button>
        )}
        {naming && (
          <form onSubmit={saveView} className="inline-form">
            <input aria-label="Saved view name" placeholder="Name this view" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus required />
            <button type="submit" className="button">
              Save
            </button>
            <button type="button" className="icon-button" onClick={() => setNaming(false)}>
              Cancel
            </button>
          </form>
        )}
        {pending && <span className="spinner" aria-label="Loading stories" />}
        <span className="faint filter-hint desktop-only">
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
