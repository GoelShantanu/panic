import { describe, expect, it } from 'vitest';
import { toCandidates } from './rss.ts';
import type { FeedEntry } from './rss.ts';
import { ZEE_BUSINESS_FEED, zeeBusinessEntries } from './zee-business.ts';

const now = new Date('2026-10-16T06:00:00Z');
const entry = (overrides: Partial<FeedEntry> = {}): FeedEntry => ({
  title:'Example Industries shares rise after Q2 results', link:'https://www.zeebiz.com/market-news/news-example-results-404050',
  guid:'example-404050',published:'Fri, 16 Oct 2026 11:00:00 +0530',description:'Example Industries reported healthy quarterly growth with strong operating margins.',...overrides,
});
const adapt = (entries: FeedEntry[]) => zeeBusinessEntries(entries,ZEE_BUSINESS_FEED,now);
describe('Zee Business market RSS selection', () => {
  it('accepts publisher market-news, stocks and IPO article routes and preserves descriptions', () => {
    const result = adapt([
      entry(),entry({link:'https://www.zeebiz.com/markets/stocks/news-example-update-404051'}),
      entry({link:'https://www.zeebiz.com/markets/ipo/news-example-ipo-404052'}),
    ]);
    expect(result.entries).toHaveLength(3);
    expect(result.entries.every(e=>e.description!==null)).toBe(true);
    expect(result.latestPublishedAt).toEqual(new Date('2026-10-16T05:30:00Z'));
    const candidates = toCandidates(result.entries, 'markets');
    expect(candidates.candidates[0]!.excerpt).toContain('Example Industries reported healthy quarterly growth');
  });
  it.each([
    'https://www.zeebiz.com/automobile/news-stock-car-404053',
    'https://www.zeebiz.com/trending/entertainment/news-film-404053',
    'https://www.zeebiz.com/personal-finance/news-savings-404053',
    'https://www.zeebiz.com/market-newsletter/news-stock-404053',
    'https://www.zeebiz.com/market-news/',
    'https://www.zeebiz.com.evil.example/market-news/news-stock-404053',
    'https://evil.example/market-news/news-stock-404053',
    'http://www.zeebiz.com/market-news/news-stock-404053',
    'https://user:password@www.zeebiz.com/market-news/news-stock-404053',
    'https://www.zeebiz.com:8443/market-news/news-stock-404053',
    'not a URL',
  ])('rejects a non-market or untrusted link: %s', link => {
    expect(adapt([entry({link})])).toEqual({entries:[],latestPublishedAt:null});
  });
  it('filters missing, invalid, future and older dates while preserving the age of a frozen section', () => {
    const old='Tue, 23 Apr 2024 17:00:00 +0530';
    const result=adapt([entry({published:old}),entry({published:null}),entry({published:'invalid'}),entry({published:'2026-10-17T06:00:00Z'})]);
    expect(result.entries).toEqual([]);
    expect(result.latestPublishedAt).toEqual(new Date(old));
  });
  it('does not let a newer entertainment item make old market content appear current', () => {
    expect(adapt([entry({published:'2024-04-23T06:00:00Z'}),entry({link:'https://www.zeebiz.com/trending/entertainment/news-film-404053'})]).latestPublishedAt)
      .toEqual(new Date('2024-04-23T06:00:00Z'));
  });
  it('still applies relevance and language checks within a permitted section', () => {
    const result=toCandidates(adapt([entry({title:'A new office opens in Mumbai'})]).entries,'markets');
    expect(result.heldForReview).toBe(1);
    expect(result.candidates.filter(c=>c.relevance?.decision==='keep')).toHaveLength(0);
  });
  it('refuses an unexpected feed URL before interpreting it as Zee Business', () => {
    expect(()=>zeeBusinessEntries([entry()],'https://evil.example/latest.xml',now)).toThrow('unexpected Zee Business feed URL');
  });
});
