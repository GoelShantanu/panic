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
  if (primary.unresolved.length || !excerpt) return primary;
  // Feed excerpts can complete an explicit stock/company roundup, but cannot silently
  // introduce incidental issuers into an ordinary single-company headline.
  const roundup = /\b(?:stocks? (?:to watch|to buy|in news|picks)|among \d+ (?:stocks?|companies)|(?:other (?:\w+ )?|fintech )stocks|companies to report|market wrap)\b/i.test(headline);
  const namedCohort = primary.isins.length >= 2 && /\bamong\b/i.test(headline)
    && /\b(?:firms|giants|companies|banks|stocks)\b/i.test(headline);
  // A counterparty can resolve while the headline refers to its main issuer only
  // as "this stock". The supplied excerpt may name that explicitly omitted subject.
  const omittedSubject = /\bthis (?:penny )?stock\b/i.test(headline);
  if (primary.isins.length && !roundup && !namedCohort && !omittedSubject) return primary;
  const fallback = index.resolve(excerpt);
  return { isins: [...new Set([...primary.isins, ...fallback.isins])].sort(), unresolved: fallback.unresolved };
}

interface Entry {
  isins: Set<string>;
  ambiguous: boolean;
  commonWord: boolean;
}

interface Token {
  norm: string;
  orig: string;
  group: number;
}

// A mention is shown as written, without the punctuation around it ("Nimbus Green," → "Nimbus Green").
const trimMention = (s: string) => s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

// Words that show a common-word alias is being used as a company (entity-resolution.md §4 R2).
const COMPANY_CONTEXT = new Set(['shares', 'share', 'stock', 'stocks', 'ltd', 'limited', 'q1', 'q2', 'q3', 'q4', 'results', 'board', 'ipo', 'dividend', 'profit', 'revenue', 'order', 'target', 'ban', 'contract', 'deal', 'agreement']);
const CONTEXT_WINDOW = 3;

// "BSE" beside "NSE" names the exchanges, not BSE Limited's shares ("Are NSE, BSE closed today?").
const EXCHANGE_PAIR: Record<string, string> = { bse: 'nse' };
const EXCHANGE_WINDOW = 3;
const FUND_HOUSE_NAMES = new Set(['sbi', 'motilal oswal', 'icici', 'hdfc', 'kotak', 'axis']);
const UNLISTED_MENTIONS = new Set(['jio', 'jio platforms', 'l and t realty']);
const UNLISTED_CONTINUATIONS: Record<string, string> = { airtel: 'money', axis: 'amc', 'l and t': 'realty' };

