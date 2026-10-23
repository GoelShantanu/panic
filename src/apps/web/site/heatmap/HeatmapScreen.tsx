'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { Icon } from '../Icon.tsx';
import type { HeatmapStock, HeatmapResponse } from '../../src/heatmap.ts';
import { computeNestedTreemap } from './treemapMath.ts';
import type { SectorLayout } from './treemapMath.ts';
import './heatmap.css';

interface HeatmapScreenProps {
  initialHeatmap: HeatmapResponse;
}

export type IndexFilter = 'NIFTY 50' | 'NIFTY 100' | 'NIFTY 200';

export function getHeatmapColor(change: number): { bg: string; border: string; text: string } {
  if (change >= 4.0) return { bg: '#047857', border: '#10b981', text: '#ecfdf5' };
  if (change >= 2.0) return { bg: '#065f46', border: '#059669', text: '#ecfdf5' };
  if (change >= 0.3) return { bg: '#064e3b', border: '#047857', text: '#d1fae5' };
  if (change > -0.3) return { bg: '#1e293b', border: '#334155', text: '#e2e8f0' };
  if (change > -2.0) return { bg: '#7f1d1d', border: '#991b1b', text: '#fee2e2' };
  if (change > -4.0) return { bg: '#991b1b', border: '#dc2626', text: '#fef2f2' };
  return { bg: '#b91c1c', border: '#ef4444', text: '#ffffff' };
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

export function HeatmapScreen({ initialHeatmap }: HeatmapScreenProps) {
  const [data, setData] = useState<HeatmapResponse>(initialHeatmap);
  const [indexFilter, setIndexFilter] = useState<IndexFilter>('NIFTY 200');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>(initialHeatmap.updatedAt);
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

  // Measure container dimensions responsively
  useEffect(() => {
    function updateSize() {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const w = Math.max(340, Math.floor(rect.width));
        // Responsive height: minimum 680px, max 820px or 75vh
        const h = Math.max(620, Math.min(840, Math.floor(window.innerHeight * 0.76)));
        setDimensions({ width: w, height: h });
      }
    }

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Filter stocks based on index scope and sector
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

    return list;
  }, [data.stocks, indexFilter, selectedSector]);

  // Distinct sectors available for dropdown
  const availableSectors = useMemo(() => {
    const set = new Set<string>();
    for (const s of data.stocks) {
      if (s.sector) set.add(s.sector);
    }
    return Array.from(set).sort();
  }, [data.stocks]);

  // Compute summary stats for the active filter
  const activeStats = useMemo(() => {
    let advances = 0;
    let declines = 0;
    let unchanged = 0;
    let totalCap = 0;

    for (const s of filteredStocks) {
      totalCap += s.marketCap;
      if (s.change > 0) advances++;
      else if (s.change < 0) declines++;
      else unchanged++;
    }

    const total = filteredStocks.length;
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
  }, [filteredStocks]);

  // Compute squarified layout
  const sectorLayouts: SectorLayout<HeatmapStock>[] = useMemo(() => {
    return computeNestedTreemap(
      filteredStocks,
      dimensions.width,
      dimensions.height,
      28 // Header height for sector banner
    );
  }, [filteredStocks, dimensions.width, dimensions.height]);

  // Manual refresh handler
  async function handleRefresh() {
    if (isRefreshing) return;
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
    } catch {
      // Keep existing data on error
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
            <span>NIFTY 200 HEATMAP</span>
          </h1>
          <p className="heatmap-subtitle">
            Live market capitalization &amp; price action treemap grouped by sector. Sized by market cap, colored by % change.
          </p>
        </div>

        <div className="heatmap-header-controls">
          <div className="heatmap-live-badge" title="Data refreshed from live exchange scanner">
            <span className="heatmap-live-dot" />
            <span className="heatmap-live-text">Live Scanner (60s Cache)</span>
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
            <button
              type="button"
              className={`heatmap-refresh-btn ${isRefreshing ? 'refreshing' : ''}`}
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh stock quotes now"
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
              <span>{isRefreshing ? 'Updating...' : 'Refresh'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Control Bar: Index Pills, Sector Selector, Search */}
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
              onClick={() => setIndexFilter(tab)}
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

      {/* Market Breadth & Color Legend Bar */}
      <div className="heatmap-summary-strip">
        <div className="heatmap-metrics-summary">
          <div className="metric-pill market-cap">
            <span className="metric-tag">Market Cap:</span>
            <span className="metric-val">{formatCrores(activeStats.totalCap)}</span>
          </div>
          <div className="metric-pill advances">
            <span className="metric-tag">Advances:</span>
            <span className="metric-val">
              {activeStats.advances} ({activeStats.advPercent}%)
            </span>
          </div>
          <div className="metric-pill declines">
            <span className="metric-tag">Declines:</span>
            <span className="metric-val">
              {activeStats.declines} ({activeStats.decPercent}%)
            </span>
          </div>
          {activeStats.unchanged > 0 && (
            <div className="metric-pill unchanged">
              <span className="metric-tag">Unchanged:</span>
              <span className="metric-val">
                {activeStats.unchanged} ({activeStats.unchPercent}%)
              </span>
            </div>
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
        {sectorLayouts.map((sectorBlock) => {
          const sRect = sectorBlock.rect;
          const isSectorHighlighted =
            queryClean &&
            sectorBlock.stocks.some((st) =>
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
        })}

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
                <span className="meta-val">#{hoveredStock.stock.rank} in Nifty 200</span>
              </div>
            </div>
            <div className="tooltip-hint">Click to open company stories &amp; filings ↗</div>
          </div>
        )}
      </div>

      {/* Helpful Footer Note */}
      <footer className="heatmap-footer-note">
        <p>
          Market data is aggregated across NSE top 200 listed equities and sized proportionally to market capitalization.
          Click any stock tile to explore its real-time corporate filings, regulatory disclosures, and news intelligence on BazaarPanic.
        </p>
      </footer>
    </div>
  );
}
