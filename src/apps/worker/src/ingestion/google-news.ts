import { normaliseHeadline } from '@stockpanic/core';
import { FeedParseError, latestFeedPublication } from './rss.ts';
import type { FeedEntry } from './rss.ts';

export const MONEYCONTROL_GOOGLE_FEED = 'https://news.google.com/rss/search?q=site%3Amoneycontrol.com%2Fnews%2Fbusiness%2F+when%3A2d&hl=en-IN&gl=IN&ceid=IN%3Aen';
export const MONEYCONTROL_GOOGLE_MAX_ITEMS = 10;

// Google supplies attribution and an outbound redirect, not a publisher excerpt.
// Keep this explicit adapter separate from the frozen direct publisher feeds.
export function moneycontrolGoogleEntries(entries: readonly FeedEntry[], feedUrl: string, now: Date): { entries: FeedEntry[]; latestPublishedAt: Date | null } {
  if (feedUrl !== MONEYCONTROL_GOOGLE_FEED) throw new FeedParseError('unexpected Moneycontrol Google News feed URL');
  const verified = entries.filter((entry) => {
    if (!entry.publisher || !entry.link) return false;
    try {
      const publisher = new URL(entry.publisher.url);
      const link = new URL(entry.link);
      return publisher.protocol === 'https:' && !publisher.username && !publisher.password && !publisher.port &&
        ['moneycontrol.com', 'www.moneycontrol.com'].includes(publisher.hostname) &&
        entry.publisher.name.toLowerCase() === 'moneycontrol.com' &&
        link.protocol === 'https:' && link.hostname === 'news.google.com' && !link.port && !link.username && !link.password &&
        /^\/rss\/articles\/[A-Za-z0-9_-]+$/.test(link.pathname);
    } catch { return false; }
  });
  // An attribution/format change must fail visibly rather than reporting a successful empty feed.
  if (entries.length && !verified.length) throw new FeedParseError('Google News returned no verified Moneycontrol entries');
  const recent = verified.flatMap((entry) => {
    const at = entry.published ? Date.parse(entry.published) : Number.NaN;
    if (!Number.isFinite(at) || at > now.getTime() || at < now.getTime() - 2 * 86_400_000) return [];
    return [{ ...entry, title: entry.title ? normaliseHeadline(entry.title).replace(/ - Moneycontrol\.com$/i, '') : null, description: null }];
  });
  return { entries: recent, latestPublishedAt: latestFeedPublication(verified, now) };
}
