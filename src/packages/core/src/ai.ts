// AI layer rules that need no network: output validation, summary safeguards G1–G7,
// cost metering and spend control (ai-layer.md §2.3, §4, §5; PRD-004 US-004.5; D-025).

import { isEventTypeCode } from './event-types.ts';
import type { EventTypeCode } from './event-types.ts';
import { MAX_EVENT_TYPES } from './classification.ts';
import { normaliseName } from './text.ts';

// ------------------------------------------------------------ classification output

// Structured-output schema for the classification call. No tone or sentiment field may exist
// here (D-014, PRD-004 C-004.4); a unit test enforces it. Item counts are checked in code.
export const CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    event_types: { type: 'array', items: { type: 'string' } },
    instruments: {
      type: 'array',
      items: {
        type: 'object',
        properties: { isin: { type: 'string' }, confidence: { type: 'number' } },
        required: ['isin', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['event_types', 'instruments'],
  additionalProperties: false,
} as const;

export interface ClassifyOutput {
  eventTypes: EventTypeCode[];
  instruments: { isin: string; confidence: number }[];
}

// Any violation discards the whole response (ai-layer.md §2.3).
export function validateClassification(raw: unknown, candidateIsins: readonly string[]): { ok: true; value: ClassifyOutput } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'not an object' };
  const r = raw as Record<string, unknown>;
  const keys = Object.keys(r).sort().join(',');
  if (keys !== 'event_types,instruments') return { ok: false, error: `unexpected fields: ${keys}` };
  const types = r['event_types'];
  if (!Array.isArray(types) || types.length < 1 || types.length > MAX_EVENT_TYPES) return { ok: false, error: 'event_types count' };
  if (!types.every((t) => typeof t === 'string' && isEventTypeCode(t))) return { ok: false, error: 'unknown event type' };
  if (new Set(types).size !== types.length) return { ok: false, error: 'duplicate event type' };
  const inst = r['instruments'];
  if (!Array.isArray(inst)) return { ok: false, error: 'instruments not an array' };
  const allowed = new Set(candidateIsins);
  const seen = new Set<string>();
  for (const i of inst) {
    if (typeof i !== 'object' || i === null) return { ok: false, error: 'instrument not an object' };
    const { isin, confidence } = i as Record<string, unknown>;
    if (typeof isin !== 'string' || !allowed.has(isin)) return { ok: false, error: 'instrument outside candidate list' };
    if (seen.has(isin)) return { ok: false, error: 'duplicate instrument' };
    seen.add(isin);
    if (typeof confidence !== 'number' || !(confidence >= 0 && confidence <= 1)) return { ok: false, error: 'confidence out of range' };
  }
  return { ok: true, value: { eventTypes: types as EventTypeCode[], instruments: inst as ClassifyOutput['instruments'] } };
}

// ------------------------------------------------------------ summary safeguards (ai-layer.md §4)

export const SUMMARY_MAX_WORDS = 100; // PRD-004 OQ-004.5
export const SAFEGUARDS_VERSION = 'g-2026-10-03.1';

// Versioned in the repository (ai-layer.md §4 G3). Matched as whole words, case-insensitive.
export const TONE_WORDS = [
  'strong', 'stronger', 'strongest', 'weak', 'weaker', 'weakest', 'robust', 'disappointing', 'disappointed', 'impressive',
  'positive', 'negative', 'bullish', 'bearish', 'beat', 'beats', 'missed', 'miss', 'misses', 'surge', 'surged', 'surges',
  'plunge', 'plunged', 'plunges', 'soar', 'soared', 'soars', 'slump', 'slumped', 'slumps', 'stellar', 'dismal', 'healthy',
  'solid', 'excellent', 'poor', 'remarkable', 'sharp', 'sharply', 'massive',
  'huge', 'record-breaking', 'blockbuster', 'tremendous', 'worrying', 'alarming', 'encouraging', 'upbeat', 'gloomy',
  'optimistic', 'pessimistic', 'rally', 'rallied', 'crash', 'crashed', 'tank', 'tanked', 'skyrocket', 'skyrocketed',
  'outperform', 'outperformed', 'underperform', 'underperformed', 'boost', 'boosted', 'jolt', 'windfall',
] as const;

