// Rule-only company tagging for article headlines (entity-resolution.md §4 R1–R3, §5 launch rule):
// exact matches on normalised company names and curated/operator aliases only. Ambiguous
// matches become unresolved mentions; a guessed instrument is never returned (GUARDRAILS §4.6).

import { normaliseForMatch, normaliseName } from './text.ts';

export interface AliasEntry {
  readonly isin: string;
  readonly text: string;
  readonly source: 'name' | 'alias';
  readonly ambiguous: boolean;
  // Also an English word: only matches when written in ticker casing (e.g. "TREND").
  readonly commonWord: boolean;
}

export interface Resolution {
  readonly isins: string[];
  readonly unresolved: string[];
}

// Shared by the pipeline and quality evaluation, including the excerpt fallback.
export function resolveArticle(index: AliasIndex, headline: string, excerpt: string | null = null): Resolution {
  const primary = index.resolve(headline);
  if (primary.isins.length || primary.unresolved.length || !excerpt) return primary;
  const fallback = index.resolve(excerpt);
  return { isins: fallback.isins, unresolved: primary.unresolved.length ? primary.unresolved : fallback.unresolved };
}

interface Entry {
  isins: Set<string>;
  ambiguous: boolean;
  commonWord: boolean;
}

interface Token {
  norm: string;
  orig: string;
}

// A mention is shown as written, without the punctuation around it ("Nimbus Green," → "Nimbus Green").
const trimMention = (s: string) => s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

// Words that show a common-word alias is being used as a company (entity-resolution.md §4 R2).
const COMPANY_CONTEXT = new Set(['shares', 'share', 'stock', 'stocks', 'ltd', 'limited', 'q1', 'q2', 'q3', 'q4', 'results', 'board', 'ipo', 'dividend', 'profit', 'revenue', 'order', 'target']);
const CONTEXT_WINDOW = 3;

// "BSE" beside "NSE" names the exchanges, not BSE Limited's shares ("Are NSE, BSE closed today?").
const EXCHANGE_PAIR: Record<string, string> = { bse: 'nse' };
const EXCHANGE_WINDOW = 3;
const FUND_HOUSE_NAMES = new Set(['sbi', 'motilal oswal', 'icici', 'hdfc', 'kotak', 'axis']);
const UNLISTED_MENTIONS = new Set(['jio', 'jio platforms', 'l and t realty']);

export class AliasIndex {
  private readonly entries = new Map<string, Entry>();
  private readonly legalNames = new Set<string>();
  // Proper word-prefixes of multi-word keys: "ntpc green" for "ntpc green energy".
  private readonly prefixes = new Set<string>();
  private maxWords = 1;

  constructor(aliases: readonly AliasEntry[]) {
    for (const a of aliases) {
      const key = a.source === 'name' ? normaliseName(a.text) : normaliseForMatch(a.text);
      if (key === '') continue;
      if (a.source === 'name') this.legalNames.add(key);
      const e = this.entries.get(key) ?? { isins: new Set<string>(), ambiguous: false, commonWord: false };
      e.isins.add(a.isin);
      e.ambiguous ||= a.ambiguous;
      e.commonWord ||= a.commonWord;
      this.entries.set(key, e);
      const words = key.split(' ');
      this.maxWords = Math.max(this.maxWords, words.length);
      for (let k = 2; k < words.length; k++) this.prefixes.add(words.slice(0, k).join(' '));
    }
  }

  get size(): number {
    return this.entries.size;
  }

