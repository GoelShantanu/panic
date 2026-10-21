'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { age, istDateTime } from '../format.ts';
import type { SessionInfo } from '../format.ts';
import { Icon } from '../Icon.tsx';
import type { PulseResponse, SectorItem, PcrData } from '../../src/pulse.ts';
import { CLIENT_DEFAULT_PCR, CLIENT_FALLBACK_PCR } from './pcrDefaults.ts';
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
  signedIn?: boolean;
  trialUsed?: boolean;
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

function formatDataAsOf(isoString: string, isCashOpen: boolean): string {
  if (isCashOpen) {
    return `${formatIstTime(isoString)} (Live)`;
  }

  // Market is closed/offline: compute last market close time (15:30 IST)
  try {
    const now = new Date();
    // IST offset is UTC + 5h30m (330 minutes)
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffsetMs);

    const dayOfWeek = istNow.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const hours = istNow.getUTCHours();
    const minutes = istNow.getUTCMinutes();
    const timeInMinutes = hours * 60 + minutes;

    let daysBack = 0;
    if (dayOfWeek === 0) {
      daysBack = 2; // Sunday -> previous Friday
    } else if (dayOfWeek === 6) {
      daysBack = 1; // Saturday -> Friday
    } else if (dayOfWeek === 1 && timeInMinutes < 15 * 60 + 30) {
      daysBack = 3; // Monday before 15:30 -> previous Friday
    } else if (timeInMinutes < 15 * 60 + 30) {
      daysBack = 1; // Tue-Fri before 15:30 -> yesterday
    } else {
      daysBack = 0; // Weekday after 15:30 -> today
    }

    const targetDate = new Date(istNow.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const day = targetDate.getUTCDate();
    const month = targetDate.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });

    return `${day} ${month}, 15:30 IST (Closing Data)`;
  } catch {
    return `${formatIstTime(isoString)} (Closing Data)`;
  }
}

