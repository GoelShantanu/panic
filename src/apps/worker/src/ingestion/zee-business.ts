import { FeedParseError, latestFeedPublication } from './rss.ts';
import type { FeedEntry } from './rss.ts';

export const ZEE_BUSINESS_FEED = 'https://www.zeebiz.com/latest.xml';
export const ZEE_BUSINESS_MAX_ITEMS = 10;
const MAX_AGE_MS = 48 * 60 * 60 * 1000;

export function zeeBusinessEntries(entries: readonly FeedEntry[], feedUrl: string, now: Date): {
  entries: FeedEntry[]; latestPublishedAt: Date | null;
} {
  if (feedUrl !== ZEE_BUSINESS_FEED) throw new FeedParseError('unexpected Zee Business feed URL');
  const verified = entries.filter(entry => {
    if (!entry.link) return false;
    try {
      const url = new URL(entry.link.trim());
      return url.protocol === 'https:' && url.hostname === 'www.zeebiz.com' && !url.port && !url.username && !url.password
        && /^\/(?:market-news|markets\/(?:stocks|ipo))\/news-[a-z0-9-]+-\d+\/?$/i.test(url.pathname);
    } catch { return false; }
  });
  // Unrelated recent articles cannot certify that the stock-market section is current.
  const latestPublishedAt = latestFeedPublication(verified, now);
  return {
    entries: verified.filter(entry => {
      const at = entry.published ? Date.parse(entry.published) : Number.NaN;
      return Number.isFinite(at) && at <= now.getTime() && now.getTime() - at <= MAX_AGE_MS;
    }),
    latestPublishedAt,
  };
}
