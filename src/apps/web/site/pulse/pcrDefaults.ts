import type { PcrData } from '../../src/pulse.ts';

export const CLIENT_DEFAULT_PCR: PcrData = {
  status: 'live',
  nifty: {
    symbol: 'NIFTY',
    name: 'NIFTY 50',
    pcr: 1.18,
    sentiment: 'bullish',
    sentimentLabel: 'BULLISH SUPPORT (PUT WRITING)',
    putOi: 14_250_000,
    callOi: 12_080_000,
  },
  bankNifty: {
    symbol: 'BANKNIFTY',
    name: 'BANK NIFTY',
    pcr: 0.84,
    sentiment: 'neutral',
    sentimentLabel: 'NEUTRAL / RESISTANCE',
    putOi: 8_120_000,
    callOi: 9_640_000,
  },
  lastConfirmedAt: '14:30 IST',
  updatedAt: new Date().toISOString(),
};

export const CLIENT_FALLBACK_PCR: PcrData = {
  status: 'paused',
  nifty: {
    symbol: 'NIFTY',
    name: 'NIFTY 50',
    pcr: 1.18,
    sentiment: 'bullish',
    sentimentLabel: 'BULLISH SUPPORT (PUT WRITING)',
    putOi: 14_250_000,
    callOi: 12_080_000,
  },
  bankNifty: {
    symbol: 'BANKNIFTY',
    name: 'BANK NIFTY',
    pcr: 0.84,
    sentiment: 'neutral',
    sentimentLabel: 'NEUTRAL / RESISTANCE',
    putOi: 8_120_000,
    callOi: 9_640_000,
  },
  lastConfirmedAt: '14:30 IST',
  notice: 'Exchange feed paused • Background retry in progress (No impact on cash breadth)',
  updatedAt: new Date().toISOString(),
};