export function PulseScreen({
  initialPulse,
  initialStories,
  session,
  userTier = 'free',
  initialUsage = null,
  signedIn = false,
  trialUsed = false,
}: PulseScreenProps) {
  const [pulse, setPulse] = useState<PulseResponse>(initialPulse);
  const [pcrOverride, setPcrOverride] = useState<'live' | 'paused' | null>(null);
  const [previewTierOverride, setPreviewTierOverride] = useState<'free' | 'paid' | null>(null);
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
  const [upgradeModal, setUpgradeModal] = useState<{ feature: 'refresh' | 'sector' | 'pcr'; sectorName?: string } | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [isActivatingTrial, setIsActivatingTrial] = useState(false);
  const [trialError, setTrialError] = useState<string | null>(null);

  async function handleStartTrial() {
    setIsActivatingTrial(true);
    setTrialError(null);
    try {
      const res = await fetch('/v1/billing/trial', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: '{}',
      });
      if (res.ok) {
        window.location.reload();
      } else if (res.status === 401) {
        window.location.href = '/sign-in?next=/pulse';
      } else {
        const data = await res.json().catch(() => null);
        setTrialError(data?.error === 'trial_used' ? 'The free trial has already been used on this account.' : 'Could not activate trial.');
      }
    } catch {
      setTrialError('Network error while activating trial.');
    } finally {
      setIsActivatingTrial(false);
    }
  }

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

  // Passive auto-refresh pulse telemetry during live market hours
  // Every 60s for Pro/Trial; every 15 minutes (900s) for Free/Guest
  useEffect(() => {
    if (!isCashOpen) return;

    let active = true;
    const intervalMs = userTier === 'paid' ? 60_000 : 900_000;
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
    }, intervalMs);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isCashOpen, userTier]);

  // Client-side fallback: auto-fetch stories if SSR initialStories was empty
  useEffect(() => {
    if (initialStories.length === 0) {
      loadSectorStories(null);
    }
  }, []);

  // Client-side fallback: auto-fetch pulse if SSR initialPulse sectors was empty
  useEffect(() => {
    if (initialPulse.sectors.length === 0) {
      fetch('/v1/market/pulse', { signal: AbortSignal.timeout(6_000) })
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json?.breadth && json?.sectors) setPulse(json);
        })
        .catch(() => undefined);
    }
  }, []);

  // Fetch sector-specific stories across the entire database
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

  const effectiveTier = previewTierOverride ?? userTier;
  const isPro = effectiveTier === 'paid';

  const rawPcr = pulse.pcr ?? CLIENT_DEFAULT_PCR;
  const effectivePcr: PcrData =
    pcrOverride === 'paused'
      ? { ...CLIENT_FALLBACK_PCR, lastConfirmedAt: rawPcr.lastConfirmedAt ?? '15:30 IST' }
      : pcrOverride === 'live'
      ? { ...rawPcr, status: 'live' }
      : rawPcr;
  const isPcrLive = effectivePcr.status === 'live';

  // Gauge range: 0.5 to 1.7 (spread of 1.2)
  const gaugeMin = 0.5;
  const gaugeMax = 1.7;
  const needlePct = Math.max(3, Math.min(97, ((effectivePcr.nifty.pcr - gaugeMin) / (gaugeMax - gaugeMin)) * 100));

  function handleTogglePcrStatus() {
    setPcrOverride((prev) => {
      const current = prev ?? effectivePcr.status;
      return current === 'live' ? 'paused' : 'live';
    });
  }

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
              <b>Data as of:</b> {formatDataAsOf(pulse.updatedAt, isCashOpen)}
            </span>
            <span className="pulse-time-item">
              <b>Refresh:</b>{' '}
              {effectiveTier === 'paid' ? (
                <>Every 1 min <span className="pulse-btn-pro-tag">PRO</span></>
              ) : (
                <>Every 15 min. <span className="pulse-pro-refresh-hint" title="Pro members get 1-minute live auto-refreshes">(1 min for Pro ⚡)</span></>
              )}{' '}
              {isCashOpen ? '(Active)' : '(Paused while closed)'}
            </span>

            <div className="pulse-refresh-action-group">
              {effectiveTier === 'paid' ? (
                <button
                  type="button"
                  className="pulse-refresh-btn"
                  onClick={handleManualRefresh}
                  disabled={cooldown > 0 || isRefreshing || hitsLeft === 0}
                  title={hitsLeft === 0 ? 'Daily limit reached (100/100)' : 'Instant manual refresh'}
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
                  title="Manual refresh is available for Pro members"
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

      {/* Dual Command Hero Grid: Cash Market Breadth & Derivatives Sentiment (PCR) */}
      <div className="pulse-hero-grid">
        {/* Left Hero: Cash Market Breadth Command Card */}
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
                style={{ flex: `${advPct}` }}
                title={`Advances: ${breadth.advances.toLocaleString('en-IN')} (${advPct}%)`}
              >
                {advPct > 8 ? `${advPct}%` : ''}
              </div>
              <div
                className="breadth-segment breadth-segment-dec"
                style={{ flex: `${decPct}` }}
                title={`Declines: ${breadth.declines.toLocaleString('en-IN')} (${decPct}%)`}
              >
                {decPct > 8 ? `${decPct}%` : ''}
              </div>
              <div
                className="breadth-segment breadth-segment-unch"
                style={{ flex: `${unchPct}`, minWidth: '45px' }}
                title={`Unchanged: ${breadth.unchanged.toLocaleString('en-IN')} (${unchPct}%)`}
              >
                {unchPct > 2 ? `${unchPct}%` : ''}
              </div>
            </div>
            <div className="breadth-bar-legend">
              <span className="legend-item legend-adv">
                <span className="legend-dot" aria-hidden="true" />
                <span>Advances</span>
                <span className="legend-count">({breadth.advances.toLocaleString('en-IN')})</span>
              </span>
              <span className="legend-item legend-dec">
                <span className="legend-dot" aria-hidden="true" />
                <span>Declines</span>
                <span className="legend-count">({breadth.declines.toLocaleString('en-IN')})</span>
              </span>
              <span className="legend-item legend-unch">
                <span className="legend-dot" aria-hidden="true" />
                <span>Unchanged</span>
                <span className="legend-count">({breadth.unchanged.toLocaleString('en-IN')})</span>
              </span>
            </div>
          </div>

          {/* Breadth Numbers Grid */}
          <div className="breadth-metrics-grid">
            <div className="breadth-metric-box">
              <span className="breadth-metric-label">Advances</span>
              <span className="breadth-metric-val bull mono">
                <span className="breadth-metric-sym">▲</span>
                <span>{breadth.advances.toLocaleString('en-IN')}</span>
              </span>
            </div>

            <div className="breadth-metric-box">
              <span className="breadth-metric-label">Declines</span>
              <span className="breadth-metric-val bear mono">
                <span className="breadth-metric-sym">▼</span>
                <span>{breadth.declines.toLocaleString('en-IN')}</span>
              </span>
            </div>

            <div className="breadth-metric-box">
              <span className="breadth-metric-label">Unchanged</span>
              <span className="breadth-metric-val neu mono">
                <span className="breadth-metric-sym">▬</span>
                <span>{breadth.unchanged.toLocaleString('en-IN')}</span>
              </span>
            </div>

            <div className="breadth-metric-box">
              <span className="breadth-metric-label">A/D Ratio</span>
              <span className="breadth-metric-val mono">
                {breadth.ratio} : 1
              </span>
            </div>

            <div
              className="breadth-metric-box"
              title={`Nifty 50: ${breadth.nifty50.advances} Adv, ${breadth.nifty50.declines} Dec${breadth.nifty50.unchanged > 0 ? `, ${breadth.nifty50.unchanged} Unch` : ''} (50 stocks)`}
            >
              <span className="breadth-metric-label">Nifty 50 Breadth</span>
              <span className="breadth-metric-val mono">
                <span className="bull">{breadth.nifty50.advances}</span> / <span className="bear">{breadth.nifty50.declines}</span>
                {breadth.nifty50.unchanged > 0 && (
                  <span className="neu" style={{ fontSize: '13px', marginLeft: '3px' }}>
                    / {breadth.nifty50.unchanged}
                  </span>
                )}
              </span>
            </div>
          </div>
        </section>

        {/* Right Hero: F&O Derivatives Sentiment (PCR) Command Card */}
        <section
          className={`pulse-pcr-card ${!isPro ? 'pulse-pcr-locked' : ''}`}
          aria-label="F&O Derivatives Sentiment"
        >
          {/* Pro Lock Overlay for Free / Non-Paid Users */}
          {!isPro && (
            <div className="pcr-pro-lock-overlay" role="region" aria-label="Pro Feature: Put/Call Ratio">
              <div className="pcr-lock-card">
                <div className="pcr-lock-badge-row">
                  <span className="pcr-lock-pro-pill">🔒 PRO EXCLUSIVE</span>
                  <span className="pcr-lock-sub-pill">1-MIN REFRESH</span>
                </div>
                <h3 className="pcr-lock-title">Put/Call Ratio (PCR) Sentiment</h3>
                <p className="pcr-lock-desc">
                  Institutional F&amp;O derivatives positioning, Put/Call writing open interest distribution &amp; visual sentiment range gauge.
                </p>
                <div className="pcr-lock-actions">
                  <button
                    type="button"
                    className="pcr-lock-upgrade-btn"
                    onClick={() => setUpgradeModal({ feature: 'pcr' })}
                  >
                    Upgrade to Pro (₹149/mo) →
                  </button>
                  {!trialUsed && (
                    signedIn ? (
                      <button
                        type="button"
                        className="pcr-lock-trial-btn"
                        onClick={handleStartTrial}
                        disabled={isActivatingTrial}
                      >
                        {isActivatingTrial ? 'Activating...' : 'Start 3-Day Free Trial'}
                      </button>
                    ) : (
                      <Link
                        href="/sign-in?next=/pulse"
                        className="pcr-lock-trial-btn"
                      >
                        Start 3-Day Free Trial
                      </Link>
                    )
                  )}
                </div>
                {process.env.NODE_ENV !== 'production' && (
                  <button
                    type="button"
                    className="pcr-lock-dev-toggle"
                    onClick={() => setPreviewTierOverride('paid')}
                    title="Local development only: Toggle to preview Pro unlocked state"
                  >
                    👁️ Preview as Pro (Dev)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Inner Content (dimmed / blurred when locked) */}
          <div className={!isPro ? 'pcr-card-inner-locked' : 'pcr-card-inner'}>
            <div className="pcr-card-header">
              <div className="pcr-title-group">
                <div className="pcr-title-with-tag">
                  <h2 className="pcr-card-title">F&amp;O Derivatives Sentiment (PCR)</h2>
                  <span className="pulse-btn-pro-tag">PRO</span>
                </div>
                <span className="pcr-subtitle">Smart-money hedging vs speculative positioning</span>
              </div>
              <div className="pcr-status-wrap">
                {process.env.NODE_ENV !== 'production' && isPro && (
                  <button
                    type="button"
                    className="pcr-dev-tier-toggle"
                    onClick={() => setPreviewTierOverride('free')}
                    title="Development only: Toggle to preview Free locked state"
                  >
                    Lock (Free)
                  </button>
                )}
                <button
                  type="button"
                  className={`pcr-status-pill pcr-status-${effectivePcr.status}`}
                  onClick={handleTogglePcrStatus}
                  title="Click to toggle between LIVE and PAUSED preview states"
                  aria-label={`PCR status: ${isPcrLive ? 'Live' : 'Paused / Offline'}. Click to toggle preview.`}
                >
                  <span className={isPcrLive ? 'pcr-live-dot' : 'pcr-paused-dot'} />
                  <span>{isPcrLive ? '● LIVE' : 'PAUSED / OFFLINE'}</span>
                </button>
              </div>
            </div>

            {/* Graceful Fallback Notice (When upstream is paused/offline) */}
            {!isPcrLive && (
              <div className="pcr-notice-banner" role="status">
                <span className="pcr-notice-icon">⚡</span>
                <span>{effectivePcr.notice || 'Exchange feed paused • Background retry in progress (No impact on cash breadth)'}</span>
              </div>
            )}

            {/* Dual Index PCR Hero Metrics (NIFTY 50 & BANK NIFTY) */}
            <div className="pcr-metrics-row">
              {/* Primary: NIFTY 50 PCR */}
              <div className="pcr-primary-box">
                <div className="pcr-metric-meta">
                  <span className="pcr-metric-label">NIFTY 50 PCR</span>
                  {effectivePcr.lastConfirmedAt && (
                    <span className="pcr-timestamp-pill">
                      {isPcrLive ? `LIVE (${effectivePcr.lastConfirmedAt})` : `LAST CONFIRMED (${effectivePcr.lastConfirmedAt})`}
                    </span>
                  )}
                </div>
                <div className="pcr-val-row">
                  <span className={`pcr-hero-num ${!isPcrLive ? 'pcr-dimmed' : ''}`}>
                    {effectivePcr.nifty.pcr.toFixed(2)}
                  </span>
                  <span
                    className={`pcr-sentiment-pill ${!isPcrLive ? 'pcr-sentiment-pill-muted' : ''}`}
                    data-sentiment={isPcrLive ? effectivePcr.nifty.sentiment : 'neutral'}
                  >
                    {isPcrLive && (effectivePcr.nifty.sentiment === 'bullish' || effectivePcr.nifty.sentiment === 'strong_bullish' ? '▲ ' : effectivePcr.nifty.sentiment === 'neutral' ? '▬ ' : '▼ ')}
                    {effectivePcr.nifty.sentimentLabel}
                  </span>
                </div>
              </div>

              {/* Secondary: BANK NIFTY PCR */}
              <div className="pcr-secondary-box">
                <div className="pcr-metric-meta">
                  <span className="pcr-metric-label">BANK NIFTY PCR</span>
                </div>
                <div className="pcr-val-row">
                  <span className={`pcr-secondary-num ${!isPcrLive ? 'pcr-dimmed' : ''}`}>
                    {effectivePcr.bankNifty.pcr.toFixed(2)}
                  </span>
                  <span
                    className={`pcr-sentiment-pill pcr-sentiment-pill-sm ${!isPcrLive ? 'pcr-sentiment-pill-muted' : ''}`}
                    data-sentiment={isPcrLive ? effectivePcr.bankNifty.sentiment : 'neutral'}
                  >
                    {effectivePcr.bankNifty.sentimentLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* Visual Horizontal Sentiment Range Gauge */}
            <div className="pcr-gauge-container">
              <div className="pcr-gauge-title-row">
                <span className="pcr-gauge-title">Sentiment Range Gauge</span>
                <span
                  className="pcr-gauge-current-val"
                  data-sentiment={isPcrLive ? effectivePcr.nifty.sentiment : 'neutral'}
                >
                  Current: <b>{effectivePcr.nifty.pcr.toFixed(2)}</b>{' '}
                  <span className="pcr-gauge-current-zone">
                    ({isPcrLive ? effectivePcr.nifty.sentimentLabel.split(' ')[0] : 'PAUSED'})
                  </span>
                </span>
              </div>

              <div className="pcr-gauge-wrapper">
                {/* Dynamic Needle Pin placed ABOVE the bar - ZERO text overlap */}
                <div
                  className={`pcr-gauge-pointer ${!isPcrLive ? 'pcr-pointer-paused' : ''}`}
                  data-sentiment={isPcrLive ? effectivePcr.nifty.sentiment : 'neutral'}
                  style={{ left: `${needlePct}%` }}
                >
                  <span className="pcr-pointer-badge">{effectivePcr.nifty.pcr.toFixed(2)}</span>
                  <span className="pcr-pointer-arrow">▼</span>
                </div>

                {/* The 5-zone Track */}
                <div className={`pcr-gauge-track ${!isPcrLive ? 'pcr-gauge-dimmed' : ''}`}>
                  <div className="pcr-gauge-zone pcr-zone-oversold" title="Oversold (< 0.70)" />
                  <div className="pcr-gauge-zone pcr-zone-bearish" title="Bearish Resistance (0.70 - 0.90)" />
                  <div className="pcr-gauge-zone pcr-zone-neutral" title="Neutral / Balanced (0.90 - 1.10)" />
                  <div className="pcr-gauge-zone pcr-zone-bullish" title="Bullish Support (1.10 - 1.40)" />
                  <div className="pcr-gauge-zone pcr-zone-overbought" title="Overbought (> 1.40)" />
                  {/* Subtle vertical indicator needle mark inside track */}
                  <div className="pcr-gauge-mark-line" style={{ left: `${needlePct}%` }} />
                </div>
              </div>

              {/* Labels below the track with generous margin - clean, separated, no overlap */}
              <div className="pcr-gauge-labels">
                <span>&lt;0.70 <span className="pcr-zone-word">Oversold</span></span>
                <span>0.70–0.90 <span className="pcr-zone-word">Bear</span></span>
                <span>0.90–1.10 <span className="pcr-zone-word">Neutral</span></span>
                <span>1.10–1.40 <span className="pcr-zone-word">Bull</span></span>
                <span>&gt;1.40 <span className="pcr-zone-word">Overbought</span></span>
              </div>
            </div>

            {/* Open Interest Breakdown */}
            <div className="pcr-oi-grid">
              <div className="pcr-oi-box">
                <span className="pcr-oi-label">Put OI (Contracts)</span>
                <span className={`pcr-oi-val ${isPcrLive ? 'bull' : 'neu'}`}>
                  {isPcrLive && effectivePcr.nifty.putOi > 0
                    ? `${(effectivePcr.nifty.putOi / 1_000_000).toFixed(1)}M`
                    : '--'}
                </span>
              </div>
              <div className="pcr-oi-box">
                <span className="pcr-oi-label">Call OI (Contracts)</span>
                <span className={`pcr-oi-val ${isPcrLive ? 'bear' : 'neu'}`}>
                  {isPcrLive && effectivePcr.nifty.callOi > 0
                    ? `${(effectivePcr.nifty.callOi / 1_000_000).toFixed(1)}M`
                    : '--'}
                </span>
              </div>
              <div className="pcr-oi-box">
                <span className="pcr-oi-label">OI Net Bias</span>
                <span className="pcr-oi-val neu">
                  {isPcrLive && effectivePcr.nifty.putOi > 0 && effectivePcr.nifty.callOi > 0
                    ? effectivePcr.nifty.putOi >= effectivePcr.nifty.callOi
                      ? `+${((effectivePcr.nifty.putOi - effectivePcr.nifty.callOi) / 1_000_000).toFixed(1)}M Puts`
                      : `+${((effectivePcr.nifty.callOi - effectivePcr.nifty.putOi) / 1_000_000).toFixed(1)}M Calls`
                    : '--'}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Sector Rotation Heatmap - Whole Tile Colored */}
      <section className="pulse-heatmap-section" aria-label="Sector Heatmap">
        <div className="pulse-section-header">
          <h2 className="pulse-section-title">
            Sector Heatmap
            <span style={{ fontSize: '12px', fontWeight: 'normal', color: 'var(--muted)' }}>
              {userTier === 'paid'
                ? '(Click any sector or index tile to load matching stories)'
                : '(Sector & index intelligence is exclusive to Pro members)'}
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
              <b>Sector News Intelligence (Pro Feature):</b> Click any sector or index below to unlock deep company filings and institutional news across 12 core sectors. <b>Start a 3-day free trial — no credit card needed!</b>
            </div>
            <div className="pulse-pro-banner-actions">
              <button
                type="button"
                className="pulse-pro-banner-btn"
                onClick={() => setUpgradeModal({ feature: 'sector' })}
              >
                Upgrade to Pro (₹149/mo)
              </button>
              {!trialUsed && (
                signedIn ? (
                  <button
                    type="button"
                    className="pulse-pro-banner-trial-btn"
                    onClick={handleStartTrial}
                    disabled={isActivatingTrial}
                  >
                    {isActivatingTrial ? 'Activating...' : 'Start 3-Day Free Trial →'}
                  </button>
                ) : (
                  <Link
                    href="/sign-in?next=/pulse"
                    className="pulse-pro-banner-trial-btn"
                  >
                    Start 3-Day Free Trial →
                  </Link>
                )
              )}
            </div>
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
                ({Math.min(stories.length, 50)} top stories)
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
            {stories.slice(0, 50).map((s) => {
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
              <div className="pulse-modal-pro-badge">
                <span className="pulse-modal-pro-pill">PRO MEMBER FEATURE</span>
              </div>
              <h2 className="pulse-modal-title">
                {upgradeModal.feature === 'pcr'
                  ? 'Unlock Put/Call Ratio (PCR) with Pro'
                  : upgradeModal.feature === 'refresh'
                  ? 'Unlock Manual Refresh with Pro'
                  : 'Unlock Sector & Index Intelligence with Pro'}
              </h2>
              <p className="pulse-modal-desc">
                {upgradeModal.feature === 'pcr'
                  ? 'Access live institutional derivatives sentiment, smart-money Put/Call writing open interest & 1-minute auto-refreshes.'
                  : upgradeModal.feature === 'refresh'
                  ? 'Get instant on-demand market breadth, index tracking, and sector rotation updates.'
                  : 'Filter live corporate announcements, BSE/NSE filings, and expert commentary across all 12 sectors & benchmark indices.'}
              </p>
            </div>

            <div className="pulse-modal-features">
              <div className="pulse-modal-feature-item">
                <span className="pulse-modal-check">✓</span>
                <div>
                  <b>Live Put/Call Ratio (PCR):</b> Real-time F&amp;O derivatives sentiment, smart-money Put/Call writing bias &amp; 5-zone range gauge.
                </div>
              </div>
              <div className="pulse-modal-feature-item">
                <span className="pulse-modal-check">✓</span>
                <div>
                  <b>1-Minute Live Refresh:</b> Breadth &amp; F&amp;O refresh every 1 min (vs 15 min on Free) + up to 100 on-demand refreshes/day.
                </div>
              </div>
              <div className="pulse-modal-feature-item">
                <span className="pulse-modal-check">✓</span>
                <div>
                  <b>Sector Intelligence:</b> Deep filtering across all 30+ days stories for Nifty 50, Smallcap, Midcap, Largecap, IT, Banking, Auto, Pharma, Energy, Metal, Realty &amp; FMCG.
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

            {!trialUsed && (
              <div className="pulse-modal-trial-card">
                <div className="pulse-modal-trial-badge">⚡ 3-DAY FREE TRIAL</div>
                <div className="pulse-modal-trial-body">
                  <div className="pulse-modal-trial-heading">
                    Want to test Pro first? Try it free for 3 days.
                  </div>
                  <div className="pulse-modal-trial-sub">
                    Get full, unrestricted access to all 12 sectors, filings &amp; instant manual refresh — <b>no credit card required</b>.
                  </div>
                  {trialError && <div className="pulse-modal-trial-error">{trialError}</div>}
                </div>
                {signedIn ? (
                  <button
                    type="button"
                    className="pulse-modal-trial-action-btn"
                    onClick={handleStartTrial}
                    disabled={isActivatingTrial}
                  >
                    {isActivatingTrial ? 'Activating Trial...' : 'Start 3-Day Free Trial →'}
                  </button>
                ) : (
                  <Link
                    href="/sign-in?next=/pulse"
                    className="pulse-modal-trial-action-btn"
                  >
                    Start 3-Day Free Trial →
                  </Link>
                )}
              </div>
            )}

            <div className="pulse-modal-pricing">
              <button
                type="button"
                className={`pulse-plan-box ${selectedPlan === 'monthly' ? 'selected' : ''}`}
                onClick={() => setSelectedPlan('monthly')}
                aria-pressed={selectedPlan === 'monthly'}
              >
                <div className="pulse-plan-top-row">
                  <div className="pulse-plan-name">Monthly</div>
                  <div className={`pulse-plan-radio ${selectedPlan === 'monthly' ? 'active' : ''}`}>
                    {selectedPlan === 'monthly' && <span className="pulse-plan-radio-dot" />}
                  </div>
                </div>
                <div className="pulse-plan-cost">₹149 <span>/ mo</span></div>
                <div className="pulse-plan-tax">GST included · Cancel anytime</div>
              </button>

              <button
                type="button"
                className={`pulse-plan-box ${selectedPlan === 'yearly' ? 'selected' : ''}`}
                onClick={() => setSelectedPlan('yearly')}
                aria-pressed={selectedPlan === 'yearly'}
              >
                <span className="pulse-plan-badge">SAVE 33%</span>
                <div className="pulse-plan-top-row">
                  <div className="pulse-plan-name">Yearly</div>
                  <div className={`pulse-plan-radio ${selectedPlan === 'yearly' ? 'active' : ''}`}>
                    {selectedPlan === 'yearly' && <span className="pulse-plan-radio-dot" />}
                  </div>
                </div>
                <div className="pulse-plan-cost">₹1,199 <span>/ yr</span></div>
                <div className="pulse-plan-tax">₹99/mo equivalent · GST included</div>
              </button>
            </div>

            <div className="pulse-modal-actions">
              <Link href={`/plans?billing=${selectedPlan}`} className="button button-primary pulse-modal-btn">
                Upgrade to Pro
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