function isAttribution(tokens: readonly Token[], i: number, n: number): boolean {
  const before = tokens.slice(Math.max(0, i - 8), i).map(t => t.norm).join(' ');
  const after = tokens.slice(i + n, i + n + 8).map(t => t.norm).join(' ');
  const issuerSubject = /^(?:s )?(?:shares?|stocks?|profit|revenue|board|dividend|results|earnings)\b/.test(after);
  if (issuerSubject) return false;
  if (/\b(?:previously|formerly) (?:worked|served) (?:at|with|for)\b/.test(before)) return true;
  if (/\b(?:says?|said|according to|estimates? by|forecast by|report by)$/.test(before)) return true;
  if (/^(?:s )?(?:(?:retains?|maintains?|reiterates?) (?:a )?(?:buy|sell|hold|add|overweight|underweight)|remains? (?:bullish|bearish)|recommends?|upgrades?|downgrades?|sees? upside|raises? (?:its )?target|cuts? (?:its )?target)\b/.test(after)) return true;
  if (/^(?:believes?|expects?|sees?|forecasts?|projects?)\b/.test(after)
    && /\b(?:markets?|inflation|sentiment|investors?|nifty|sensex|sectors?|rates?)\b/.test(tokens.slice(i+n).map(t => t.norm).join(' '))) return true;
  if (/\b(?:cio|economist|analyst|strategist|fund manager|head of research)\b/.test(before)
    && /^(?:discusses?|says?|explains?|believes?|expects?|sees?)\b/.test(after)) return true;
  // Interview headlines end with a named speaker and affiliation after a colon.
  const colon = tokens.findLastIndex((t, k) => k < i && /[:：]/.test(t.orig));
  // A role after the affiliation identifies the speaker of a colon-delimited
  // policy/market quote. An executive appointment, departure or issuer result
  // has further event text and must remain company news.
  const roleTail = /^(?:s )?(?:md|ceo|cfo|cio|chairman|economist|managing director|chief executive(?: officer)?)$/.test(tokens.slice(i + n).map(t=>t.norm).join(' '));
  if (colon >= 0 && roleTail) return true;
  const tail = i + n === tokens.length;
  const roundup = /\b(?:stocks|companies|picks|watch)\b/.test(tokens.slice(0, i).map(t => t.norm).join(' '));
  return tail && colon >= 0 && !roundup && i > colon + 1 && /[,，]$/.test(tokens[i - 1]?.orig ?? '');
}

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
    for (const [group,raw] of headline.split(/\s+/).entries()) {
      for (const part of normaliseForMatch(raw).split(' ')) if (part) tokens.push({ norm: part, orig: raw, group });
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
        // Never build a company from fragments of neighbouring compound names
        // ("AT&T, T-Mobile" must not become "T T"). A full L&T-style alias is
        // still valid; possessives and explicit stock/ownership suffixes are allowed.
        if (i>0&&tokens[i-1]!.group===span[0]!.group) continue;
        const suffix=tokens[i+n];
        if(suffix?.group===span.at(-1)!.group
          && !['s','backed','share','shares','stock','stocks'].includes(suffix.norm)) continue;
        // An alias that is also an English word needs ticker casing and company context (PRD-002
        // US-002.9): "US markets rally" is not a company; "TREND shares jump" is.
        // "Federal" is a curated bank shorthand only in an explicit comma-separated
        // bank-stock roundup. It is never inferred from federal policy prose.
        const bankShorthand = key === 'federal' && trimMention(span[0]!.orig) === 'Federal'
          && (/[,，]$/.test(span[0]!.orig) || ['and','up','down'].includes(tokens[i+n]?.norm??''))
          && /\b(?:hdfc bank|icici bank|canara bank|sbi)\b/i.test(headline)
          && /\b(?:banks?|banking)\b/i.test(headline) && /,/.test(headline)
          && /\b(?:shares?|stocks?|up|down|rise|rally|gain)\b/i.test(headline);
        if (entry.commonWord && !bankShorthand && !span.every((t) => /[A-Z]/.test(t.orig) && t.orig === t.orig.toUpperCase())) continue;
        if (entry.commonWord && !bankShorthand && !tokens.slice(Math.max(0, i - CONTEXT_WINDOW), i + n + CONTEXT_WINDOW).some((t) => COMPANY_CONTEXT.has(t.norm))) continue;
        // Headlines capitalise company names; a lower-case run is ordinary words ("to take over").
        if (!/^[\p{Lu}\p{N}]/u.test(trimMention(span[0]!.orig))) continue;
        // Plural acronyms in prose (e.g. MPs) are not a company named MPS.
        if (n === 1 && /^[A-Z]{2,}s$/.test(trimMention(span[0]!.orig))) continue;
        // An institution, analyst subsidiary, ownership qualifier or trading venue is
        // contextual attribution, not evidence that the listed issuer is the subject.
        // Possessives are separate normalized tokens ("SBI's Mutual Fund").
        const afterName = i + n + (tokens[i + n]?.norm === 's' ? 1 : 0);
        const nextWord = tokens[afterName]?.norm;
        const previousWord = tokens[i - 1]?.norm;
        const venuePreposition = previousWord === 'the' ? tokens[i - 2]?.norm : previousWord;
        const analystSubsidiary = nextWord === 'securities' || nextWord === 'mf' || (nextWord === 'mutual' && tokens[afterName + 1]?.norm === 'fund');
        // ITC in tax reporting means input tax credit. Preserve issuer subjects even
        // when their genuine corporate news concerns GST or taxation.
        const taxCredit = key === 'itc' && !COMPANY_CONTEXT.has(nextWord ?? '')
          && (/\b(?:claim|claims|claiming|avail|availing|eligible|eligibility|entitled|entitlement)\b/.test(tokens.slice(Math.max(0,i-4),i).map(t=>t.norm).join(' '))
            || /input tax credit/i.test(headline));
        const centralBank = key === 'bank of india' && previousWord === 'reserve';
        const ownership = nextWord === 'backed';
        const indexName = key === 'bse' && (nextWord === 'sensex' || /^\d+$/.test(nextWord ?? ''));
        const child = UNLISTED_CONTINUATIONS[key];
        const unlisted = (UNLISTED_MENTIONS.has(key) && !this.legalNames.has(key))
          || (child !== undefined && nextWord === child && !this.legalNames.has(`${key} ${child}`));
        const fundHouse = FUND_HOUSE_NAMES.has(key) && tokens.some(t=>t.norm==='aum')
          && !tokens.some(t=>['stock','stocks','share','shares'].includes(t.norm));
        const trailingAttribution = i+n===tokens.length && /:$/.test(tokens[i-1]?.orig ?? '')
          && tokens.slice(0,i).some(t=>/^(?:says?|said|sees?|seen|forecasts?|estimates?|expected|projected)$/.test(t.norm));
        const venue = ['bse', 'nse', 'mcx', 'multi commodity exchange'].includes(key)
          && ['on', 'at', 'via', 'through'].includes(venuePreposition ?? '')
          && !COMPANY_CONTEXT.has(nextWord ?? '');
        const attribution = isAttribution(tokens, i, n);
        if (taxCredit || analystSubsidiary || centralBank || ownership || venue || indexName || unlisted || fundHouse || trailingAttribution || attribution) {
          if (unlisted || fundHouse || trailingAttribution || attribution) unresolved.add(trimMention([...new Set(span.map(t=>t.orig))].join(' ')));
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
        const continuation = `${key} ${next?.norm}`;
        const conjunctionList = next?.norm === 'and' && tokens[i+n+1] !== undefined
          && !this.prefixes.has(`${continuation} ${tokens[i+n+1]!.norm}`)
          && !this.entries.has(`${continuation} ${tokens[i+n+1]!.norm}`);
        const truncated = next !== undefined && !conjunctionList && this.prefixes.has(continuation) && !this.entries.has(continuation);
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