  resolve(headline: string): Resolution {
    const tokens: Token[] = [];
    for (const raw of headline.split(/\s+/)) {
      for (const part of normaliseForMatch(raw).split(' ')) if (part) tokens.push({ norm: part, orig: raw });
    }
    const isins = new Set<string>();
    const unresolved = new Set<string>();
    let i = 0;
    while (i < tokens.length) {
      let matched = 0;
      for (let n = Math.min(this.maxWords, tokens.length - i); n >= 1; n--) {
        const span = tokens.slice(i, i + n);
        const key = span.map((t) => t.norm).join(' ');
        const entry = this.entries.get(key);
        if (!entry) continue;
        // An alias that is also an English word needs ticker casing and company context (PRD-002
        // US-002.9): "US markets rally" is not a company; "TREND shares jump" is.
        if (entry.commonWord && !span.every((t) => /[A-Z]/.test(t.orig) && t.orig === t.orig.toUpperCase())) continue;
        if (entry.commonWord && !tokens.slice(Math.max(0, i - CONTEXT_WINDOW), i + n + CONTEXT_WINDOW).some((t) => COMPANY_CONTEXT.has(t.norm))) continue;
        // Headlines capitalise company names; a lower-case run is ordinary words ("to take over").
        if (!/^[\p{Lu}\p{N}]/u.test(span[0]!.orig)) continue;
        // Plural acronyms in prose (e.g. MPs) are not a company named MPS.
        if (n === 1 && /^[A-Z]{2,}s$/.test(trimMention(span[0]!.orig))) continue;
        // An institution, analyst subsidiary, ownership qualifier or trading venue is
        // contextual attribution, not evidence that the listed issuer is the subject.
        const nextWord = tokens[i + n]?.norm;
        const previousWord = tokens[i - 1]?.norm;
        const venuePreposition = previousWord === 'the' ? tokens[i - 2]?.norm : previousWord;
        const analystSubsidiary = nextWord === 'securities' || nextWord === 'mf' || (nextWord === 'mutual' && tokens[i + n + 1]?.norm === 'fund');
        const centralBank = key === 'bank of india' && previousWord === 'reserve';
        const ownership = nextWord === 'backed';
        const indexName = key === 'bse' && (nextWord === 'sensex' || /^\d+$/.test(nextWord ?? ''));
        const unlisted = (UNLISTED_MENTIONS.has(key) && !this.legalNames.has(key))
          || (key === 'l and t' && nextWord === 'realty' && !this.legalNames.has(`${key} realty`));
        const fundHouse = FUND_HOUSE_NAMES.has(key) && tokens.some(t=>t.norm==='aum')
          && !tokens.some(t=>['stock','stocks','share','shares'].includes(t.norm));
        const trailingAttribution = i+n===tokens.length && /:$/.test(tokens[i-1]?.orig ?? '')
          && tokens.slice(0,i).some(t=>/^(?:says?|said|sees?|seen|forecasts?|estimates?|expected|projected)$/.test(t.norm));
        const venue = ['bse', 'nse', 'mcx', 'multi commodity exchange'].includes(key)
          && ['on', 'at', 'via', 'through'].includes(venuePreposition ?? '')
          && !COMPANY_CONTEXT.has(nextWord ?? '');
        if (analystSubsidiary || centralBank || ownership || venue || indexName || unlisted || fundHouse || trailingAttribution) {
          if (unlisted || fundHouse || trailingAttribution) unresolved.add(trimMention([...new Set(span.map(t=>t.orig))].join(' ')));
          matched = n;
          break;
        }
        const partner = EXCHANGE_PAIR[key];
        if (partner && tokens.slice(Math.max(0, i - EXCHANGE_WINDOW), i + n + EXCHANGE_WINDOW).some((t) => t.norm === partner)) {
          matched = n;
          break;
        }
        const text = [...new Set(span.map((t) => t.orig))].join(' ');
        // The start of a longer listed name ("NTPC Green" for NTPC Green Energy) is not the shorter
        // company: shown unresolved rather than guessed.
        const next = tokens[i + n];
        const truncated = next !== undefined && this.prefixes.has(`${key} ${next.norm}`) && !this.entries.has(`${key} ${next.norm}`);
        if (entry.ambiguous || entry.isins.size > 1 || truncated) unresolved.add(trimMention(truncated ? `${text} ${next!.orig}` : text));
        else isins.add([...entry.isins][0]!);
        matched = n;
        break;
      }
      i += matched || 1;
    }
    return { isins: [...isins].sort(), unresolved: [...unresolved] };
  }
}
