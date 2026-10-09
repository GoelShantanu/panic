import { describe, expect, it } from 'vitest';
import { AliasIndex, resolveArticle } from './resolution.ts';

const index = new AliasIndex([
  { isin: 'BANK', text: 'Bank of India Limited', source: 'name', ambiguous: false, commonWord: false },
  { isin: 'SBI', text: 'SBI', source: 'alias', ambiguous: false, commonWord: false },
  { isin: 'MPS', text: 'MPS Limited', source: 'name', ambiguous: false, commonWord: false },
  { isin: 'MCX', text: 'Multi Commodity Exchange Limited', source: 'name', ambiguous: false, commonWord: false },
  { isin: 'PARENT', text: 'Nimbus', source: 'alias', ambiguous: false, commonWord: false },
  { isin: 'CHILD', text: 'Orion Textiles', source: 'name', ambiguous: false, commonWord: false },
  { isin: 'BSE', text: 'BSE Limited', source: 'name', ambiguous: false, commonWord: false },
  { isin: 'RIL', text: 'Jio', source: 'alias', ambiguous: false, commonWord: false },
  { isin: 'LT', text: 'L&T', source: 'alias', ambiguous: false, commonWord: false },
  { isin: 'MO', text: 'Motilal Oswal', source: 'alias', ambiguous: false, commonWord: false },
  { isin: 'ITC', text: 'ITC Limited', source: 'name', ambiguous: false, commonWord: false },
  { isin: 'AMBIGUOUS', text: 'Gamma Group', source: 'alias', ambiguous: true, commonWord: false },
]);

describe('article resolution attribution safeguards', () => {
  it('distinguishes input tax credit from the issuer in tax coverage', () => {
    expect(index.resolve('GST Council allows employers to claim ITC on group insurance').isins).toEqual([]);
    expect(index.resolve('Input tax credit (ITC) rules change').isins).toEqual([]);
    expect(index.resolve('ITC shares fall after GST tax hike').isins).toEqual(['ITC']);
    expect(index.resolve('ITC revenue rises after input tax credit adjustment').isins).toEqual(['ITC']);
  });
  it('distinguishes broker recommendations from broker company results', () => {
    expect(index.resolve('Orion Textiles Q2 results: Motilal Oswal remains bullish').isins).toEqual(['CHILD']);
    expect(index.resolve('Motilal Oswal reiterates buy on Orion Textiles').isins).toEqual(['CHILD']);
    expect(index.resolve('Motilal Oswal profit rises after Q2 results').isins).toEqual(['MO']);
  });
  it('does not tag institutions or analyst subsidiaries from excerpts', () => {
    expect(resolveArticle(index, 'Policy outlook', 'The Reserve Bank of India raised rates. SBI Securities forecasts another hike.').isins).toEqual([]);
    expect(index.resolve('Bank of India shares rise after quarterly results').isins).toEqual(['BANK']);
    expect(index.resolve('SBI shares gain after profit growth').isins).toEqual(['SBI']);
    expect(index.resolve('SBI Mutual Fund announces an investment scheme').isins).toEqual([]);
  });
  it('distinguishes plural acronyms from listed company names', () => {
    expect(index.resolve('MPs released after protest').isins).toEqual([]);
    expect(index.resolve('MPS reports higher revenue').isins).toEqual(['MPS']);
  });
  it('distinguishes trading venues from issuer subjects', () => {
    expect(resolveArticle(index, 'Gold futures ease', 'Gold fell on Multi Commodity Exchange today.').isins).toEqual([]);
    expect(resolveArticle(index, 'Gold futures ease', 'Gold fell on the Multi Commodity Exchange today.').isins).toEqual([]);
    expect(index.resolve('Multi Commodity Exchange reports revenue growth').isins).toEqual(['MCX']);
  });
  it('does not tag an ownership qualifier as a separate subject', () => {
    expect(index.resolve('Nimbus-backed Orion Textiles shares rally').isins).toEqual(['CHILD']);
  });
  it('uses excerpts only when no headline company resolves, and retains ambiguity', () => {
    expect(resolveArticle(index, 'Company update', 'Orion Textiles reports higher revenue').isins).toEqual(['CHILD']);
    expect(resolveArticle(index, 'Orion Textiles shares rally', 'Nimbus reports another result').isins).toEqual(['CHILD']);
    expect(resolveArticle(index, 'Gamma Group plans expansion', 'Orion Textiles reports higher revenue')).toEqual({isins:[],unresolved:['Gamma Group']});
  });
  it('does not promote index names or unlisted subsidiaries into securities', () => {
    expect(index.resolve('BSE 500 falls while BSE Sensex declines').isins).toEqual([]);
    expect(index.resolve('BSE shares rise after revenue growth').isins).toEqual(['BSE']);
    expect(index.resolve('Jio introduces new telecom plans')).toEqual({isins:[],unresolved:['Jio']});
    expect(index.resolve('L&T Realty plans housing expansion').isins).toEqual([]);
    expect(index.resolve('L&T shares rise on project order').isins).toEqual(['LT']);
    const futureRegistry=new AliasIndex([{isin:'NEW',text:'Jio Platforms Limited',source:'name',ambiguous:false,commonWord:false}]);
    expect(futureRegistry.resolve('Jio Platforms reports quarterly revenue').isins).toEqual(['NEW']);
  });
  it('distinguishes a fund house and an analyst attribution from an issuer', () => {
    expect(index.resolve('Motilal Oswal leads mutual-fund AUM growth').isins).toEqual([]);
    expect(index.resolve('Nifty earnings seen rising sharply: Motilal Oswal').isins).toEqual([]);
    expect(index.resolve('Motilal Oswal shares rise after profit growth').isins).toEqual(['MO']);
    expect(resolveArticle(index, 'Motilal Oswal leads mutual-fund AUM growth', 'Motilal Oswal logged strong growth.').isins).toEqual([]);
    expect(resolveArticle(index, 'Nifty earnings seen rising sharply: Motilal Oswal', 'Motilal Oswal believes the outlook is positive.').isins).toEqual([]);
  });
});



