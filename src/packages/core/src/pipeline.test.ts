import { describe, expect, it } from 'vitest';
import {
  AliasIndex,
  attachScore,
  classifyFiling,
  classifyHeadline,
  combineEventTypes,
  extractNumbers,
  filingExplainsStory,
  headlineShingles,
  isExchangeTwin,
  jaccard,
  lshBands,
  normaliseName,
  pairScore,
  wordSet,
} from './index.ts';
import type { FilingFeatures, ItemFeatures } from './index.ts';

// All companies and headlines below are fictional.

describe('text features', () => {
  it('normalises company names without suffixes', () => {
    expect(normaliseName('Asterion Industries Limited')).toBe('asterion industries');
    expect(normaliseName('Kestrel Power Pvt. Ltd.')).toBe('kestrel power');
    expect(normaliseName('Orion & Sons Ltd')).toBe('orion and sons');
  });

  it('extracts figures, ignoring labels like Q2 and FY27', () => {
    expect(extractNumbers('Asterion Q2 FY27 profit at ₹1,412 crore, up 18%')).toEqual(['1412', '18']);
    expect(extractNumbers('No figures in Q3 H1 update')).toEqual([]);
  });

  it('builds word 3-shingles without stop words', () => {
    expect(headlineShingles('Kestrel Power wins order in Gujarat')).toEqual([
      'kestrel power wins',
      'power wins order',
      'wins order gujarat',
    ]);
  });

  it('identical headlines share every LSH band; unrelated ones share none', () => {
    const a = lshBands(headlineShingles('Orion Cables board approves capex plan for new plant'));
    const b = lshBands(headlineShingles('Orion Cables board approves capex plan for new plant'));
    const c = lshBands(headlineShingles('Meridian Textiles promoter releases pledge on stake'));
    expect(a).toHaveLength(16);
    expect(a).toEqual(b);
    expect(a.filter((x) => c.includes(x))).toHaveLength(0);
  });

  it('jaccard similarity', () => {
    expect(jaccard(['a', 'b'], ['a', 'b'])).toBe(1);
    expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
    expect(jaccard([], [])).toBe(0);
  });
});

describe('rule classification (PRD-004 §1)', () => {
  it('classifies filing subjects', () => {
    expect(classifyFiling('Outcome of Board Meeting held on 05.10.2026', null)).toEqual(['board_outcome']);
    expect(classifyFiling('Financial Results for the quarter ended September 30, 2026', 'Result')).toEqual(['results']);
    expect(classifyFiling('Disclosure under Regulation 29 of SEBI (SAST) Regulations', null)).toEqual(['insider_sast']);
    expect(classifyFiling('Outcome of Board Meeting - Bonus Issue', null)).toEqual(['board_outcome', 'corporate_action']);
  });

  it('routine filings are exclusive even when they quote other regulations', () => {
    expect(classifyFiling('Closure of Trading Window under SEBI (Prohibition of Insider Trading) Regulations', null)).toEqual([
      'trading_window',
    ]);
    expect(classifyFiling('Prior Intimation of Board Meeting to consider Financial Results', null)).toEqual(['board_intimation']);
    expect(classifyFiling('Copy of Newspaper Publication', null)).toEqual(['routine_compliance']);
  });

  it('classifies headlines and falls back to other', () => {
    expect(classifyHeadline('Kestrel Power wins ₹900 crore transmission order')).toEqual(['order_contract']);
    expect(classifyHeadline('Asterion Industries Q2 profit rises 18%')).toEqual(['results']);
    expect(classifyHeadline('Sensex ends 300 points higher')).toEqual(['macro']);
    expect(classifyHeadline('Orion Cables chairman speaks at industry event')).toEqual(['other']);
  });

  it('never returns more than three types, and drops other when specific types exist', () => {
    expect(combineEventTypes([['other'], ['results']])).toEqual(['results']);
    expect(combineEventTypes([['other'], ['other']])).toEqual(['other']);
    expect(combineEventTypes([['results', 'dividend'], ['pledge', 'rating']])).toHaveLength(3);
  });
});

