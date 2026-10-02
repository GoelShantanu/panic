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

interface Entry {
  isins: Set<string>;
  ambiguous: boolean;
  commonWord: boolean;
}

interface Token {
  norm: string;
  orig: string;
}

export class AliasIndex {
  private readonly entries = new Map<string, Entry>();
  private maxWords = 1;

  constructor(aliases: readonly AliasEntry[]) {
    for (const a of aliases) {
      const key = a.source === 'name' ? normaliseName(a.text) : normaliseForMatch(a.text);
      if (key === '') continue;
      const e = this.entries.get(key) ?? { isins: new Set<string>(), ambiguous: false, commonWord: false };
      e.isins.add(a.isin);
      e.ambiguous ||= a.ambiguous;
      e.commonWord ||= a.commonWord;
      this.entries.set(key, e);
      this.maxWords = Math.max(this.maxWords, key.split(' ').length);
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
        const entry = this.entries.get(span.map((t) => t.norm).join(' '));
        if (!entry) continue;
        if (entry.commonWord && !span.every((t) => /[A-Z]/.test(t.orig) && t.orig === t.orig.toUpperCase())) continue;
        const text = [...new Set(span.map((t) => t.orig))].join(' ');
        if (entry.ambiguous || entry.isins.size > 1) unresolved.add(text);
        else isins.add([...entry.isins][0]!);
        matched = n;
        break;
      }
      i += matched || 1;
    }
    return { isins: [...isins].sort(), unresolved: [...unresolved] };
  }
}
