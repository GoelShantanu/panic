import { describe, expect, it } from 'vitest';
import { ATOM_ONE_ENTRY, MALFORMED, RSS_MIXED_QUALITY, RSS_TWO_ITEMS } from './fixtures.ts';
import { conditionalGet, parseRetryAfter, USER_AGENT } from './http.ts';
import type { FetchLike } from './http.ts';
import { FeedParseError, parseFeed, toCandidates } from './rss.ts';

describe('parseFeed', () => {
  it('reads RSS 2.0 items, decoding CDATA and entities', () => {
    const entries = parseFeed(RSS_TWO_ITEMS);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.title).toBe('Asterion Industries board approves Q2 results & interim dividend');
    expect(entries[1]?.title).toBe('Kestrel Power wins ₹900 crore transmission order');
    expect(entries[0]?.guid).toBe('ex-1001');
  });

  it('reads Atom entries and picks the alternate link', () => {
    const [entry] = parseFeed(ATOM_ONE_ENTRY);
    expect(entry).toEqual({
      title: 'Order in the matter of Halcyon Ventures Ltd',
      link: 'https://regulator.example.in/orders/2026/101',
      guid: 'urn:example:order:101',
      published: '2026-10-05T06:30:00Z',
      description: null,
    });
  });

  it('treats malformed XML and non-feeds as parse errors', () => {
    expect(() => parseFeed(MALFORMED)).toThrow(FeedParseError);
    expect(() => parseFeed('<html><body>Not a feed</body></html>')).toThrow(FeedParseError);
  });

  it('parses feeds with unescaped ampersands in titles or descriptions', () => {
    const xml = `<rss version="2.0"><channel><item><title>M&M and L&T quarterly earnings</title><link>https://example.in/1</link></item></channel></rss>`;
    const entries = parseFeed(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.title).toBe('M&M and L&T quarterly earnings');
  });
});

describe('toCandidates', () => {
  it('keeps headline, canonical link and time only; dedups by guid', () => {
    const { candidates } = toCandidates(parseFeed(RSS_TWO_ITEMS));
    expect(candidates[0]).toEqual({
      kind: 'article',
      dedupKey: 'guid:ex-1001',
      headline: 'Asterion Industries board approves Q2 results & interim dividend',
      url: 'https://news.example.in/markets/asterion-q2',
      publishedAt: new Date('2026-10-05T04:35:00Z'),
      excerpt: null,
      relevance: { decision: 'keep', confidence: 0.94, reason: 'explicit market, policy, or financial signal', rulesVersion: 'market-v2' },
    });
  });

  it('discards non-English and invalid entries, and collapses URL duplicates', () => {
    const r = toCandidates(parseFeed(RSS_MIXED_QUALITY));
    expect(r.candidates.map((c) => c.dedupKey)).toEqual(['url:https://feed.example.in/orion']);
    expect(r.candidates[0]?.relevance?.decision).toBe('keep');
    expect(r.discardedNonEnglish).toBe(1);
    expect(r.discardedInvalid).toBe(2);
  });
});

describe('conditionalGet', () => {
  const respond =
    (status: number, body = '', headers: Record<string, string> = {}): FetchLike =>
    async () =>
      new Response(status === 304 ? null : body, { status, headers });

  it('sends validators and a user agent', async () => {
    let seen: Headers | undefined;
    const fetchImpl: FetchLike = async (_url, init) => {
      seen = new Headers(init?.headers);
      return new Response('<rss/>', { status: 200 });
    };
    await conditionalGet('https://feed.example.in/x', { etag: '"abc"', lastModified: 'Mon, 05 Oct 2026 04:00:00 GMT', fetchImpl });
    expect(seen?.get('if-none-match')).toBe('"abc"');
    expect(seen?.get('if-modified-since')).toBe('Mon, 05 Oct 2026 04:00:00 GMT');
    expect(seen?.get('user-agent')).toBe(USER_AGENT);
  });

  it('returns not_modified on 304', async () => {
    expect(await conditionalGet('u', { etag: '"a"', lastModified: null, fetchImpl: respond(304) })).toEqual({ status: 'not_modified' });
  });

  it('returns body and validators on 200', async () => {
    const r = await conditionalGet('u', {
      etag: null,
      lastModified: null,
      fetchImpl: respond(200, '<rss/>', { etag: '"v2"', 'last-modified': 'Mon, 05 Oct 2026 05:00:00 GMT' }),
    });
    expect(r).toEqual({ status: 'ok', body: '<rss/>', etag: '"v2"', lastModified: 'Mon, 05 Oct 2026 05:00:00 GMT' });
  });

  it('reports HTTP errors with Retry-After', async () => {
    const r = await conditionalGet('u', { etag: null, lastModified: null, fetchImpl: respond(503, '', { 'retry-after': '120' }) });
    expect(r).toEqual({ status: 'error', message: 'HTTP 503', retryAfterSeconds: 120 });
  });

  it('refuses oversize bodies', async () => {
    const r = await conditionalGet('u', { etag: null, lastModified: null, maxBytes: 10, fetchImpl: respond(200, 'x'.repeat(11)) });
    expect(r.status).toBe('error');
  });

  it('reports network failures without throwing', async () => {
    const r = await conditionalGet('u', {
      etag: null,
      lastModified: null,
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    expect(r).toEqual({ status: 'error', message: 'request failed: ECONNREFUSED', retryAfterSeconds: null });
  });

  it('parses Retry-After as seconds or an HTTP date', () => {
    const now = new Date('2026-10-05T04:00:00Z');
    expect(parseRetryAfter('30', now)).toBe(30);
    expect(parseRetryAfter('Mon, 05 Oct 2026 04:02:00 GMT', now)).toBe(120);
    expect(parseRetryAfter('garbage', now)).toBeNull();
  });
});
