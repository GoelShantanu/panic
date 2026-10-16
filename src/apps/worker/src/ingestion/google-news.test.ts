import { describe, expect, it } from 'vitest';
import { MONEYCONTROL_GOOGLE_FEED, moneycontrolGoogleEntries } from './google-news.ts';
import { latestFeedPublication, parseFeed, toCandidates } from './rss.ts';
import type { FeedEntry } from './rss.ts';

const now = new Date('2026-10-15T15:00:00Z');
const entry: FeedEntry = {
  title: 'Tech Mahindra Q2 profit rises 32% - Moneycontrol.com',
  link: 'https://news.google.com/rss/articles/CBMi_example?oc=5',
  guid: 'CBMi_example', published: 'Thu, 15 Oct 2026 11:37:02 GMT',
  description: '<a>Tech Mahindra Q2 profit rises 32%</a> Moneycontrol.com',
  publisher: { name: 'Moneycontrol.com', url: 'https://www.moneycontrol.com' },
};
const adapt = (entries: FeedEntry[]) => moneycontrolGoogleEntries(entries, MONEYCONTROL_GOOGLE_FEED, now).entries;

describe('Moneycontrol via Google News', () => {
  it('reads publisher attribution, cleans the suffix and never presents a headline as a summary', () => {
    const [parsed] = parseFeed(`<rss><channel><item><title>${entry.title}</title><link>${entry.link}</link><guid>${entry.guid}</guid><pubDate>${entry.published}</pubDate><description><![CDATA[${entry.description}]]></description><source url="https://www.moneycontrol.com">Moneycontrol.com</source></item></channel></rss>`);
    expect(parsed?.publisher).toEqual(entry.publisher);
    const result = toCandidates(adapt([parsed!]), 'business');
    expect(result.candidates).toEqual([expect.objectContaining({
      headline: 'Tech Mahindra Q2 profit rises 32%', excerpt: null,
      url: entry.link, dedupKey: 'guid:CBMi_example', publishedAt: new Date(entry.published!),
    })]);
  });

  it('rejects another publisher, spoofed hosts, unsafe links and missing attribution', () => {
    for (const publisher of [
      { name: 'Other newspaper', url: 'https://www.other.example' },
      { name: 'Moneycontrol.com', url: 'https://www.moneycontrol.com.evil.example' },
      { name: 'Moneycontrol.com', url: 'https://www.moneycontrol.com@evil.example' },
    ]) expect(() => adapt([{ ...entry, publisher }])).toThrow('no verified Moneycontrol entries');
    const { publisher, ...unattributed } = entry;
    expect(() => adapt([unattributed])).toThrow('no verified Moneycontrol entries');
    for (const link of ['https://news.google.com.evil.example/rss/articles/id', 'javascript:alert(1)', 'https://news.google.com/other']) {
      expect(() => adapt([{ ...entry, link }])).toThrow('no verified Moneycontrol entries');
    }
    expect(adapt([{ ...entry, publisher: { name: 'Other', url: 'https://other.example' } }, entry])).toEqual([expect.objectContaining({ title: 'Tech Mahindra Q2 profit rises 32%' })]);
  });

  it('excludes undated, future and old entries without manufacturing a recent publication', () => {
    const stale = [{ ...entry, published: '2024-04-23T10:00:00Z' }, { ...entry, published: null }, { ...entry, published: 'invalid' }, { ...entry, published: '2026-10-16T10:00:00Z' }];
    expect(adapt(stale)).toEqual([]);
    expect(latestFeedPublication(adapt(stale), now)).toBeNull();
    expect(moneycontrolGoogleEntries(stale, MONEYCONTROL_GOOGLE_FEED, now).latestPublishedAt).toEqual(new Date('2024-04-23T10:00:00Z'));
    expect(adapt([])).toEqual([]);
    expect(() => moneycontrolGoogleEntries([entry], 'https://other.example/feed', now)).toThrow('unexpected');
  });
});
