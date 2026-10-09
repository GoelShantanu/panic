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

  it('keeps financial topics that previously accumulated in review', () => {
    for (const headline of ['Treasury yields ease before policy decision', 'Private credit attracts fresh funding', 'Gold prices fall ahead of Fed minutes', 'Retailer posts strong Q2 update', 'Oil prices rise as supply risks mount', 'Fund managers report higher AUM']) {
      expect(classifyMarketRelevance(headline, 'markets').decision).toBe('keep');
    }
  });

  it('distinguishes box-office money from an issuer financial result', () => {
    expect(classifyMarketRelevance('Fantasy film box office collection crosses Rs 200 crore', 'markets').decision).toBe('discard');
    expect(classifyMarketRelevance('Listed studio reports quarterly revenue after film release', 'general').decision).toBe('keep');
  });
  it.each([
    'He left an overseas job to grow vegetables, now earns Rs 3 lakh a month',
    'This Pune Engineer Earns Rs 6 Lakh From Growing Orchids',
  ])('holds personal-income headlines despite their currency figures: %s', headline => {
    expect(classifyMarketRelevance(headline,'markets').decision).toBe('review');
  });
  it('keeps an explicit issuer result even when discussing an individual',()=>{
    expect(classifyMarketRelevance('She reports company revenue growth to Rs 300 crore','markets').decision).toBe('keep');
  });
});
