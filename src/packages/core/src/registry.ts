// Exchange equity master lists → registry rows (entity-resolution.md §2.2; D-049).

import { parseIsin } from './isin.ts';

export interface MasterRow {
  code: string; // NSE symbol or BSE scrip code
  name: string; // legal name as listed
  isin: string;
  segment: 'mainboard' | 'sme';
  listedOn: string | null; // YYYY-MM-DD
}

// NSE SME platform series; everything else on the equity list is mainboard.
const NSE_SME_SERIES = new Set(['SM', 'ST', 'SZ']);
const MONTHS: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };

function nseDate(s: string): string | null {
  const m = /^(\d{2})-([A-Z]{3})-(\d{4})$/.exec(s.trim().toUpperCase());
  return m && MONTHS[m[2]!] ? `${m[3]}-${MONTHS[m[2]!]}-${m[1]}` : null;
}

function cells(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') out.push(cur.trim()), (cur = '');
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// NSE EQUITY_L.csv / SME_EQUITY_L.csv: SYMBOL, NAME OF COMPANY, SERIES, DATE OF LISTING, …, ISIN NUMBER, …
// Columns are found by header so a reordered file still parses; a malformed row is reported, not guessed.
export function parseNseEquityList(csv: string): { rows: MasterRow[]; rejected: { line: number; reason: string }[] } | { error: string } {
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return { error: 'empty file' };
  const head = cells(lines[0]!).map((h) => h.toUpperCase());
  const col = (name: string) => head.indexOf(name);
  const [iSym, iName, iSeries, iDate, iIsin] = [col('SYMBOL'), col('NAME OF COMPANY'), col('SERIES'), col('DATE OF LISTING'), col('ISIN NUMBER')];
  if ([iSym, iName, iIsin].some((i) => i < 0)) return { error: 'missing SYMBOL, NAME OF COMPANY or ISIN NUMBER column' };
  const rows: MasterRow[] = [];
  const rejected: { line: number; reason: string }[] = [];
  const seen = new Set<string>();
  lines.slice(1).forEach((line, k) => {
    const c = cells(line);
    const isin = (c[iIsin] ?? '').toUpperCase();
    const code = (c[iSym] ?? '').toUpperCase();
    const name = c[iName] ?? '';
    if (!parseIsin(isin)) return void rejected.push({ line: k + 2, reason: `invalid ISIN ${isin || '(empty)'}` });
    if (!code || !name) return void rejected.push({ line: k + 2, reason: 'missing symbol or name' });
    if (seen.has(isin)) return void rejected.push({ line: k + 2, reason: `duplicate ISIN ${isin}` });
    seen.add(isin);
    const series = iSeries >= 0 ? (c[iSeries] ?? '').toUpperCase() : '';
    rows.push({ code, name, isin, segment: NSE_SME_SERIES.has(series) ? 'sme' : 'mainboard', listedOn: iDate >= 0 ? nseDate(c[iDate] ?? '') : null });
  });
  return { rows, rejected };
}
