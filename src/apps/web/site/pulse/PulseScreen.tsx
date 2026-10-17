'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { age, istDateTime } from '../format.ts';
import { Icon } from '../Icon.tsx';
import type { PulseResponse, SectorItem } from '../../src/pulse.ts';
import type { StoryCard } from '../types.ts';
import './pulse.css';

export interface PulseScreenProps {
  initialPulse: PulseResponse;
  initialStories: StoryCard[];
}

export function PulseScreen({ initialPulse, initialStories }: PulseScreenProps) {
  const [pulse, setPulse] = useState<PulseResponse>(initialPulse);
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);

  // Auto-refresh pulse telemetry every 60 seconds when active
  useEffect(() => {
    let active = true;

    async function refresh() {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/v1/market/pulse', { signal: AbortSignal.timeout(6_000) });
        if (!res.ok) return;
        const json = (await res.json()) as PulseResponse;
        if (active && json && json.breadth) {
          setPulse(json);
        }
      } catch {
        // Silently keep last known state
      }
    }

    const timer = setInterval(refresh, 60_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const { breadth, sectors } = pulse;
  const selectedSector = sectors.find((s) => s.id === selectedSectorId) ?? null;

  // Filter stories matching the selected sector's constituents
  const filteredStories = selectedSector
    ? initialStories.filter((story) => {
        const symbols = story.instruments.map((i) => i.display_symbol ?? i.exchange_codes?.nse ?? '');
        return symbols.some((sym) => selectedSector.topConstituents.includes(sym));
      })
    : initialStories.slice(0, 25);

  const advPct = breadth.total > 0 ? Number(((breadth.advances / breadth.total) * 100).toFixed(1)) : 50;
  const decPct = breadth.total > 0 ? Number(((breadth.declines / breadth.total) * 100).toFixed(1)) : 50;
  const unchPct = breadth.total > 0 ? Number(((breadth.unchanged / breadth.total) * 100).toFixed(1)) : 0;

  const toggleSector = (id: string) => {
    setSelectedSectorId((curr) => (curr === id ? null : id));
  };

  return (
    <div className="pulse-screen">
      {/* Header */}
      <header className="pulse-header">
        <div className="pulse-title-group">
          <h1 className="pulse-title">
            <Icon name="pulse" size={24} />
            Market Pulse
          </h1>
          <p className="pulse-subtitle">
            Real-time NSE market breadth, sector rotation &amp; targeted news intelligence
          </p>
        </div>
        <div className="pulse-live-badge" title="Auto-refreshed every 60 seconds">
          <span className="pulse-live-dot" />
          <span>LIVE TELEMETRY</span>
        </div>
      </header>

      {/* Hero Breadth Command Card */}
      <section className="pulse-breadth-card" aria-label="Market Breadth">
        <div className="breadth-card-header">
          <h2 className="breadth-card-title">NSE Market Breadth &amp; Participation</h2>
          <span className="breadth-sentiment-pill" data-sentiment={breadth.sentiment}>
            {breadth.sentiment === 'strong_bullish' || breadth.sentiment === 'bullish' ? '▲' : '▼'} {breadth.sentimentLabel} ({breadth.ratio} : 1)
          </span>
        </div>

        {/* Visual Multi-Segment Advance / Decline Bar */}
        <div className="breadth-bar-container">
          <div className="breadth-bar">
            <div
              className="breadth-segment breadth-segment-adv"
              style={{ width: `${advPct}%` }}
              title={`Advances: ${breadth.advances} (${advPct}%)`}
            >
              {advPct > 15 ? `${advPct}% Adv` : ''}
            </div>
            {unchPct > 3 && (
              <div
                className="breadth-segment breadth-segment-unch"
                style={{ width: `${unchPct}%` }}
                title={`Unchanged: ${breadth.unchanged} (${unchPct}%)`}
              >
                {unchPct > 8 ? `${unchPct}%` : ''}
              </div>
            )}
            <div
              className="breadth-segment breadth-segment-dec"
              style={{ width: `${decPct}%` }}
              title={`Declines: ${breadth.declines} (${decPct}%)`}
            >
              {decPct > 15 ? `${decPct}% Dec` : ''}
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="breadth-metrics-grid">
          <div className="breadth-metric-box">
            <span className="breadth-metric-label">Advances</span>
            <span className="breadth-metric-val bull mono">
              ▲ {breadth.advances.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="breadth-metric-box">
            <span className="breadth-metric-label">Declines</span>
            <span className="breadth-metric-val bear mono">
              ▼ {breadth.declines.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="breadth-metric-box">
            <span className="breadth-metric-label">Unchanged</span>
            <span className="breadth-metric-val neu mono">
              ▬ {breadth.unchanged.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="breadth-metric-box">
            <span className="breadth-metric-label">A/D Ratio</span>
            <span className="breadth-metric-val mono">
              {breadth.ratio} : 1
            </span>
          </div>

          <div className="breadth-metric-box">
            <span className="breadth-metric-label">Nifty 50 Breadth</span>
            <span className="breadth-metric-val mono">
              <span className="bull">{breadth.nifty50.advances}</span> / <span className="bear">{breadth.nifty50.declines}</span>
            </span>
          </div>
        </div>
      </section>

      {/* Sector Rotation Heatmap */}
      <section className="pulse-heatmap-section" aria-label="Sector Heatmap">
        <div className="pulse-section-header">
          <h2 className="pulse-section-title">
            Sector Heatmap
            <span style={{ fontSize: '12px', fontWeight: 'normal', color: 'var(--muted)' }}>
              (Click a sector to filter news below)
            </span>
          </h2>
          {selectedSectorId && (
            <button
              type="button"
              className="pulse-clear-filter-btn"
              onClick={() => setSelectedSectorId(null)}
            >
              ✕ Clear Filter
            </button>
          )}
        </div>

        <div className="pulse-sector-grid">
          {sectors.map((sec: SectorItem) => {
            const isSelected = sec.id === selectedSectorId;
            const isBull = sec.change > 0;
            const isBear = sec.change < 0;
            const changeSign = isBull ? '+' : '';
            const arrow = isBull ? '▲' : isBear ? '▼' : '';

            return (
              <button
                key={sec.id}
                type="button"
                className="pulse-sector-card"
                data-selected={isSelected ? 'true' : undefined}
                onClick={() => toggleSector(sec.id)}
              >
                <div className="pulse-sector-top">
                  <h3 className="pulse-sector-name">{sec.name}</h3>
                  <span className="pulse-sector-status-pill" data-status={sec.status}>
                    {sec.status}
                  </span>
                </div>

                <div className="pulse-sector-numbers mono">
                  <span className="pulse-sector-price">
                    {sec.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className={`pulse-sector-change ${sec.sentiment}`}>
                    {arrow} {changeSign}{sec.percent.toFixed(2)}%
                  </span>
                </div>

                <div className="pulse-sector-constituents">
                  {sec.topConstituents.slice(0, 5).join(' · ')}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Sector-Filtered News Section */}
      <section className="pulse-news-section" aria-label="Sector News">
        <div className="pulse-section-header">
          <h2 className="pulse-section-title">
            {selectedSector ? `${selectedSector.name} Corporate News & Filings` : 'Market-Wide Breaking News'}
          </h2>
        </div>

        {selectedSector && (
          <div className="pulse-active-filter-banner">
            <span>
              Filtered for <b>{selectedSector.name}</b> constituents ({selectedSector.topConstituents.slice(0, 6).join(', ')}...)
            </span>
            <button
              type="button"
              className="pulse-clear-filter-btn"
              onClick={() => setSelectedSectorId(null)}
            >
              Show All News
            </button>
          </div>
        )}

        {filteredStories.length === 0 ? (
          <div className="pulse-news-empty">
            No breaking corporate announcements recorded yet for {selectedSector?.name ?? 'this sector'} in the active window.
          </div>
        ) : (
          <ul className="pulse-news-list">
            {filteredStories.map((s) => {
              const symbols = s.instruments.map((i) => i.display_symbol ?? i.exchange_codes?.nse ?? i.isin);
              const sourceName = s.primary_item?.source?.name ?? 'News';

              return (
                <li key={s.story_id} className="pulse-news-card">
                  <div className="pulse-news-top">
                    <div className="pulse-news-meta">
                      <span className="pulse-news-source">{sourceName}</span>
                      <span>•</span>
                      <time dateTime={s.first_seen_at} title={`${istDateTime(s.first_seen_at)} IST`}>
                        {age(s.first_seen_at)}
                      </time>
                    </div>

                    {symbols.length > 0 && (
                      <div className="pulse-news-symbols">
                        {symbols.slice(0, 4).map((sym) => (
                          <span key={sym} className="pulse-news-ticker-tag mono">
                            {sym}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <Link href={`/s/${s.story_id}`} className="pulse-news-headline">
                    {s.headline}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
