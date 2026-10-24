'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { Icon } from '../Icon.tsx';
import type { HeatmapStock, HeatmapResponse } from '../../src/heatmap.ts';
import { computeNestedTreemap } from './treemapMath.ts';
import type { SectorLayout } from './treemapMath.ts';
import type { SessionInfo } from '../format.ts';
import './heatmap.css';

interface HeatmapScreenProps {
  initialHeatmap: HeatmapResponse;
  session?: SessionInfo | null;
  userTier?: 'free' | 'paid';
  signedIn?: boolean;
}

export type IndexFilter = 'NIFTY 50' | 'NIFTY 100' | 'NIFTY 200';
export type BreadthFilter = 'ALL' | 'ADVANCES' | 'DECLINES' | 'UNCHANGED';

// Official NSE Indian Equity Market Holidays 2026
export const NSE_HOLIDAYS_2026 = [
  '2026-01-15', // Municipal Corporation Election - Maharashtra
  '2026-01-26', // Republic Day
  '2026-02-15', // Mahashivratri
  '2026-03-03', // Holi
  '2026-03-21', // Id-Ul-Fitr
  '2026-03-26', // Shri Ram Navami
  '2026-03-31', // Shri Mahavir Jayanti
  '2026-04-03', // Good Friday
  '2026-04-14', // Dr. Ambedkar Jayanti
  '2026-05-01', // Maharashtra Day
  '2026-05-28', // Bakri Id
  '2026-06-26', // Muharram
  '2026-08-15', // Independence Day
  '2026-09-14', // Ganesh Chaturthi
  '2026-10-02', // Mahatma Gandhi Jayanti
  '2026-10-20', // Dussehra
  '2026-11-08', // Diwali Laxmi Pujan
  '2026-11-10', // Diwali-Balipratipada
  '2026-11-24', // Guru Nanak Jayanti
  '2026-12-25', // Christmas
];

/**
 * Determine Indian Stock Market (NSE/BSE) operational status
 * Market Trading Hours: Mon–Fri 09:15 to 15:30 IST.
 * Weekends (Saturday & Sunday) and National Holidays are closed.
 */
export function getIndianMarketStatus(session?: SessionInfo | null, date: Date = new Date()): {
  isOpen: boolean;
  statusKind: 'live' | 'closed';
  badgeText: string;
  tooltip: string;
} {
  // If database session status is open/special, it's open
  if (session?.state === 'open' || session?.state === 'special') {
    return {
      isOpen: true,
      statusKind: 'live',
      badgeText: 'Live Scanner (60s Cache)',
      tooltip: 'NSE/BSE Indian stock market is OPEN (Live price action)',
    };
  }

  if (session?.state === 'holiday') {
    return {
      isOpen: false,
      statusKind: 'closed',
      badgeText: 'Market Closed (Holiday)',
      tooltip: 'NSE/BSE Indian stock market is CLOSED for an exchange holiday',
    };
  }

  // Calculate IST components
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = formatter.formatToParts(date);
  let weekday = '';
  let year = '';
  let month = '';
  let day = '';
  let hour = 0;
  let minute = 0;

  for (const p of parts) {
    if (p.type === 'weekday') weekday = p.value;
    if (p.type === 'year') year = p.value;
    if (p.type === 'month') month = p.value;
    if (p.type === 'day') day = p.value;
    if (p.type === 'hour') hour = parseInt(p.value, 10);
    if (p.type === 'minute') minute = parseInt(p.value, 10);
  }

  // Check Weekend
  if (weekday === 'Sat' || weekday === 'Sun') {
    return {
      isOpen: false,
      statusKind: 'closed',
      badgeText: 'Market Closed (EOD Data)',
      tooltip: 'NSE/BSE Indian stock market is CLOSED on weekends (Hours: Mon–Fri 9:15 AM – 3:30 PM IST)',
    };
  }

  // Check Holidays
  const yyyymmdd = `${year}-${month}-${day}`;
  if (NSE_HOLIDAYS_2026.includes(yyyymmdd)) {
    return {
      isOpen: false,
      statusKind: 'closed',
      badgeText: 'Market Closed (Holiday)',
      tooltip: 'NSE/BSE Indian stock market is CLOSED today for an exchange holiday',
    };
  }

  // Trading Hours: 09:15 to 15:30 IST
  const mins = hour * 60 + minute;
  if (mins >= 9 * 60 + 15 && mins < 15 * 60 + 30) {
    return {
      isOpen: true,
      statusKind: 'live',
      badgeText: 'Live Scanner (60s Cache)',
      tooltip: 'NSE/BSE Indian stock market is OPEN (Live price action)',
    };
  }

  const isPreMarket = mins < 9 * 60 + 15;
  return {
    isOpen: false,
    statusKind: 'closed',
    badgeText: isPreMarket ? 'Pre-Market (Opens 9:15 AM)' : 'Market Closed (EOD Data)',
    tooltip: 'NSE/BSE Indian stock market is CLOSED (Trading hours: Mon–Fri 9:15 AM – 3:30 PM IST)',
  };
}

