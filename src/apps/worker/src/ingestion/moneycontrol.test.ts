import { describe, expect, it } from 'vitest';
import { toCandidates } from './rss.ts';
import { MONEYCONTROL_MARKETS_URL, moneycontrolMarketEntries } from './moneycontrol.ts';

const now = new Date('2026-10-19T07:00:00Z');

const sampleHtml = `
<html>
<body>
  <ul class="news-list">
    <li class="clearfix" id="newslist-0">
      <a href="https://www.moneycontrol.com/news/business/markets/it-stocks-surge-after-strong-results-14055245.html">
        <h2>IT stocks surge after strong Q2 results and guidance upgrade</h2>
      </a>
      <p>Major IT exporters gained up to 4% as demand commentary improved and deal pipelines expanded.</p>
    </li>
    <li class="clearfix" id="newslist-1">
      <a href="https://www.moneycontrol.com/news/business/markets/auto-ancillary-rally-continues-14055000.html">
        <h2>Auto ancillary shares continue northward journey on order wins</h2>
      </a>
      <p>Suppliers to commercial vehicle manufacturers rallied on expectation of volume recovery in H2.</p>
    </li>
    <li class="clearfix" id="newslist-2">
      <a href="https://evil.example.com/phishing/fake-news-123.html">
        <h2>Phishing article from unauthorized domain</h2>
      </a>
      <p>Untrusted content that should be rejected by host verification.</p>
    </li>
  </ul>
</body>
</html>
`;

describe('Moneycontrol direct HTML section adapter', () => {
  it('parses valid article list items with title, link, guid, and description', () => {
    const result = moneycontrolMarketEntries(sampleHtml, MONEYCONTROL_MARKETS_URL, now);
    expect(result.entries).toHaveLength(2);

    expect(result.entries[0]).toEqual({
      title: 'IT stocks surge after strong Q2 results and guidance upgrade',
      link: 'https://www.moneycontrol.com/news/business/markets/it-stocks-surge-after-strong-results-14055245.html',
      guid: 'mc-14055245',
      description: 'Major IT exporters gained up to 4% as demand commentary improved and deal pipelines expanded.',
      published: null,
      publisher: { name: 'Moneycontrol', url: 'https://www.moneycontrol.com' },
    });

    expect(result.entries[1]?.guid).toBe('mc-14055000');
    expect(result.latestPublishedAt).toEqual(now);
  });

  it('converts parsed entries to candidate rows with clean excerpts', () => {
    const result = moneycontrolMarketEntries(sampleHtml, MONEYCONTROL_MARKETS_URL, now);
    const { candidates } = toCandidates(result.entries, 'markets');

    expect(candidates).toHaveLength(2);
    expect(candidates[0]!.excerpt).toBe('Major IT exporters gained up to 4% as demand commentary improved and deal pipelines expanded.');
    expect(candidates[0]!.url).toBe('https://www.moneycontrol.com/news/business/markets/it-stocks-surge-after-strong-results-14055245.html');
  });

  it('rejects unexpected feed URL', () => {
    expect(() => moneycontrolMarketEntries(sampleHtml, 'https://example.com/invalid', now)).toThrow(
      'unexpected Moneycontrol markets URL',
    );
  });

  it('fails safely if page structure changes drastically', () => {
    const brokenHtml = '<html><body><div>No article list items here</div></body></html>' + 'x'.repeat(600);
    expect(() => moneycontrolMarketEntries(brokenHtml, MONEYCONTROL_MARKETS_URL, now)).toThrow(
      'Moneycontrol page returned no valid articles',
    );
  });
});