describe('rule-only tagging (entity-resolution.md §4–5)', () => {
  const index = new AliasIndex([
    { isin: 'ISIN_A', text: 'Asterion Industries Limited', source: 'name', ambiguous: false, commonWord: false },
    { isin: 'ISIN_K', text: 'Kestrel Power Ltd', source: 'name', ambiguous: false, commonWord: false },
    { isin: 'ISIN_K', text: 'Kestrel', source: 'alias', ambiguous: false, commonWord: false },
    { isin: 'ISIN_H1', text: 'Halcyon', source: 'alias', ambiguous: false, commonWord: false },
    { isin: 'ISIN_H2', text: 'Halcyon', source: 'alias', ambiguous: false, commonWord: false },
    { isin: 'ISIN_T', text: 'Trend', source: 'alias', ambiguous: false, commonWord: true },
    { isin: 'ISIN_G', text: 'Gamma Group', source: 'alias', ambiguous: true, commonWord: false },
  ]);

  it('matches exact names with or without the corporate suffix', () => {
    expect(index.resolve('Asterion Industries Ltd posts record order book').isins).toEqual(['ISIN_A']);
    expect(index.resolve('Asterion Industries posts record order book').isins).toEqual(['ISIN_A']);
  });

  it('matches curated aliases', () => {
    expect(index.resolve('Kestrel bags transmission contract').isins).toEqual(['ISIN_K']);
  });

  it('a name shared by several companies is unresolved, never guessed', () => {
    expect(index.resolve('Halcyon plans ₹10,000 crore investment')).toEqual({ isins: [], unresolved: ['Halcyon'] });
  });

  it('an alias flagged ambiguous is unresolved', () => {
    expect(index.resolve('Gamma Group restructures').unresolved).toEqual(['Gamma Group']);
  });

  it('a common-word alias matches only in ticker casing', () => {
    expect(index.resolve('Trend of rising rates worries lenders').isins).toEqual([]);
    expect(index.resolve('TREND shares jump after store expansion').isins).toEqual(['ISIN_T']);
  });

  it('unknown companies produce nothing', () => {
    expect(index.resolve('Orion Cables to invest in new plant')).toEqual({ isins: [], unresolved: [] });
  });

  // Hazards found on real headlines in QA (D-049). Fictional companies stand in for the real ones.
  const qa = new AliasIndex([
    { isin: 'ISIN_TAKE', text: 'TAKE Limited', source: 'name', ambiguous: false, commonWord: false },
    { isin: 'ISIN_BSE', text: 'BSE Limited', source: 'name', ambiguous: false, commonWord: false },
    { isin: 'ISIN_N', text: 'Nimbus Limited', source: 'name', ambiguous: false, commonWord: false },
    { isin: 'ISIN_NG', text: 'Nimbus Green Energy Limited', source: 'name', ambiguous: false, commonWord: false },
    { isin: 'ISIN_CV', text: 'Orbit Motors Limited', source: 'name', ambiguous: false, commonWord: false },
    { isin: 'ISIN_PV', text: 'Orbit Motors', source: 'alias', ambiguous: true, commonWord: false },
  ]);

  it('a company name written in lower case is ordinary words', () => {
    expect(qa.resolve('Petronet LNG chief to take over in May').isins).toEqual([]);
    expect(qa.resolve('Take shares rally on order win').isins).toEqual(['ISIN_TAKE']);
  });

  it('BSE beside NSE is the exchanges, not BSE Limited', () => {
    expect(qa.resolve('Are NSE, BSE closed for Gandhi Jayanti?')).toEqual({ isins: [], unresolved: [] });
    expect(qa.resolve('BSE shares hit record on derivatives volumes').isins).toEqual(['ISIN_BSE']);
  });

  it('the start of a longer listed name is unresolved, not the shorter company', () => {
    expect(qa.resolve('Top picks: Sagility, Nimbus Green, Ujjivan')).toEqual({ isins: [], unresolved: ['Nimbus Green'] });
    expect(qa.resolve('Nimbus Green Energy commissions solar park').isins).toEqual(['ISIN_NG']);
    expect(qa.resolve('Nimbus shares rise 3%').isins).toEqual(['ISIN_N']);
  });

  // PRD-002 US-002.9: each naming hazard is a test case (entity-resolution.md §4.1). Dual listing and
  // reused tickers are registry properties, tested in packages/db registry.integration.test.ts.
  const hz = new AliasIndex([
    { isin: 'ISIN_OM', text: 'Orbit Motors Passenger Vehicles Limited', source: 'name', ambiguous: false, commonWord: false },
    { isin: 'ISIN_OS', text: 'Orbit Steel Limited', source: 'name', ambiguous: false, commonWord: false },
    { isin: 'ISIN_OS', text: 'Orbit', source: 'alias', ambiguous: true, commonWord: false },
    { isin: 'ISIN_IN', text: 'Infotech Systems Limited', source: 'name', ambiguous: false, commonWord: false },
    { isin: 'ISIN_IN', text: 'Infy', source: 'alias', ambiguous: false, commonWord: false },
    { isin: 'ISIN_US', text: 'US', source: 'alias', ambiguous: false, commonWord: true },
    { isin: 'ISIN_B1', text: 'Vardhan Auto Limited', source: 'name', ambiguous: false, commonWord: false },
    { isin: 'ISIN_B2', text: 'Vardhan Sugar Limited', source: 'name', ambiguous: false, commonWord: false },
    { isin: 'ISIN_B1', text: 'Vardhan', source: 'alias', ambiguous: true, commonWord: false },
  ]);
  it('US-002.9 hazards: conglomerate alone, colloquial name, English-word ticker, group event, same-name firms, unlisted parent', () => {
    expect(hz.resolve('Orbit plans ₹10,000 cr investment')).toEqual({ isins: [], unresolved: ['Orbit'] }); // never every Orbit company
    expect(hz.resolve('Infy wins $2 billion deal').isins).toEqual(['ISIN_IN']);
    expect(hz.resolve('US markets rally on jobs data').isins).toEqual([]); // a bare word is not the ticker
    expect(hz.resolve('SEBI order against Orbit promoter').isins).toEqual([]); // no fan-out to the group
    expect(hz.resolve('Vardhan shares in focus')).toEqual({ isins: [], unresolved: ['Vardhan'] });
    expect(hz.resolve('Vardhan Sugar crushing season begins').isins).toEqual(['ISIN_B2']); // context names the firm
    expect(hz.resolve('Orbit Sons board meets on succession')).toEqual({ isins: [], unresolved: ['Orbit'] }); // the unlisted parent is no instrument
  });

  it('a name shared after a demerger is unresolved once curated as ambiguous', () => {
    expect(qa.resolve('Orbit Motors PV shares fall 3%')).toEqual({ isins: [], unresolved: ['Orbit Motors'] });
  });
});