// Fictional companies keep behavioural regressions separate from the evaluation corpus.
const issuerIndex = new AliasIndex([
  ['A', 'Asterion Industries Limited', 'name'], ['A', 'Asterion', 'alias'],
  ['K', 'Kestrel Power Limited', 'name'], ['K', 'Kestrel', 'alias'],
  ['B', 'Beacon Ratings Limited', 'name'], ['B', 'Beacon Ratings', 'alias'],
  ['P', 'Orion Ports and Special Economic Zone Limited', 'name'], ['P', 'Orion Ports', 'alias'],
  ['S', 'Sunrise Small Finance Bank Limited', 'name'], ['S', 'Sunrise SFB', 'alias'],
].map(([isin, text, source]) => ({ isin: isin!, text: text!, source: source as 'name' | 'alias', ambiguous: false, commonWord: false })));

describe('issuer subjects and analyst attribution', () => {
  it.each([
    'Q2 earnings may grow 20%, says Asterion',
    'Kestrel shares gain after tariff hike, Asterion retains buy',
    'Inflation outlook: Priya Sharma, Beacon Ratings',
  ])('does not tag the commentator: %s', headline => {
    const r = issuerIndex.resolve(headline);
    expect(r.isins).toEqual(headline.includes('Kestrel') ? ['K'] : []);
  });
  it('ignores an interviewee affiliation in the excerpt', () => {
    expect(resolveArticle(issuerIndex, 'Smart Talk: Why investors should watch inflation',
      'Priya Sharma, CIO – Equity, Asterion Industries, discusses the risks in the market.').isins).toEqual([]);
  });
  it.each(['Asterion shares rise after Q2 results', 'Asterion revenue grows 20%', 'Analysts say Kestrel shares could benefit'])('preserves issuer news: %s', headline => {
    expect(issuerIndex.resolve(headline).isins).toEqual(headline.includes('Kestrel') ? ['K'] : ['A']);
  });
  it('does not truncate a company when and introduces the next company', () => {
    expect(issuerIndex.resolve('Stocks in news: Orion Ports and Sunrise SFB').isins).toEqual(['P', 'S']);
  });
  it('completes an explicit roundup from its excerpt', () => {
    expect(resolveArticle(issuerIndex, 'Asterion among 3 stocks in focus', 'Asterion, Kestrel and Orion Ports shares gained.').isins).toEqual(['A', 'K', 'P']);
  });
  it('does not add incidental excerpt companies to an ordinary issuer headline', () => {
    expect(resolveArticle(issuerIndex, 'Asterion posts record profit', 'Asterion beat Kestrel in market value.').isins).toEqual(['A']);
  });
  it('retains ambiguity even when an excerpt has another issuer', () => {
    const ambiguous = new AliasIndex([{isin: 'A', text: 'Orbit', source: 'alias', ambiguous: true, commonWord: false}, {isin: 'K', text: 'Kestrel', source: 'alias', ambiguous: false, commonWord: false}]);
    expect(resolveArticle(ambiguous, 'Orbit restructuring', 'Kestrel shares rise')).toEqual({isins: [], unresolved: ['Orbit']});
  });
});
