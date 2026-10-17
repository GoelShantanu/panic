'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { age, istDateTime } from '../format.ts';
import type { SessionInfo } from '../format.ts';
import { Icon } from '../Icon.tsx';
import type { PulseResponse, SectorItem } from '../../src/pulse.ts';
import type { StoryCard } from '../types.ts';
import './pulse.css';

export interface UsageInfo {
  dailyHits: number;
  hitsLeft: number;
  maxDaily: number;
}

export interface PulseScreenProps {
  initialPulse: PulseResponse;
  initialStories: StoryCard[];
  session?: SessionInfo | null;
  userTier?: 'free' | 'paid';
  initialUsage?: UsageInfo | null;
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

export function PulseScreen({
  initialPulse,
  initialStories,
  session,
  userTier = 'free',
  initialUsage = null,
}: PulseScreenProps) {
  const [pulse, setPulse] = useState<PulseResponse>(initialPulse);
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [stories, setStories] = useState<StoryCard[]>(initialStories);
  const [isLoadingStories, setIsLoadingStories] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Rate limiting & cooldown state
  const [cooldown, setCooldown] = useState(0);
  const [dailyHits, setDailyHits] = useState(initialUsage?.dailyHits ?? 0);
  const [hitsLeft, setHitsLeft] = useState(initialUsage?.hitsLeft ?? 100);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);

  // Upgrade modal state
  const [upgradeModal, setUpgradeModal] = useState<{ feature: 'refresh' | 'sector'; sectorName?: string } | null>(null);

  const isCashOpen = session?.state === 'open' || session?.state === 'special';