describe('clustering decisions (deduplication.md)', () => {
  const t = new Date('2026-10-05T05:00:00Z');
  const mins = (m: number) => new Date(t.getTime() + m * 60_000);
  const item = (headline: string, extra: Partial<ItemFeatures> = {}): ItemFeatures => ({
    shingles: headlineShingles(headline),
    numbers: extractNumbers(headline),
    isins: [],
    eventTypes: classifyHeadline(headline),
    at: t,
    ...extra,
  });

  it('identical syndicated headlines about an unrecognised company merge', () => {
    const h = 'Orion Cables board approves ₹250 crore capex plan';
    expect(pairScore(item(h), item(h, { at: mins(5) }))!).toBeGreaterThanOrEqual(0.75);
  });

  it('differently worded headlines stay separate (prefer a visible duplicate)', () => {
    expect(pairScore(item('Orion Cables board approves capex plan'), item('Orion Cables to invest in new plant'))!).toBeLessThan(0.75);
  });

  it('vetoes: conflicting figures, different companies, outside 48 h', () => {
    expect(pairScore(item('Meridian Textiles Q2 profit at ₹412 crore'), item('Meridian Textiles Q2 profit at ₹500 crore'))).toBeNull();
    expect(pairScore(item('Board approves plan', { isins: ['A'] }), item('Board approves plan', { isins: ['B'] }))).toBeNull();
    expect(pairScore(item('Board approves plan'), item('Board approves plan', { at: mins(49 * 60) }))).toBeNull();
  });

  it('an article attaches to a filing within 24 h with a shared company and event type', () => {
    const filing = item('Financial Results for the quarter', { isins: ['A'], eventTypes: ['results'] });
    const article = item('Asterion Q2 profit rises', { isins: ['A'], eventTypes: ['results'], at: mins(20) });
    expect(attachScore(article, filing)!).toBeGreaterThanOrEqual(0.6);
    expect(attachScore({ ...article, at: mins(-5) }, filing)).toBeNull();
    expect(attachScore({ ...article, eventTypes: ['other'] }, filing)).toBeNull();
    expect(attachScore({ ...article, isins: ['B'] }, filing)).toBeNull();
  });

  it('recognises the same announcement on the other exchange', () => {
    const subject = 'Outcome of Board Meeting - Bonus Issue';
    const f = (exchange: string, at: Date): FilingFeatures => ({
      ...item(subject, { isins: ['K'], at }),
      exchange,
      subjectWords: wordSet(subject),
    });
    expect(isExchangeTwin(f('BSE', mins(0)), f('NSE', mins(2)))).toBe(true);
    expect(isExchangeTwin(f('BSE', mins(0)), f('BSE', mins(2)))).toBe(false);
    expect(isExchangeTwin(f('BSE', mins(0)), f('NSE', mins(45)))).toBe(false);
  });

  it('a filing explains an article-only story that preceded it', () => {
    const filing = item('Outcome of Board Meeting - Bonus Issue', { isins: ['K'], eventTypes: ['board_outcome', 'corporate_action'], at: mins(30) });
    const early = item('Kestrel board approves bonus issue', { isins: ['K'], eventTypes: ['board_outcome', 'corporate_action'] });
    expect(filingExplainsStory(filing, [early])).toBe(true);
    expect(filingExplainsStory(filing, [{ ...early, at: mins(40) }])).toBe(false);
  });
});
