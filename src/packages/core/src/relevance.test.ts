import { describe, expect, it } from 'vitest';
import { classifyMarketRelevance } from './relevance.ts';

describe('market relevance gate', () => {
  it('keeps company, macro, and market-wide stories', () => {
    expect(classifyMarketRelevance('Experts expect RBI to raise rates amid inflation', 'markets').decision).toBe('keep');
    expect(classifyMarketRelevance('Kestrel Power wins Rs 900 crore transmission order', 'business').decision).toBe('keep');
    expect(classifyMarketRelevance('Sensex and Nifty open higher as institutional investors buy', 'general').decision).toBe('keep');
  });

  it('discards unmistakable entertainment headlines', () => {
    expect(classifyMarketRelevance('Bollywood actor announces a new film trailer', 'general')).toMatchObject({ decision: 'discard', confidence: 0.97 });
  });

  it('sends ambiguous business and office-commute stories to review', () => {
    expect(classifyMarketRelevance('Bengaluru office parks take the commute challenge into their own hands', 'business').decision).toBe('review');
    expect(classifyMarketRelevance('Asterion Industries announces a new community programme', 'markets').decision).toBe('review');
  });

  it('does not discard an entertainment business story with a clear market signal', () => {
    expect(classifyMarketRelevance('Listed studio reports quarterly revenue after a film release', 'general').decision).toBe('keep');
  });
});