// Recommendation and forecast patterns (G4); allowed only when the same phrase is in the source.
export const ADVICE_PATTERNS: readonly RegExp[] = [
  /\bshould\b/i, /\bconsider(?:s|ed|ing)?\b/i, /\bbuy(?:s|ing)?\b/i, /\bsell(?:s|ing)?\b/i, /\bhold(?:ing)?\b/i,
  /\btarget(?: price)?\b/i, /\bexpected to (?:rise|fall|grow|decline|increase|decrease)\b/i, /\binvestors (?:may|might|could)\b/i,
  /\brecommend(?:s|ed|ation)?\b/i, /\boutlook\b/i, /\bupside\b/i, /\bdownside\b/i, /\baccumulate\b/i, /\bavoid\b/i,
];

const STOPWORDS = new Set(
  ('a an and are as at be been by for from has have in into is it its of on or that the this to was were will with which ' +
    'who whom whose than then also not no per such their there these those during under over about after before between ' +
    'company limited ltd said states stated announced informed disclosed filing filed exchange exchanges stock board')
    .split(' '),
);
// Attribution verbs need no citation: they say who stated something, not what was stated.
const ATTRIBUTION = new Set(['report', 'reported', 'say', 'says', 'state', 'announce', 'disclose', 'inform', 'notify', 'notified'].map((w) => w.replace(/(?:ing|ed|es|s)$/, '')));

