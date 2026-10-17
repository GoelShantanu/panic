'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { age, istDateTime } from '../format.ts';
import type { SessionInfo } from '../format.ts';
import { Icon } from '../Icon.tsx';
import type { PulseResponse, SectorItem } from '../../src/pulse.ts';
import type { StoryCard } from '../types.ts';
import './pulse.css';

export interface PulseScreenProps {
  initialPulse: PulseResponse;
  initialStories: StoryCard[];
  session?: SessionInfo | null;
}

function formatIstTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d) + ' IST';
  } catch {
    return isoString;
  }
}

export function PulseScreen({ initialPulse, initialStories, session }: PulseScreenProps) {
  const [pulse, setPulse] = useState<PulseResponse>(initialPulse);
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [stories, setStories] = useState<StoryCard[]>(initialStories);
  const [isLoadingStories, setIsLoadingStories] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isCashOpen = session?.state === 'open' || session?.state === 'special';

  // Fetch telemetry updates
  async function refreshPulse() {
    setIsRefreshing(true);
    try {
      const res = await fetch('/v1/market/pulse', { signal: AbortSignal.timeout(6_000) });
      if (!res.ok) return;
      const json = (await res.json()) as PulseResponse;
      if (json && json.breadth) {
        setPulse(json);
      }
    } catch {
      // Keep last known good telemetry
    } finally {
      setIsRefreshing(false);
    }
  }

  // Auto-refresh pulse telemetry every 60 seconds during live market hours
  useEffect(() => {
    if (!isCashOpen) return; // Paused while offline

    let active = true;
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (active) refreshPulse();
    }, 60_000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isCashOpen]);

  // Fetch sector-specific stories across the entire 1,500+ database
  async function loadSectorStories(sectorId: string | null) {
    setIsLoadingStories(true);
    try {
      const url = sectorId ? `/v1/market/pulse/stories?sector=${encodeURIComponent(sectorId)}` : '/v1/market/pulse/stories';
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (res.ok) {
        const json = (await res.json()) as { stories?: StoryCard[] };
        if (json?.stories) {
          setStories(json.stories);
        }
      }
    } catch {
      // Keep existing stories on error
    } finally {
      setIsLoadingStories(false);
    }
  }

  const toggleSector = (id: string) => {
    if (selectedSectorId === id) {
      setSelectedSectorId(null);
      loadSectorStories(null);
    } else {
      setSelectedSectorId(id);
      loadSectorStories(id);
    }
  };

  const { breadth, sectors } = pulse;
  const selectedSector = sectors.find((s) => s.id === selectedSectorId) ?? null;

  const advPct = breadth.total > 0 ? Number(((breadth.advances / breadth.total) * 100).toFixed(1)) : 50;
  const decPct = breadth.total > 0 ? Number(((breadth.declines / breadth.total) * 100).toFixed(1)) : 50;
  const unchPct = breadth.total > 0 ? Number(((breadth.unchanged / breadth.total) * 100).toFixed(1)) : 0;

  return (
    <div className="pulse-screen">
      {/* Header with Offline/Live Status & Refresh Timestamps */}
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

        <div className="pulse-header-controls">
          <div
            className="pulse-live-badge"
            data-status={isCashOpen ? 'live' : 'offline'}
            title={isCashOpen ? 'NSE/BSE Indian stock market is OPEN' : 'NSE/BSE Indian stock market is currently CLOSED'}
          >
            <span className={isCashOpen ? 'pulse-live-dot' : 'pulse-dot-offline'} />
            <span>{isCashOpen ? 'LIVE TELEMETRY' : 'OFFLINE (MARKET CLOSED)'}</span>
          </div>

          <div className="pulse-time-meta">
            <span className="pulse-time-item">
              <b>Data as of:</b> {formatIstTime(pulse.updatedAt)} {isCashOpen ? '(Live)' : '(Closing Data)'}
            </span>
            <span className="pulse-time-item">
              <b>Refresh:</b> Every 60s {isCashOpen ? '(Active)' : '(Paused while closed)'}
            </span>
            <button
              type="button"
              className="pulse-refresh-btn"
              onClick={refreshPulse}
              disabled={isRefreshing}
            >
              {isRefreshing ? '↻ Refreshing...' : '↻ Refresh Now'}
            </button>
          </div>
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

      {/* Sector Rotation Heatmap - Whole Tile Colored */}
      <section className="pulse-heatmap-section" aria-label="Sector Heatmap">
        <div className="pulse-section-header">
          <h2 className="pulse-section-title">
            Sector Heatmap
            <span style={{ fontSize: '12px', fontWeight: 'normal', color: 'var(--muted)' }}>
              (Click any sector tile to load all matching stories)
            </span>
          </h2>
          {selectedSectorId && (
            <button
              type="button"
              className="pulse-clear-filter-btn"
              onClick={() => {
                setSelectedSectorId(null);
                loadSectorStories(null);
              }}
            >
              ✕ Clear Filter
            </button>
          )}
        </div>

        <div className="pulse-sector-grid">
          {sectors.map((sec: SectorItem) => {
            const isSelected = sec.id === selectedSectorId;
            const isBull = sec.change > 0;
            const changeSign = isBull ? '+' : '';
            const arrow = isBull ? '▲' : sec.change < 0 ? '▼' : '';

            return (
              <button
                key={sec.id}
                type="button"
                className="pulse-sector-card"
                data-status={sec.status}
                data-sentiment={sec.sentiment}
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

      {/* Sector News Section Across All Stories */}
      <section className="pulse-news-section" aria-label="Sector News">
        <div className="pulse-section-header">
          <h2 className="pulse-section-title">
            {selectedSector ? `${selectedSector.name} Corporate News & Filings` : 'Market-Wide Breaking News'}
            {!isLoadingStories && (
              <span style={{ fontSize: '12px', fontWeight: 'normal', color: 'var(--muted)' }}>
                ({stories.length} stories found)
              </span>
            )}
          </h2>
        </div>

        {selectedSector && (
          <div className="pulse-active-filter-banner">
            <span>
              Filtered across database for <b>{selectedSector.name}</b> constituents ({selectedSector.topConstituents.slice(0, 8).join(', ')}...)
            </span>
            <button
              type="button"
              className="pulse-clear-filter-btn"
              onClick={() => {
                setSelectedSectorId(null);
                loadSectorStories(null);
              }}
            >
              Show All News
            </button>
          </div>
        )}

        {isLoadingStories ? (
          <div className="pulse-news-loading">
            Loading {selectedSector?.name ?? 'market'} stories from database...
          </div>
        ) : stories.length === 0 ? (
          <div className="pulse-news-empty">
            No corporate announcements recorded yet for {selectedSector?.name ?? 'this sector'} in the database.
          </div>
        ) : (
          <ul className="pulse-news-list">
            {stories.map((s) => {
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
                        {symbols.slice(0, 5).map((sym) => (
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