export function getHeatmapColor(change: number): { bg: string; border: string; text: string } {
  // Advances (> 0%) -> Green shades
  if (change >= 4.0) return { bg: '#047857', border: '#10b981', text: '#ecfdf5' };
  if (change >= 2.0) return { bg: '#065f46', border: '#059669', text: '#ecfdf5' };
  if (change >= 0.5) return { bg: '#064e3b', border: '#047857', text: '#d1fae5' };
  if (change >= 0.005) return { bg: '#04382a', border: '#059669', text: '#a7f3d0' };

  // Declines (< 0%) -> Red shades
  if (change <= -4.0) return { bg: '#b91c1c', border: '#ef4444', text: '#ffffff' };
  if (change <= -2.0) return { bg: '#991b1b', border: '#dc2626', text: '#fee2e2' };
  if (change <= -0.5) return { bg: '#7f1d1d', border: '#b91c1c', text: '#fecaca' };
  if (change <= -0.005) return { bg: '#451717', border: '#991b1b', text: '#fca5a5' };

  // Flat (0.00%) -> Neutral Slate
  return { bg: '#1e293b', border: '#334155', text: '#cbd5e1' };
}

export function formatCrores(amount: number): string {
  // Amount in INR; 1 Crore = 10,000,000 (10^7); 1 Lakh Crore = 10^12
  const lakhCrores = amount / 1e12;
  if (lakhCrores >= 1) {
    return `₹${lakhCrores.toFixed(2)} Lakh Cr`;
  }
  const crores = amount / 1e7;
  return `₹${crores.toFixed(0)} Cr`;
}

