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

  it('strictly discards stories with Box Office Collection or Bollywood regardless of financial keywords', () => {
    const headlines = [
      'Drishyam 3: The Conclusion Box Office Collection: Film Marks Ajay Devgn’s Best Yet, Nears Rs 200 Crore Net',
      'Meesaya Murukku 2 Box Office Collection Day 11: Hiphop Tamizha Starrer Sees Sharp Slide — Check Earnings',
      'Drishyam 3 Box Office Collection Day 5: Ajay Devgn Starrer Crosses Rs 200 Crore In India',
      'Jailer 2 Box Office Collection Day 4: Rajinikanth Starrer Holds Strong As Weekend Continues, Check Earnings',
      'Prahaar Box Office Collection Day 3: Rajkummar Rao Starrer Sees A Rise In Weekend Collections, Check Earnings',
      'Hema Malini’s Bollywood Journey Was Not Easy, She Was Fired Before Her First Film',
      'When Wait Staff Touched Bollywood Actress’ Feet: Hotmail Co-Founder Recalls Moment That Left American Friends Bewildered',
      'Bollywood actor buys Rs 50 crore apartment in Mumbai',
      'Bollywood studio announces IPO plans after box office record',
    ];
    for (const headline of headlines) {
      expect(classifyMarketRelevance(headline, 'markets').decision).toBe('discard');
      expect(classifyMarketRelevance(headline, 'business').decision).toBe('discard');
      expect(classifyMarketRelevance(headline, 'general').decision).toBe('discard');
    }
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
  it('holds a personal profile despite a past startup valuation, preserving a new funding event',()=>{
    expect(classifyMarketRelevance('At 17, she founded a startup valued at Rs 200 crore. Here’s her story','markets').decision).toBe('review');
    expect(classifyMarketRelevance('She raises funds for her company. Here’s her story','business').decision).toBe('keep');
  });
});
