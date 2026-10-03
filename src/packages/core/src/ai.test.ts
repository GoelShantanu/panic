import { describe, expect, it } from 'vitest';
import { CLASSIFY_SCHEMA, costInr, namesInText, normalisedNumbers, overPace, runSafeguards, spendState, validateClassification } from './ai.ts';

// All companies and figures are fictional.
const A = 'INE00AST1018';
const B = 'INE00BRK1012';

describe('classification output (ai-layer.md §2.3)', () => {
  it('accepts codes from the taxonomy and candidates from the list', () => {
    expect(validateClassification({ event_types: ['results', 'dividend'], instruments: [{ isin: A, confidence: 0.97 }] }, [A, B])).toEqual({
      ok: true,
      value: { eventTypes: ['results', 'dividend'], instruments: [{ isin: A, confidence: 0.97 }] },
    });
  });

  it.each([
    ['no types', { event_types: [], instruments: [] }],
    ['four types', { event_types: ['results', 'dividend', 'ma', 'pledge'], instruments: [] }],
    ['invented code', { event_types: ['bullish_news'], instruments: [] }],
    ['duplicate code', { event_types: ['results', 'results'], instruments: [] }],
    ['ISIN outside the candidates', { event_types: ['results'], instruments: [{ isin: 'INE00ZZZ1010', confidence: 0.9 }] }],
    ['confidence above 1', { event_types: ['results'], instruments: [{ isin: A, confidence: 1.2 }] }],
    ['extra field', { event_types: ['results'], instruments: [], tone: 'positive' }],
    ['not an object', 'results'],
  ])('rejects %s', (_, raw) => {
    expect(validateClassification(raw, [A]).ok).toBe(false);
  });

  it('the schema has no tone or sentiment field (D-014, C-004.4)', () => {
    const keys: string[] = [];
    const walk = (v: unknown) => {
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (keys.push(k), walk(x));
    };
    walk(CLASSIFY_SCHEMA);
    expect(keys.filter((k) => /tone|sentiment|bullish|bearish|polarity|outlook/i.test(k))).toEqual([]);
  });
});

const SOURCE =
  'Asterion Industries Limited informed the exchange that its board approved audited results for the quarter ended September 30, 2026. ' +
  'Revenue from operations was ₹1,250.50 crore against ₹1,100 crore a year earlier. The board recommended a dividend of ₹4 per share. ' +
  'The record date is 14 November 2026. Kestrel Power Limited is named as a customer.';

const good = [
  { text: 'Asterion Industries reported revenue from operations of ₹1,250.50 crore for the quarter ended September 30, 2026.', citedText: ['Revenue from operations was ₹1,250.50 crore against ₹1,100 crore a year earlier.', 'audited results for the quarter ended September 30, 2026'] },
  { text: 'The board recommended a dividend of ₹4 per share with a record date of 14 November 2026.', citedText: ['The board recommended a dividend of ₹4 per share.', 'The record date is 14 November 2026.'] },
];
const names = [{ name: 'Asterion Industries Limited', isFilingCompany: true }];

describe('summary safeguards G1–G7 (PRD-004 US-004.5)', () => {
  it('a grounded, neutral summary passes', () => {
    expect(runSafeguards({ sentences: good, sourceText: SOURCE, registryNames: names })).toMatchObject({ passed: true, failures: [] });
  });

  const fails = (sentences: typeof good, check: string, registry = names) => {
    const r = runSafeguards({ sentences, sourceText: SOURCE, registryNames: registry });
    expect(r.passed).toBe(false);
    expect(r.failures.map((f) => f.check)).toContain(check);
  };

  it('G1: an uncited sentence, or words outside its citation', () => {
    fails([{ ...good[0]!, citedText: [] }], 'G1');
    fails([{ text: 'Revenue from operations rose because of exports.', citedText: [good[0]!.citedText[0]!] }], 'G1');
  });
  it('G2: a number not in the source', () => {
    fails([{ text: 'Revenue from operations was ₹1,300 crore.', citedText: ['Revenue from operations was ₹1,300 crore.'] }], 'G2');
  });
  it('G3: tone words', () => {
    fails([{ text: 'Revenue from operations surged to ₹1,250.50 crore.', citedText: ['surged Revenue from operations was ₹1,250.50 crore'] }], 'G3');
  });
  it('G4: advice not in the source', () => {
    fails([{ text: 'Investors should note the dividend of ₹4 per share.', citedText: ['Investors should note The board recommended a dividend of ₹4 per share.'] }], 'G4');
  });
  it('G5: a company the filing does not name', () => {
    fails(good, 'G5', [...names, { name: 'Brookfield Rails Limited', isFilingCompany: false }]);
    expect(runSafeguards({ sentences: good, sourceText: SOURCE, registryNames: [...names, { name: 'Kestrel Power Limited', isFilingCompany: false }] }).passed).toBe(true);
  });
  it('G6: over 100 words', () => {
    const long = Array.from({ length: 101 }, () => 'board').join(' ') + '.';
    fails([{ text: long, citedText: ['board'] }], 'G6');
  });
  it('G7: lists and headings', () => {
    fails([{ text: '- The board recommended a dividend of ₹4 per share.', citedText: ['The board recommended a dividend of ₹4 per share.'] }], 'G7');
  });

  it('numbers normalise across crore and comma formats', () => {
    const n = normalisedNumbers('₹1,250.50 crore and Rs 3 lakh');
    expect([...n]).toEqual(expect.arrayContaining(['1250.5', '12505000000', '3', '300000']));
  });

  it('finds registry names in the summary as whole names', () => {
    const reg = [{ name: 'Asterion Industries Limited', isin: A }, { name: 'Brook Ltd', isin: B }];
    expect(namesInText('Asterion Industries reported results.', reg, A)).toEqual([{ name: 'Asterion Industries Limited', isFilingCompany: true }]);
    expect(namesInText('Brookfield reported results.', reg, A)).toEqual([]);
  });
});

describe('spend (ai-layer.md §5)', () => {
  const prices = { inputUsdPerMTok: 1, outputUsdPerMTok: 5, cacheReadUsdPerMTok: 0.1, cacheWriteUsdPerMTok: 1.25, usdInr: 84 };
  it('costs tokens in rupees', () => {
    expect(costInr({ inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 0, cacheWriteTokens: 0 }, prices)).toBe(126);
  });
  it('80% warns, 100% caps', () => {
    expect(spendState(39_999, 50_000)).toBe('ok');
    expect(spendState(40_000, 50_000)).toBe('warn');
    expect(spendState(50_000, 50_000)).toBe('capped');
  });
  it('pace: above 150% of the remaining daily budget', () => {
    expect(overPace(2_500, 20_000, 50_000, 20)).toBe(true); // pace 1,500/day
    expect(overPace(2_000, 20_000, 50_000, 20)).toBe(false);
  });
});