export function HeatmapScreen({
  initialHeatmap,
  session,
  userTier = 'free',
  signedIn = false,
}: HeatmapScreenProps) {
  const [data, setData] = useState<HeatmapResponse>(initialHeatmap);
  const [indexFilter, setIndexFilter] = useState<IndexFilter>('NIFTY 200');
  const [breadthFilter, setBreadthFilter] = useState<BreadthFilter>('ALL');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [cooldown, setCooldown] = useState<number>(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>(initialHeatmap.updatedAt);
  const [showUnlockModal, setShowUnlockModal] = useState<boolean>(false);
  const [hoveredStock, setHoveredStock] = useState<{
    stock: HeatmapStock;
    x: number;
    y: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 1100,
    height: 720,
  });

  const isProUser = signedIn || userTier === 'paid';
  const marketStatus = useMemo(() => getIndianMarketStatus(session), [session]);

  // Handle cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Measure container dimensions responsively
  useEffect(() => {
    function updateSize() {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const w = Math.max(340, Math.floor(rect.width));
        // Responsive height: minimum 620px, max 840px
        const h = Math.max(620, Math.min(840, Math.floor(window.innerHeight * 0.76)));
        setDimensions({ width: w, height: h });
      }
    }

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Compute summary stats for the active index & sector scope (unaffected by breadthFilter)
  const scopeStats = useMemo(() => {
    let list = data.stocks;
    if (indexFilter === 'NIFTY 50') {
      list = list.filter((s) => s.isNifty50);
    } else if (indexFilter === 'NIFTY 100') {
      list = list.filter((s) => s.isNifty100);
    }

    if (selectedSector !== 'ALL') {
      list = list.filter((s) => s.sector.toLowerCase() === selectedSector.toLowerCase());
    }

    let advances = 0;
    let declines = 0;
    let unchanged = 0;
    let totalCap = 0;

    for (const s of list) {
      totalCap += s.marketCap;
      if (s.change >= 0.005) advances++;
      else if (s.change <= -0.005) declines++;
      else unchanged++;
    }

    const total = list.length;
    return {
      total,
      totalCap,
      advances,
      declines,
      unchanged,
      advPercent: total > 0 ? ((advances / total) * 100).toFixed(0) : '0',
      decPercent: total > 0 ? ((declines / total) * 100).toFixed(0) : '0',
      unchPercent: total > 0 ? ((unchanged / total) * 100).toFixed(0) : '0',
    };
  }, [data.stocks, indexFilter, selectedSector]);

  // Filter stocks based on index scope, sector, AND breadth filter (advances / declines / unchanged)
  const filteredStocks = useMemo(() => {
    let list = data.stocks;
    if (indexFilter === 'NIFTY 50') {
      list = list.filter((s) => s.isNifty50);
    } else if (indexFilter === 'NIFTY 100') {
      list = list.filter((s) => s.isNifty100);
    }

    if (selectedSector !== 'ALL') {
      list = list.filter((s) => s.sector.toLowerCase() === selectedSector.toLowerCase());
    }

    if (breadthFilter === 'ADVANCES') {
      list = list.filter((s) => s.change >= 0.005);
    } else if (breadthFilter === 'DECLINES') {
      list = list.filter((s) => s.change <= -0.005);
    } else if (breadthFilter === 'UNCHANGED') {
      list = list.filter((s) => Math.abs(s.change) < 0.005);
    }

    return list;
  }, [data.stocks, indexFilter, selectedSector, breadthFilter]);

  // Distinct sectors available for dropdown
  const availableSectors = useMemo(() => {
    const set = new Set<string>();
    for (const s of data.stocks) {
      if (s.sector) set.add(s.sector);
    }
    return Array.from(set).sort();
  }, [data.stocks]);

  // Compute squarified layout
  const sectorLayouts: SectorLayout<HeatmapStock>[] = useMemo(() => {
    return computeNestedTreemap(
      filteredStocks,
      dimensions.width,
      dimensions.height,
      28 // Header height for sector banner
    );
  }, [filteredStocks, dimensions.width, dimensions.height]);

  // Manual refresh handler (Pro/Member only)
  async function handleRefresh() {
    if (!isProUser) {
      setShowUnlockModal(true);
      return;
    }
    if (isRefreshing || cooldown > 0) return;

    setIsRefreshing(true);
    try {
      const res = await fetch('/v1/market/heatmap', { signal: AbortSignal.timeout(8_000) });
      if (res.ok) {
        const json = (await res.json()) as HeatmapResponse;
        if (json && Array.isArray(json.stocks) && json.stocks.length > 0) {
          setData(json);
          setLastRefreshedAt(json.updatedAt || new Date().toISOString());
        }
      }
      setCooldown(10); // 10-second cooldown
    } catch {
      // Keep existing data on network error
    } finally {
      setIsRefreshing(false);
    }
  }

  const queryClean = searchQuery.trim().toLowerCase();

  return (
    <div className="heatmap-screen">
      {/* Top Header */}
      <header className="heatmap-header">
        <div className="heatmap-title-group">
          <h1 className="heatmap-title">
            <Icon name="heatmap" size={26} strokeWidth={2} />
            <span>NIFTY HEATMAP</span>
          </h1>
          <p className="heatmap-subtitle">
            Market capitalization &amp; price action treemap grouped by sector. Sized by market cap, colored by % change.
          </p>
        </div>

        <div className="heatmap-header-controls">
          {/* Market Status Badge (Live vs Market Closed) */}
          <div
            className={`heatmap-live-badge ${marketStatus.statusKind}`}
            title={marketStatus.tooltip}
            data-status={marketStatus.statusKind}
          >
            <span className={marketStatus.isOpen ? 'heatmap-live-dot' : 'heatmap-closed-dot'} />
            <span className="heatmap-live-text">{marketStatus.badgeText}</span>
          </div>

          <div className="heatmap-time-meta">
            <span className="heatmap-timestamp">
              Updated:{' '}
              {new Date(lastRefreshedAt).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
              })}
            </span>

            {/* Refresh Button: Clickable for Pro/Members, prompts Free unlock for guests */}
            {isProUser ? (
              <button
                type="button"
                className={`heatmap-refresh-btn ${isRefreshing ? 'refreshing' : ''}`}
                onClick={handleRefresh}
                disabled={isRefreshing || cooldown > 0}
                title={cooldown > 0 ? `Wait ${cooldown}s before next refresh` : 'Refresh stock quotes now'}
                aria-label="Refresh stock quotes"
              >
                <svg
                  className={`refresh-icon ${isRefreshing ? 'spin' : ''}`}
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <span>{cooldown > 0 ? `Wait ${cooldown}s` : isRefreshing ? 'Updating...' : 'Refresh'}</span>
              </button>
            ) : (
              <button
                type="button"
                className="heatmap-refresh-btn heatmap-pro-btn"
                onClick={() => setShowUnlockModal(true)}
                title="Sign in to refresh Nifty heatmap"
                aria-label="Sign in to refresh Nifty heatmap"
              >
                <svg
                  className="refresh-icon"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <span>Refresh</span>
                <span className="heatmap-pro-tag">PRO</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Control Bar: Index Scope Tabs (Nifty 50, 100, 200), Sector Selector, Search */}
      <div className="heatmap-controls-bar">
        {/* Index Scope Pills */}
        <div className="heatmap-index-tabs" role="tablist" aria-label="Index Scope">
          {(['NIFTY 50', 'NIFTY 100', 'NIFTY 200'] as IndexFilter[]).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={indexFilter === tab}
              className={`heatmap-tab-btn ${indexFilter === tab ? 'active' : ''}`}
              onClick={() => {
                setIndexFilter(tab);
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Sector Filter Dropdown */}
        <div className="heatmap-sector-filter">
          <label htmlFor="heatmap-sector-select" className="filter-label">
            Sector:
          </label>
          <select
            id="heatmap-sector-select"
            className="heatmap-select"
            value={selectedSector}
            onChange={(e) => setSelectedSector(e.target.value)}
          >
            <option value="ALL">All Sectors ({availableSectors.length})</option>
            {availableSectors.map((sec) => (
              <option key={sec} value={sec}>
                {sec}
              </option>
            ))}
          </select>
        </div>

        {/* Search Input */}
        <div className="heatmap-search-box">
          <Icon name="search" size={14} />
          <input
            type="text"
            className="heatmap-search-input"
            placeholder="Highlight symbol (e.g. RELIANCE)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="heatmap-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Market Breadth & Color Legend Bar: Interactive Advances / Declines / Unchanged */}
      <div className="heatmap-summary-strip">
        <div className="heatmap-metrics-summary" role="toolbar" aria-label="Breadth Filters">
          <div className="metric-pill market-cap" title="Combined Market Capitalization">
            <span className="metric-tag">Market Cap:</span>
            <span className="metric-val">{formatCrores(scopeStats.totalCap)}</span>
          </div>

          <button
            type="button"
            className={`metric-pill clickable advances ${breadthFilter === 'ADVANCES' ? 'active' : ''}`}
            onClick={() => setBreadthFilter((prev) => (prev === 'ADVANCES' ? 'ALL' : 'ADVANCES'))}
            title={
              breadthFilter === 'ADVANCES'
                ? 'Showing advancing stocks. Click to show all stocks'
                : 'Click to filter advancing stocks only'
            }
            aria-pressed={breadthFilter === 'ADVANCES'}
          >
            <span className="metric-tag">Advances:</span>
            <span className="metric-val">
              {scopeStats.advances} ({scopeStats.advPercent}%)
            </span>
          </button>

          <button
            type="button"
            className={`metric-pill clickable declines ${breadthFilter === 'DECLINES' ? 'active' : ''}`}
            onClick={() => setBreadthFilter((prev) => (prev === 'DECLINES' ? 'ALL' : 'DECLINES'))}
            title={
              breadthFilter === 'DECLINES'
                ? 'Showing declining stocks. Click to show all stocks'
                : 'Click to filter declining stocks only'
            }
            aria-pressed={breadthFilter === 'DECLINES'}
          >
            <span className="metric-tag">Declines:</span>
            <span className="metric-val">
              {scopeStats.declines} ({scopeStats.decPercent}%)
            </span>
          </button>

          {scopeStats.unchanged > 0 && (
            <button
              type="button"
              className={`metric-pill clickable unchanged ${breadthFilter === 'UNCHANGED' ? 'active' : ''}`}
              onClick={() => setBreadthFilter((prev) => (prev === 'UNCHANGED' ? 'ALL' : 'UNCHANGED'))}
              title={
                breadthFilter === 'UNCHANGED'
                  ? 'Showing unchanged stocks. Click to show all stocks'
                  : 'Click to filter unchanged stocks only'
              }
              aria-pressed={breadthFilter === 'UNCHANGED'}
            >
              <span className="metric-tag">Unchanged:</span>
              <span className="metric-val">
                {scopeStats.unchanged} ({scopeStats.unchPercent}%)
              </span>
            </button>
          )}

          {breadthFilter !== 'ALL' && (
            <button
              type="button"
              className="metric-pill clickable reset-pill"
              onClick={() => setBreadthFilter('ALL')}
              title="Clear breadth filter and show all stocks"
            >
              <span className="reset-cross">✕</span>
              <span className="reset-text">Show All ({scopeStats.total})</span>
            </button>
          )}
        </div>

        {/* Color Scale Legend */}
        <div className="heatmap-legend">
          <span className="legend-label">Performance:</span>
          <div className="legend-scale">
            <span className="scale-swatch swatch-dark-red" title="-3% and lower">
              &le;-3%
            </span>
            <span className="scale-swatch swatch-red" title="-1% to -3%">
              -1%
            </span>
            <span className="scale-swatch swatch-neutral" title="Flat (0%)">
              0%
            </span>
            <span className="scale-swatch swatch-green" title="+1% to +3%">
              +1%
            </span>
            <span className="scale-swatch swatch-dark-green" title="+3% and higher">
              &ge;+3%
            </span>
          </div>
        </div>
      </div>

      {/* Treemap Interactive Canvas */}
      <div
        className="heatmap-canvas-container"
        ref={containerRef}
        style={{
          width: '100%',
          height: `${dimensions.height}px`,
          position: 'relative',
        }}
      >
        {sectorLayouts.length === 0 ? (
          <div className="heatmap-empty-state">
            <div className="empty-state-content">
              <p className="empty-state-msg">
                No stocks match the <b>{breadthFilter.toLowerCase()}</b> filter in{' '}
                <b>{selectedSector === 'ALL' ? indexFilter : selectedSector}</b>.
              </p>
              <button
                type="button"
                className="empty-state-btn"
                onClick={() => {
                  setBreadthFilter('ALL');
                  setSelectedSector('ALL');
                }}
              >
                Show All {indexFilter} Stocks
              </button>
            </div>
          </div>
        ) : (
          sectorLayouts.map((sectorBlock) => {
            const sRect = sectorBlock.rect;
            const isSectorHighlighted =
              queryClean &&
              sectorBlock.stocks.some(
                (st) =>
                  st.item.symbol.toLowerCase().includes(queryClean) ||
                  st.item.name.toLowerCase().includes(queryClean)
              );

            return (
              <div
                key={sectorBlock.sector}
                className={`heatmap-sector-group ${isSectorHighlighted ? 'highlighted-group' : ''}`}
                style={{
                  position: 'absolute',
                  left: `${sRect.x}px`,
                  top: `${sRect.y}px`,
                  width: `${sRect.w}px`,
                  height: `${sRect.h}px`,
                }}
              >
                {/* Sector Header */}
                <div
                  className="heatmap-sector-header"
                  style={{ width: `${sRect.w}px`, height: '26px' }}
                  title={`${sectorBlock.sector} • ${sectorBlock.stockCount} stocks • Avg Change: ${sectorBlock.avgChange >= 0 ? '+' : ''}${sectorBlock.avgChange.toFixed(2)}%`}
                >
                  <span className="sector-title">{sectorBlock.sector.toUpperCase()}</span>
                  {sRect.w > 140 && (
                    <span className="sector-count">
                      {sectorBlock.stockCount} {sectorBlock.stockCount === 1 ? 'stock' : 'stocks'}
                    </span>
                  )}
                </div>

                {/* Individual Stocks Inside Sector */}
                {sectorBlock.stocks.map((placedStock) => {
                  const stock = placedStock.item;
                  const rect = placedStock.rect;
                  const isMatch =
                    queryClean &&
                    (stock.symbol.toLowerCase().includes(queryClean) ||
                      stock.name.toLowerCase().includes(queryClean));
                  const isDimmed = queryClean && !isMatch;

                  const color = getHeatmapColor(stock.change);
                  const isPositive = stock.change > 0;
                  const changeSign = isPositive ? '+' : '';

                  // Responsive inner detail checks
                  const isWide = rect.w >= 65;
                  const isTall = rect.h >= 50;
                  const isLarge = rect.w >= 85 && rect.h >= 75;

                  return (
                    <Link
                      key={stock.symbol}
                      href={`/c/${stock.symbol}`}
                      className={`heatmap-tile ${isDimmed ? 'dimmed' : ''} ${isMatch ? 'matched' : ''}`}
                      style={{
                        position: 'absolute',
                        left: `${rect.x}px`,
                        top: `${rect.y}px`,
                        width: `${rect.w}px`,
                        height: `${rect.h}px`,
                        backgroundColor: color.bg,
                        borderColor: color.border,
                        color: color.text,
                      }}
                      onMouseEnter={(e) => {
                        const containerBounds = containerRef.current?.getBoundingClientRect();
                        const xPos = e.clientX - (containerBounds?.left ?? 0);
                        const yPos = e.clientY - (containerBounds?.top ?? 0);
                        setHoveredStock({ stock, x: xPos, y: yPos });
                      }}
                      onMouseMove={(e) => {
                        const containerBounds = containerRef.current?.getBoundingClientRect();
                        const xPos = e.clientX - (containerBounds?.left ?? 0);
                        const yPos = e.clientY - (containerBounds?.top ?? 0);
                        setHoveredStock((prev) => (prev ? { ...prev, x: xPos, y: yPos } : null));
                      }}
                      onMouseLeave={() => setHoveredStock(null)}
                      aria-label={`${stock.symbol}: ${changeSign}${stock.change.toFixed(2)}%`}
                    >
                      {isLarge ? (
                        <div className="tile-content-large">
                          <div className="tile-badge-symbol">
                            <span className="tile-monogram">{stock.symbol.slice(0, 2)}</span>
                            <span className="tile-symbol">{stock.symbol}</span>
                          </div>
                          <span className="tile-change">
                            {changeSign}
                            {stock.change.toFixed(2)}%
                          </span>
                          {rect.h >= 90 && (
                            <span className="tile-price">₹{stock.price.toLocaleString('en-IN')}</span>
                          )}
                        </div>
                      ) : isWide && isTall ? (
                        <div className="tile-content-medium">
                          <span className="tile-symbol">{stock.symbol}</span>
                          <span className="tile-change">
                            {changeSign}
                            {stock.change.toFixed(2)}%
                          </span>
                        </div>
                      ) : rect.w >= 40 && rect.h >= 24 ? (
                        <div className="tile-content-compact">
                          <span className="tile-symbol-compact">{stock.symbol}</span>
                          {rect.h >= 32 && (
                            <span className="tile-change-compact">
                              {changeSign}
                              {stock.change.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="tile-content-micro" title={`${stock.symbol} (${changeSign}${stock.change}%)`}>
                          <span className="tile-symbol-micro">{stock.symbol.slice(0, 3)}</span>
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })
        )}

        {/* Floating Tooltip Following Mouse */}
        {hoveredStock && (
          <div
            className="heatmap-tooltip"
            style={{
              left: `${Math.min(hoveredStock.x + 14, dimensions.width - 240)}px`,
              top: `${Math.min(hoveredStock.y + 14, dimensions.height - 180)}px`,
            }}
          >
            <div className="tooltip-header">
              <span className="tooltip-symbol">{hoveredStock.stock.symbol}</span>
              <span className={`tooltip-change ${hoveredStock.stock.change >= 0 ? 'bull' : 'bear'}`}>
                {hoveredStock.stock.change >= 0 ? '+' : ''}
                {hoveredStock.stock.change.toFixed(2)}%
              </span>
            </div>
            <div className="tooltip-name">{hoveredStock.stock.name}</div>
            <div className="tooltip-meta-grid">
              <div className="meta-row">
                <span className="meta-label">Sector:</span>
                <span className="meta-val">{hoveredStock.stock.sector}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Current Price:</span>
                <span className="meta-val">₹{hoveredStock.stock.price.toLocaleString('en-IN')}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Market Cap:</span>
                <span className="meta-val">{formatCrores(hoveredStock.stock.marketCap)}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Rank:</span>
                <span className="meta-val">#{hoveredStock.stock.rank} in {indexFilter}</span>
              </div>
            </div>
            <div className="tooltip-hint">Click to open company stories &amp; filings ↗</div>
          </div>
        )}
      </div>

      {/* Helpful Footer Note */}
      <footer className="heatmap-footer-note">
        <p>
          Market data is aggregated across NSE {indexFilter} listed equities and sized proportionally to market capitalization.
          Click any stock tile to explore its real-time corporate filings, regulatory disclosures, and news intelligence on BazaarPanic.
        </p>
      </footer>

      {/* Pro Refresh Unlock Modal for Guests */}
      {showUnlockModal && (
        <div
          className="heatmap-modal-backdrop"
          onClick={() => setShowUnlockModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="heatmap-modal-panel" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="heatmap-modal-close"
              onClick={() => setShowUnlockModal(false)}
              aria-label="Close"
            >
              ✕
            </button>

            <div className="heatmap-modal-header">
              <div className="heatmap-modal-pro-badge">
                <span className="heatmap-modal-pro-pill">100% FREE PRO FEATURE</span>
              </div>
              <h2 className="heatmap-modal-title">Sign in to Refresh Nifty Heatmap</h2>
              <p className="heatmap-modal-desc">
                Get on-demand live quotes, instant treemap recalculation, and 30-day corporate filings intelligence.
              </p>
            </div>

            <div className="heatmap-modal-features">
              <div className="heatmap-modal-feature-item">
                <span className="heatmap-modal-check">✓</span>
                <div>
                  <b>Instant Manual Refresh:</b> Recalculate live prices and market cap across Nifty 50, 100, and 200 on demand.
                </div>
              </div>
              <div className="heatmap-modal-feature-item">
                <span className="heatmap-modal-check">✓</span>
                <div>
                  <b>Deep Filings Stream:</b> 30 days of market-wide corporate disclosures, board meetings, and BSE/NSE filings.
                </div>
              </div>
              <div className="heatmap-modal-feature-item">
                <span className="heatmap-modal-check">✓</span>
                <div>
                  <b>200-Stock Watchlists:</b> Save, monitor, and sync up to 200 watchlist companies across your devices.
                </div>
              </div>
              <div className="heatmap-modal-feature-item">
                <span className="heatmap-modal-check">✓</span>
                <div>
                  <b>100% Free Forever:</b> No credit card required. Free instant sign-in with Google or Email.
                </div>
              </div>
            </div>

            <div className="heatmap-modal-actions">
              <Link href="/sign-in?next=/heatmap" className="heatmap-modal-primary-btn">
                Sign in for Free →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