  // 15-second cooldown timer countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Handle manual telemetry refresh (paid users only, rate-limited)
  async function handleManualRefresh() {
    if (userTier !== 'paid') {
      setUpgradeModal({ feature: 'refresh' });
      return;
    }

    if (cooldown > 0 || isRefreshing || hitsLeft === 0) return;

    setIsRefreshing(true);
    setRefreshNotice(null);

    try {
      const res = await fetch('/v1/market/pulse/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });

      if (res.status === 402) {
        setUpgradeModal({ feature: 'refresh' });
        return;
      }

      const json = await res.json().catch(() => null);

      if (res.status === 429) {
        setRefreshNotice(json?.message || 'Rate limit reached. Please wait.');
        if (json?.wait_seconds) setCooldown(json.wait_seconds);
        if (json?.usage) {
          setDailyHits(json.usage.daily_hits);
          setHitsLeft(json.usage.hits_left);
        }
        return;
      }

      if (res.ok && json?.pulse) {
        setPulse(json.pulse);
        if (json.usage) {
          setDailyHits(json.usage.daily_hits);
          setHitsLeft(json.usage.hits_left);
        }
        // Start 15-second cooldown timer
        setCooldown(15);
      } else {
        setRefreshNotice('Failed to refresh market data.');
      }
    } catch {
      setRefreshNotice('Network error. Could not refresh.');
    } finally {
      setIsRefreshing(false);
    }
  }

  // Passive auto-refresh pulse telemetry every 60 seconds during live market hours
  useEffect(() => {
    if (!isCashOpen) return;

    let active = true;
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (active) {
        fetch('/v1/market/pulse', { signal: AbortSignal.timeout(6_000) })
          .then((r) => (r.ok ? r.json() : null))
          .then((json) => {
            if (active && json?.breadth) setPulse(json);
          })
          .catch(() => undefined);
      }
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
      if (res.status === 402) {
        setUpgradeModal({ feature: 'sector' });
        return;
      }
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
    // Restrict sector filtering to paid users
    if (userTier !== 'paid') {
      const sec = sectors.find((s) => s.id === id);
      setUpgradeModal({ feature: 'sector', sectorName: sec?.name || id });
      return;
    }

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
      {/* Header with Offline/Live Status & Refresh Controls */}
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

            <div className="pulse-refresh-action-group">
              {userTier === 'paid' ? (
                <button
                  type="button"
                  className="pulse-refresh-btn"
                  onClick={handleManualRefresh}
                  disabled={cooldown > 0 || isRefreshing || hitsLeft === 0}
                  title={hitsLeft === 0 ? 'Daily limit reached (100/100)' : 'Instant manual telemetry refresh'}
                >
                  {cooldown > 0
                    ? `↻ Wait ${cooldown}s...`
                    : isRefreshing
                    ? '↻ Refreshing...'
                    : hitsLeft === 0
                    ? '↻ Daily Limit Reached'
                    : '↻ Refresh Now'}
                </button>
              ) : (
                <button
                  type="button"
                  className="pulse-refresh-btn pulse-pro-btn"
                  onClick={() => setUpgradeModal({ feature: 'refresh' })}
                  title="Manual refresh is available on the Paid Plan"
                >
                  ↻ Refresh Now <span className="pulse-btn-pro-tag">PRO</span>
                </button>
              )}

              {/* Warning when 10 or fewer hits left for the day */}
              {userTier === 'paid' && dailyHits >= 90 && hitsLeft > 0 && (
                <div className="pulse-hit-warning">
                  ⚠️ Only {hitsLeft} hits left for the day
                </div>
              )}

              {userTier === 'paid' && hitsLeft === 0 && (
                <div className="pulse-hit-error">
                  ⚠️ Daily refresh limit reached (100/100). Resets tomorrow.
                </div>
              )}

              {refreshNotice && (
                <div className="pulse-hit-notice">
                  {refreshNotice}
                </div>
              )}
            </div>
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
          <div className="breadth-bar-legend">
            <span className="legend-adv">● Advances ({breadth.advances.toLocaleString('en-IN')})</span>
            <span className="legend-unch">● Unchanged ({breadth.unchanged.toLocaleString('en-IN')})</span>
            <span className="legend-dec">● Declines ({breadth.declines.toLocaleString('en-IN')})</span>
          </div>
        </div>

        {/* Breadth Numbers Grid */}
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
              {userTier === 'paid'
                ? '(Click any sector tile to load matching stories)'
                : '(Sector intelligence is exclusive to Paid members)'}
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

        {userTier !== 'paid' && (
          <div className="pulse-pro-banner">
            <span className="pulse-pro-banner-icon">🔒</span>
            <div className="pulse-pro-banner-text">
              <b>Sector News Intelligence (Paid Feature):</b> Click any sector below to upgrade and unlock real-time company filings, news, and institutional announcements filtered across 8 core sectors.
            </div>
            <button
              type="button"
              className="pulse-pro-banner-btn"
              onClick={() => setUpgradeModal({ feature: 'sector' })}
            >
              Upgrade (₹149/mo)
            </button>
          </div>
        )}

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
                  <div className="pulse-sector-badges">
                    {userTier !== 'paid' && <span className="pulse-card-pro-tag">PRO 🔒</span>}
                    <span className="pulse-sector-status-pill" data-status={sec.status}>
                      {sec.status}
                    </span>
                  </div>
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

      {/* Upgrade Modal for Non-Paid Users */}
      {upgradeModal && (
        <div
          className="pulse-modal-backdrop"
          onClick={() => setUpgradeModal(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="pulse-modal-panel" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="pulse-modal-close"
              onClick={() => setUpgradeModal(null)}
              aria-label="Close"
            >
              ✕
            </button>

            <div className="pulse-modal-header">
              <span className="pulse-modal-crown">⭐</span>
              <h2 className="pulse-modal-title">
                {upgradeModal.feature === 'refresh'
                  ? 'Manual Telemetry Refresh is a Paid Feature'
                  : 'Sector Intelligence is a Paid Feature'}
              </h2>
              <p className="pulse-modal-desc">
                {upgradeModal.feature === 'refresh'
                  ? 'Get instant on-demand market breadth, index tracking, and sector rotation updates (up to 100 hits/day).'
                  : `Filter live corporate announcements, BSE/NSE filings, and expert commentary across all 8 core sectors.`}
              </p>
            </div>

            <div className="pulse-modal-features">
              <div className="pulse-modal-feature-item">
                <span className="pulse-modal-check">✓</span>
                <div>
                  <b>Manual Telemetry Refresh:</b> 15s instant refresh timer &amp; up to 100 hits/day.
                </div>
              </div>
              <div className="pulse-modal-feature-item">
                <span className="pulse-modal-check">✓</span>
                <div>
                  <b>Sector Intelligence:</b> Deep filtering across 1,500+ stories for IT, Banking, Auto, Pharma, Energy, Metal, Realty &amp; FMCG.
                </div>
              </div>
              <div className="pulse-modal-feature-item">
                <span className="pulse-modal-check">✓</span>
                <div>
                  <b>25 Alerts/Day:</b> Up to 25 instant alerts per day (vs 3 on Free).
                </div>
              </div>
              <div className="pulse-modal-feature-item">
                <span className="pulse-modal-check">✓</span>
                <div>
                  <b>30-Day News Archive:</b> Full company filings history &amp; multi-event filters.
                </div>
              </div>
            </div>

            <div className="pulse-modal-pricing">
              <div className="pulse-plan-box">
                <div className="pulse-plan-name">Monthly</div>
                <div className="pulse-plan-cost">₹149 <span>/ mo</span></div>
                <div className="pulse-plan-tax">GST included · Cancel anytime</div>
              </div>
              <div className="pulse-plan-box featured">
                <span className="pulse-plan-badge">SAVE 33%</span>
                <div className="pulse-plan-name">Yearly</div>
                <div className="pulse-plan-cost">₹1,199 <span>/ yr</span></div>
                <div className="pulse-plan-tax">₹99/mo equivalent · GST included</div>
              </div>
            </div>

            <div className="pulse-modal-actions">
              <Link href="/plans" className="button button-primary pulse-modal-btn">
                Upgrade to Paid (from ₹149/mo)
              </Link>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setUpgradeModal(null)}
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