const stem = (w: string) => w.replace(/(?:ing|ed|es|s)$/, '');
const words = (text: string) => (text.toLowerCase().match(/[\p{L}][\p{L}'-]*/gu) ?? []).map((w) => w.replace(/'s$/, ''));
const contentWords = (text: string) => words(text).filter((w) => w.length >= 3 && !STOPWORDS.has(w)).map(stem);

// Numbers normalised so "₹1,250.50 crore", "Rs 1250.5 cr" and "12505000000" can match; leading
// zeros dropped so "03/10/2026" and "3 October 2026" share "3" and "2026".
export function normalisedNumbers(text: string): Set<string> {
  const out = new Set<string>();
  const re = /(?<![\p{L}\d.])(\d[\d,]*(?:\.\d+)?)(?:\s*(crores?|cr|lakhs?|lacs?|lakh)\b)?/giu;
  for (const m of text.matchAll(re)) {
    const n = m[1]!.replace(/,/g, '');
    const value = Number(n);
    if (!Number.isFinite(value)) continue;
    out.add(String(value));
    const unit = m[2]?.toLowerCase();
    if (unit) out.add(String(Math.round(value * (unit.startsWith('cr') ? 1e7 : 1e5) * 100) / 100));
  }
  return out;
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z₹"(\d])/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface SummarySentence {
  text: string;
  citedText: string[]; // the cited spans the model attached to this sentence
}

export interface SafeguardInput {
  sentences: SummarySentence[];
  sourceText: string;
  // Registry names that occur in the summary text, with whether each is the filing's company.
  registryNames: readonly { name: string; isFilingCompany: boolean }[];
}

export type CheckId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7';
export interface CheckResult {
  passed: boolean;
  failures: { check: CheckId; detail: string }[];
  version: string;
}

export function runSafeguards(input: SafeguardInput): CheckResult {
  const failures: CheckResult['failures'] = [];
  const summary = input.sentences.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();
  const source = input.sourceText;
  const sourceLower = source.toLowerCase().replace(/\s+/g, ' ');

  // G1 grounding: every sentence cited, and its content words and numbers inside its cited spans.
  // The filing company's own name is exempt (G5 checks entities).
  const ownName = new Set(input.registryNames.filter((n) => n.isFilingCompany).flatMap((n) => contentWords(n.name)));
  for (const s of input.sentences) {
    if (s.citedText.length === 0) {
      failures.push({ check: 'G1', detail: `uncited: ${s.text.slice(0, 60)}` });
      continue;
    }
    const cited = s.citedText.join(' ');
    const citedWords = new Set(contentWords(cited));
    const missing = contentWords(s.text).filter((w) => !citedWords.has(w) && !ownName.has(w) && !ATTRIBUTION.has(w));
    const citedNums = normalisedNumbers(cited);
    const missingNums = [...normalisedNumbers(s.text)].filter((n) => !citedNums.has(n));
    if (missing.length || missingNums.length) failures.push({ check: 'G1', detail: `not in cited text: ${[...missing, ...missingNums].slice(0, 5).join(', ')}` });
  }

  // G2 numbers anywhere in the source.
  const sourceNums = normalisedNumbers(source);
  const badNums = [...normalisedNumbers(summary)].filter((n) => !sourceNums.has(n));
  if (badNums.length) failures.push({ check: 'G2', detail: `numbers not in source: ${badNums.join(', ')}` });

  // G3 tone.
  const summaryWords = new Set(words(summary));
  const tone = TONE_WORDS.filter((w) => summaryWords.has(w));
  if (tone.length) failures.push({ check: 'G3', detail: `tone words: ${[...new Set(tone)].join(', ')}` });

  // G4 advice, unless the matched phrase is verbatim in the source.
  for (const p of ADVICE_PATTERNS) {
    const m = summary.match(p);
    if (m && !sourceLower.includes(m[0].toLowerCase())) failures.push({ check: 'G4', detail: `advice pattern: ${m[0]}` });
  }

  // G5 entities: a named company is the filing's company or named in the source.
  const sourceNorm = normaliseName(source);
  for (const n of input.registryNames) {
    if (!n.isFilingCompany && !sourceNorm.includes(normaliseName(n.name))) failures.push({ check: 'G5', detail: `company not in source: ${n.name}` });
  }

  // G6 length.
  const wordCount = summary.split(/\s+/).filter((w) => w.length > 0).length;
  if (wordCount > SUMMARY_MAX_WORDS) failures.push({ check: 'G6', detail: `${wordCount} words` });
  if (wordCount === 0) failures.push({ check: 'G6', detail: 'empty' });

  // G7 plain English prose: no headings, no lists, mostly Latin script.
  const raw = input.sentences.map((s) => s.text).join('\n');
  if (/^\s*(?:#{1,6}\s|[-*•]\s|\d+[.)]\s)/m.test(raw) || /\*\*|__/.test(raw)) failures.push({ check: 'G7', detail: 'heading, list or markup' });
  const letters = summary.match(/\p{L}/gu) ?? [];
  const latin = summary.match(/[A-Za-z]/g) ?? [];
  if (letters.length > 0 && latin.length / letters.length < 0.95) failures.push({ check: 'G7', detail: 'not English' });

  return { passed: failures.length === 0, failures, version: SAFEGUARDS_VERSION };
}

// Names from a registry list that occur in the summary (whole-name match, normalised).
export function namesInText(text: string, registry: readonly { name: string; isin: string }[], filingIsin: string | null) {
  const norm = ` ${normaliseName(text)} `;
  return registry
    .filter((r) => {
      const n = normaliseName(r.name);
      return n.length >= 4 && norm.includes(` ${n} `);
    })
    .map((r) => ({ name: r.name, isFilingCompany: r.isin === filingIsin }));
}

// ------------------------------------------------------------ spend (ai-layer.md §5)

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface PriceTable {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
  cacheReadUsdPerMTok: number;
  cacheWriteUsdPerMTok: number;
  usdInr: number;
}

export function costInr(u: Usage, p: PriceTable): number {
  const usd =
    (u.inputTokens * p.inputUsdPerMTok + u.outputTokens * p.outputUsdPerMTok + u.cacheReadTokens * p.cacheReadUsdPerMTok + u.cacheWriteTokens * p.cacheWriteUsdPerMTok) /
    1e6;
  return Math.round(usd * p.usdInr * 10_000) / 10_000;
}

export type SpendState = 'ok' | 'warn' | 'capped';

// 80 % → founder alert; 100 % → summaries pause and classification is rules-only.
export function spendState(spentInr: number, capInr: number): SpendState {
  if (spentInr >= capInr) return 'capped';
  if (spentInr >= 0.8 * capInr) return 'warn';
  return 'ok';
}

// Daily soft budget = remaining monthly budget ÷ remaining days (IST); > 150 % of it alerts.
export function overPace(spentTodayInr: number, spentBeforeTodayInr: number, capInr: number, daysLeftIncludingToday: number): boolean {
  const pace = Math.max(0, capInr - spentBeforeTodayInr) / Math.max(1, daysLeftIncludingToday);
  return spentTodayInr > 1.5 * pace;
}
