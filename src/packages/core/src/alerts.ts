// Watchlist and alert rules (PRD-003). All scheduling is in IST (PRD-003 §7).

import { createHmac } from 'node:crypto';
import { safeEqualHex } from './auth.ts';

const IST_OFFSET_MS = 5.5 * 3600_000;

export function istDay(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function istMinutes(d: Date): number {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

const toMinutes = (hhmm: string) => {
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(hhmm);
  if (!m) throw new Error(`bad time: ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
};

// PRD-003 US-003.7 AC-4: quiet hours may wrap midnight (22:00–08:00).
export function inQuietHours(now: Date, start: string, end: string): boolean {
  const t = istMinutes(now);
  const s = toMinutes(start);
  const e = toMinutes(end);
  return s <= e ? t >= s && t < e : t >= s || t < e;
}

// The user's budget, clamped to the tier ceiling (PRD-007 §2.1, §6: clamps when a trial ends).
export function effectiveBudget(userBudget: number, tierCeiling: number): number {
  return Math.max(0, Math.min(userBudget, tierCeiling));
}

export type DeliveryDecision = 'individual' | 'digest';

// PRD-003 US-003.7: over budget, quiet hours, or digest-only → digest. Never dropped (C-003.4).
export function decideDelivery(input: { now: Date; usedToday: number; budget: number; quietEnabled: boolean; quietStart: string; quietEnd: string; digestOnly: boolean }): DeliveryDecision {
  if (input.digestOnly) return 'digest';
  if (input.quietEnabled && inQuietHours(input.now, input.quietStart, input.quietEnd)) return 'digest';
  return input.usedToday < input.budget ? 'individual' : 'digest';
}

// The digest is due once the IST clock passes the user's digest time.
export function digestDue(now: Date, digestTime: string): boolean {
  return istMinutes(now) >= toMinutes(digestTime);
}

// ------------------------------------------------------------ alert content (C-003.1, C-003.5)

export interface AlertContent {
  alert_id: string;
  kind: 'alert' | 'correction';
  story_id: string;
  instruments: { isin: string; display_symbol: string | null }[];
  headline: string;
  source_name: string;
  story_time: Date;
  url: string;
  corrects_alert_id?: string;
  removed_isin?: string;
}

export const ALERT_FIELDS = ['alert_id', 'kind', 'story_id', 'instruments', 'headline', 'source_name', 'story_time', 'url', 'corrects_alert_id', 'removed_isin'] as const;

const symbols = (c: AlertContent) => c.instruments.map((i) => i.display_symbol ?? i.isin).join(', ');

// Email links (PRD-003 US-003.6 AC-4): the List-Unsubscribe header points at the one-click API
// (RFC 8058); the body links a human-readable unsubscribe page and alert settings.
export interface EmailLinks {
  oneClick: string;
  page: string;
  settings: string;
}

const istStamp = (d: Date) =>
  `${new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)} IST`;

const footer = (l: EmailLinks) => [`Alert settings: ${l.settings}`, `Stop alert emails: ${l.page}`];

export function alertEmail(c: AlertContent, links: EmailLinks): { subject: string; text: string; headers: Record<string, string> } {
  const headers = { 'List-Unsubscribe': `<${links.oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
  if (c.kind === 'correction') {
    return {
      subject: `Correction: ${c.headline}`,
      text: [`Correction: the alert about "${c.headline}" was not about ${c.removed_isin}.`, '', c.url, '', ...footer(links)].join('\n'),
      headers,
    };
  }
  return {
    subject: `${symbols(c)}: ${c.headline}`,
    text: [`${symbols(c)}`, c.headline, `${c.source_name} · ${istStamp(c.story_time)}`, '', c.url, '', ...footer(links)].join('\n'),
    headers,
  };
}

export function digestEmail(items: readonly AlertContent[], links: EmailLinks): { subject: string; text: string; headers: Record<string, string> } {
  const byInstrument = new Map<string, AlertContent[]>();
  for (const it of items) {
    const key = symbols(it) || 'Other';
    byInstrument.set(key, [...(byInstrument.get(key) ?? []), it]);
  }
  const lines: string[] = [`${items.length} ${items.length === 1 ? 'story' : 'stories'} about your watchlist that were not sent individually.`, ''];
  for (const [key, group] of byInstrument) {
    lines.push(key);
    for (const g of [...group].sort((a, b) => b.story_time.getTime() - a.story_time.getTime())) lines.push(`  ${g.headline} (${g.source_name})`, `  ${g.url}`);
    lines.push('');
  }
  lines.push(...footer(links));
  return {
    subject: 'Your StockPanic digest',
    text: lines.join('\n'),
    headers: { 'List-Unsubscribe': `<${links.oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

// C-003.5: templates are linted against urgency language and emoji.
export const BANNED_ALERT_LANGUAGE = /act now|don'?t miss|hurry|last chance|urgent|limited time|\p{Extended_Pictographic}/iu;

// ------------------------------------------------------------ one-click unsubscribe (US-003.6 AC-4)

export function unsubscribeToken(secret: string, userPublicId: string): string {
  return `${userPublicId}.${createHmac('sha256', secret).update(`unsubscribe:${userPublicId}`).digest('hex')}`;
}

export function verifyUnsubscribeToken(secret: string, token: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const id = token.slice(0, dot);
  const expected = unsubscribeToken(secret, id).slice(dot + 1);
  return safeEqualHex(token.slice(dot + 1), expected) ? id : null;
}

// ------------------------------------------------------------ CSV import (PRD-003 US-003.2)

export interface CsvRow {
  row: number;
  isin: string | null;
  symbol: string | null;
  raw: string;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

// Finds an ISIN column first, then a symbol column, by header name. Only those two columns are
// read; quantities, prices and every other column are never returned (C-003.6).
export function parseHoldingsCsv(text: string): { rows: CsvRow[] } | { error: string } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return { error: 'empty file' };
  const header = splitCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const isinCol = header.findIndex((h) => /\bisin\b/.test(h));
  const symbolCol = header.findIndex((h) => /\b(symbol|trading ?symbol|tradingsymbol|scrip|instrument|ticker|stock)\b/.test(h));
  if (isinCol < 0 && symbolCol < 0) return { error: 'No ISIN or symbol column found' };
  const rows: CsvRow[] = [];
  lines.slice(1).forEach((line, i) => {
    const cells = splitCsvLine(line);
    const isin = isinCol >= 0 ? cells[isinCol]?.toUpperCase() || null : null;
    const symbol = symbolCol >= 0 ? cells[symbolCol]?.toUpperCase() || null : null;
    if (isin || symbol) rows.push({ row: i + 2, isin, symbol, raw: (isin ?? symbol)! });
  });
  return { rows };
}
