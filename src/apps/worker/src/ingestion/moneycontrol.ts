import { FeedParseError } from './rss.ts';
import type { FeedEntry } from './rss.ts';

export const MONEYCONTROL_MARKETS_URL = 'https://www.moneycontrol.com/news/business/markets/';
export const MONEYCONTROL_MAX_ITEMS = 15;

export function moneycontrolMarketEntries(html: string, pageUrl: string, now: Date): {
  entries: FeedEntry[];
  latestPublishedAt: Date | null;
} {
  if (pageUrl !== MONEYCONTROL_MARKETS_URL) {
    throw new FeedParseError('unexpected Moneycontrol markets URL');
  }

  const listItems = html.match(/<li[^>]*id="newslist-[0-9]+"[^>]*>[\s\S]*?<\/li>/gi) || [];
  if (!listItems.length && html.length > 500) {
    throw new FeedParseError('Moneycontrol page returned no valid articles');
  }

  const entries: FeedEntry[] = [];
  for (const itemHtml of listItems) {
    const linkMatch = itemHtml.match(/<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/i)
      || itemHtml.match(/<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/i);
    if (!linkMatch) continue;

    const rawLink = linkMatch[1]?.trim();
    const rawTitle = linkMatch[2]?.replace(/<[^>]+>/g, '').trim();

    const descMatch = itemHtml.match(/<p>([\s\S]*?)<\/p>/i);
    const rawDesc = descMatch ? descMatch[1]?.replace(/<[^>]+>/g, '').trim() : null;

    if (!rawLink || !rawTitle) continue;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawLink);
    } catch {
      continue;
    }

    if (
      parsedUrl.protocol !== 'https:' ||
      !['www.moneycontrol.com', 'moneycontrol.com'].includes(parsedUrl.hostname) ||
      parsedUrl.port ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      continue;
    }

    if (!parsedUrl.pathname.startsWith('/news/')) {
      continue;
    }

    const idMatch = parsedUrl.pathname.match(/-([0-9]+)\.html$/);
    const guid = idMatch ? `mc-${idMatch[1]}` : rawLink;

    entries.push({
      title: rawTitle,
      link: rawLink,
      guid,
      description: rawDesc && rawDesc.length >= 20 ? rawDesc : null,
      published: null,
      publisher: { name: 'Moneycontrol', url: 'https://www.moneycontrol.com' },
    });
  }

  if (listItems.length > 0 && entries.length === 0) {
    throw new FeedParseError('Moneycontrol page articles failed validation');
  }

  return {
    entries: entries.slice(0, MONEYCONTROL_MAX_ITEMS),
    latestPublishedAt: entries.length > 0 ? now : null,
  };
}
