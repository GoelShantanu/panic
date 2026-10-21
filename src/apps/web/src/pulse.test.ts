import { describe, expect, it } from 'vitest';
import { calculateLivePcr, computePcrSentiment, fetchPcrData } from './pulse.ts';

describe('F&O Derivatives PCR Dynamic Calculation (pulse.ts)', () => {
  it('calculates bullish PCR and writing support during strong market breadth', () => {
    const fixedTime = new Date('2026-10-21T06:00:00Z'); // 11:30 AM IST (market open)
    const pcr = calculateLivePcr(
      {
        niftyChangePct: 0.95,
        bankNiftyChangePct: 1.25,
        breadthRatio: 2.1,
        vix: 13.1,
      },
      fixedTime
    );

    expect(pcr.status).toBe('live');
    expect(pcr.nifty.pcr).toBeGreaterThan(1.15);
    expect(pcr.nifty.sentiment).toBe('bullish');
    expect(pcr.nifty.putOi).toBeGreaterThan(pcr.nifty.callOi);
    expect(pcr.bankNifty.pcr).toBeGreaterThan(1.15);
    expect(pcr.lastConfirmedAt).toContain('IST');
  });

  it('calculates bearish PCR and call writing resistance during weak market breadth', () => {
    const fixedTime = new Date('2026-10-21T06:00:00Z'); // 11:30 AM IST
    const pcr = calculateLivePcr(
      {
        niftyChangePct: -0.65,
        bankNiftyChangePct: -1.15,
        breadthRatio: 0.35,
        vix: 15.8,
      },
      fixedTime
    );

    expect(pcr.status).toBe('live');
    expect(pcr.nifty.pcr).toBeLessThan(0.95);
    expect(pcr.nifty.sentiment === 'bearish' || pcr.nifty.sentiment === 'strong_bearish').toBe(true);
    expect(pcr.nifty.callOi).toBeGreaterThan(pcr.nifty.putOi);
    expect(pcr.bankNifty.pcr).toBeLessThan(0.85);
  });

  it('categorizes sentiment bands accurately across all 5 zones', () => {
    expect(computePcrSentiment(1.45).sentiment).toBe('strong_bullish');
    expect(computePcrSentiment(1.22).sentiment).toBe('bullish');
    expect(computePcrSentiment(1.02).sentiment).toBe('neutral');
    expect(computePcrSentiment(0.82).sentiment).toBe('bearish');
    expect(computePcrSentiment(0.58).sentiment).toBe('strong_bearish');
  });

  it('fetchPcrData returns dynamic PCR when no external feed is set', async () => {
    const data = await fetchPcrData(undefined, undefined, {
      niftyChangePct: 0.1,
      bankNiftyChangePct: 0.2,
      breadthRatio: 1.1,
    });
    expect(data.status).toBe('live');
    expect(typeof data.nifty.pcr).toBe('number');
    expect(data.nifty.putOi).toBeGreaterThan(0);
    expect(data.nifty.callOi).toBeGreaterThan(0);
  });
});
