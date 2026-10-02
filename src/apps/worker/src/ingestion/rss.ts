import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { canonicalUrl, isProbablyEnglish, normaliseHeadline } from '@stockpanic/core';
import type { CandidateRow } from '@stockpanic/db';

export class FeedParseError extends Error {}

export interface FeedEntry {
  title: string | null;
  link: string | null;
  guid: string | null;
  published: string | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => name === 'item' || name === 'entry' || name === 'link',
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
});

function text(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object' && '#text' in (value as Record<string, unknown>)) {
    return text((value as Record<string, unknown>)['#text']);
  }
  return null;
}

function atomLink(links: unknown): string | null {
  if (!Array.isArray(links)) return null;
  const objs = links.filter((l): l is Record<string, unknown> => typeof l === 'object' && l !== null);
  const alternate = objs.find((l) => l['@_rel'] === undefined || l['@_rel'] === 'alternate');
  return alternate ? text(alternate['@_href']) : null;
}

// RSS 2.0 and Atom (ingestion.md §4). Malformed XML is a fetch failure, never a crash.
export function parseFeed(xml: string): FeedEntry[] {
  if (XMLValidator.validate(xml) !== true) throw new FeedParseError('malformed XML');
  const doc = parser.parse(xml) as Record<string, any>;

  if (doc['rss']?.channel) {
    const items: unknown[] = doc['rss'].channel.item ?? [];
    return items.map((raw) => {
      const it = raw as Record<string, unknown>;
      const links = it['link'];
      return {
        title: text(it['title']),
        link: Array.isArray(links) ? text(links[0]) : text(links),
        guid: text(it['guid']),
        published: text(it['pubDate']) ?? text(it['dc:date']),
      };
    });
  }
  if (doc['feed']) {
    const entries: unknown[] = doc['feed'].entry ?? [];
    return entries.map((raw) => {
      const e = raw as Record<string, unknown>;
      return {
        title: text(e['title']),
        link: atomLink(e['link']),
        guid: text(e['id']),
        published: text(e['published']) ?? text(e['updated']),
      };
    });
  }
  throw new FeedParseError('not an RSS 2.0 or Atom document');
}

export interface CandidateSummary {
  candidates: CandidateRow[];
  discardedNonEnglish: number;
  discardedInvalid: number;
}

// Headline, link and timestamp only (PRD-002 US-002.5 AC-8); dedup by guid, else canonical URL.
export function toCandidates(entries: readonly FeedEntry[]): CandidateSummary {
  const candidates: CandidateRow[] = [];
  const seen = new Set<string>();
  let discardedNonEnglish = 0;
  let discardedInvalid = 0;
  for (const e of entries) {
    const headline = e.title ? normaliseHeadline(e.title) : '';
    const url = e.link ? canonicalUrl(e.link) : null;
    if (!headline || !url) {
      discardedInvalid++;
      continue;
    }
    if (!isProbablyEnglish(headline)) {
      discardedNonEnglish++;
      continue;
    }
    const dedupKey = e.guid ? `guid:${e.guid.trim()}` : `url:${url}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    const ms = e.published ? Date.parse(e.published) : Number.NaN;
    candidates.push({
      kind: 'article',
      dedupKey,
      headline,
      url,
      publishedAt: Number.isNaN(ms) ? null : new Date(ms),
      excerpt: null,
    });
  }
  return { candidates, discardedNonEnglish, discardedInvalid };
}
