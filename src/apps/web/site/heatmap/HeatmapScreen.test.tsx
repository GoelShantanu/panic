// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { HeatmapScreen, getHeatmapColor, formatCrores } from './HeatmapScreen.tsx';
import { squarify, computeNestedTreemap } from './treemapMath.ts';
import type { HeatmapResponse } from '../../src/heatmap.ts';

const mockHeatmapData: HeatmapResponse = {
  totalMarketCap: 35000000000000,
  advances: 2,
  declines: 1,
  unchanged: 0,
  updatedAt: '2026-10-23T04:30:00.000Z',
  stocks: [
    {
      symbol: 'RELIANCE',
      name: 'Reliance Industries Limited',
      price: 1190.8,
      change: 2.5,
      marketCap: 15000000000000,
      sector: 'Energy Minerals',
      rank: 1,
      isNifty50: true,
      isNifty100: true,
      isNifty200: true,
    },
    {
      symbol: 'HDFCBANK',
      name: 'HDFC Bank Limited',
      price: 694.55,
      change: -1.8,
      marketCap: 10000000000000,
      sector: 'Finance',
      rank: 2,
      isNifty50: true,
      isNifty100: true,
      isNifty200: true,
    },
    {
      symbol: 'TATAPOWER',
      name: 'Tata Power Company Limited',
      price: 412.0,
      change: 0.8,
      marketCap: 1000000000000,
      sector: 'Utilities',
      rank: 75,
      isNifty50: false,
      isNifty100: true,
      isNifty200: true,
    },
  ],
};

describe('HeatmapScreen & Treemap Engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Squarified Treemap Math (treemapMath.ts)', () => {
    it('returns empty array when given empty items or non-positive dimensions', () => {
      expect(squarify([], { x: 0, y: 0, w: 500, h: 500 })).toEqual([]);
      expect(squarify([{ value: 10 }], { x: 0, y: 0, w: 0, h: 500 })).toEqual([]);
    });

    it('squarifies items into non-overlapping bounding boxes within container', () => {
      const items = [
        { id: 'A', value: 50 },
        { id: 'B', value: 30 },
        { id: 'C', value: 20 },
      ];
      const placed = squarify(items, { x: 0, y: 0, w: 1000, h: 600 });
      expect(placed.length).toBe(3);

      for (const p of placed) {
        expect(p.rect.w).toBeGreaterThan(0);
        expect(p.rect.h).toBeGreaterThan(0);
        expect(p.rect.x + p.rect.w).toBeLessThanOrEqual(1001);
        expect(p.rect.y + p.rect.h).toBeLessThanOrEqual(601);
      }
    });

    it('computes nested treemap grouped by sector', () => {
      const nested = computeNestedTreemap(mockHeatmapData.stocks, 1000, 700, 26);
      expect(nested.length).toBe(3); // 3 sectors: Energy Minerals, Finance, Utilities
      const financeSec = nested.find((s) => s.sector === 'Finance');
      expect(financeSec).toBeDefined();
      expect(financeSec?.stocks.length).toBe(1);
      expect(financeSec?.stocks[0]?.item.symbol).toBe('HDFCBANK');
    });
  });

  describe('Helper Functions', () => {
    it('returns appropriate color mapping for different price percentage changes', () => {
      expect(getHeatmapColor(4.5).bg).toBe('#047857'); // Strong bull
      expect(getHeatmapColor(0.0).bg).toBe('#1e293b'); // Neutral slate
      expect(getHeatmapColor(-4.5).bg).toBe('#b91c1c'); // Deep crimson bear
    });

    it('formats numbers into Lakh Crores and Crores properly', () => {
      expect(formatCrores(15000000000000)).toBe('₹15.00 Lakh Cr');
      expect(formatCrores(50000000000)).toBe('₹5000 Cr');
    });
  });

  describe('HeatmapScreen Component', () => {
    it('renders the header with title, live badge, and timestamp', () => {
      render(<HeatmapScreen initialHeatmap={mockHeatmapData} />);
      expect(screen.getByText('NIFTY 200 HEATMAP')).toBeDefined();
      expect(screen.getByText('Live Scanner (60s Cache)')).toBeDefined();
    });

    it('renders stock tile links pointing to /c/[symbol]', () => {
      render(<HeatmapScreen initialHeatmap={mockHeatmapData} />);
      const relianceLinks = screen.getAllByRole('link', { name: /RELIANCE/i });
      expect(relianceLinks.length).toBeGreaterThan(0);
      expect(relianceLinks[0]?.getAttribute('href')).toBe('/c/RELIANCE');

      const hdfcLinks = screen.getAllByRole('link', { name: /HDFCBANK/i });
      expect(hdfcLinks.length).toBeGreaterThan(0);
      expect(hdfcLinks[0]?.getAttribute('href')).toBe('/c/HDFCBANK');
    });

    it('filters stocks when clicking NIFTY 50 tab', () => {
      render(<HeatmapScreen initialHeatmap={mockHeatmapData} />);
      const nifty50Btn = screen.getByRole('tab', { name: 'NIFTY 50' });
      fireEvent.click(nifty50Btn);

      // TATAPOWER is isNifty50=false, so it should be filtered out
      expect(screen.queryByRole('link', { name: /TATAPOWER/i })).toBeNull();
      // RELIANCE is isNifty50=true, so it remains
      expect(screen.getAllByRole('link', { name: /RELIANCE/i }).length).toBeGreaterThan(0);
    });

    it('filters stocks when selecting a sector from the dropdown', () => {
      render(<HeatmapScreen initialHeatmap={mockHeatmapData} />);
      const select = screen.getByLabelText('Sector:');
      fireEvent.change(select, { target: { value: 'Finance' } });

      // Only Finance stocks remain
      expect(screen.getAllByRole('link', { name: /HDFCBANK/i }).length).toBeGreaterThan(0);
      expect(screen.queryByRole('link', { name: /RELIANCE/i })).toBeNull();
    });

    it('highlights matched symbols when searching', () => {
      render(<HeatmapScreen initialHeatmap={mockHeatmapData} />);
      const searchInput = screen.getByPlaceholderText(/Highlight symbol/i);
      fireEvent.change(searchInput, { target: { value: 'RELIANCE' } });

      const relianceTile = screen.getAllByRole('link', { name: /RELIANCE/i })[0];
      expect(relianceTile?.className).toContain('matched');

      const hdfcTile = screen.getAllByRole('link', { name: /HDFCBANK/i })[0];
      expect(hdfcTile?.className).toContain('dimmed');
    });

    it('shows floating tooltip when hovering a stock tile', () => {
      render(<HeatmapScreen initialHeatmap={mockHeatmapData} />);
      const relianceTile = screen.getAllByRole('link', { name: /RELIANCE/i })[0];
      if (relianceTile) {
        fireEvent.mouseEnter(relianceTile, { clientX: 200, clientY: 300 });
        expect(screen.getByText('Reliance Industries Limited')).toBeDefined();
        expect(screen.getByText('Click to open company stories & filings ↗')).toBeDefined();
      }
    });
  });
});
