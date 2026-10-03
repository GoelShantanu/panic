import { describe, expect, it } from 'vitest';
import {
  ALERT_FIELDS,
  BANNED_ALERT_LANGUAGE,
  alertEmail,
  decideDelivery,
  digestDue,
  digestEmail,
  effectiveBudget,
  inQuietHours,
  istDay,
  parseHoldingsCsv,
  unsubscribeToken,
  verifyUnsubscribeToken,
} from './index.ts';
import type { AlertContent } from './index.ts';

// IST = UTC + 5:30
const ist = (hhmm: string) => new Date(`2026-10-05T${hhmm}:00+05:30`);

describe('IST scheduling', () => {
  it('IST day changes at IST midnight, not UTC midnight', () => {
    expect(istDay(new Date('2026-10-05T18:29:00Z'))).toBe('2026-10-05');
    expect(istDay(new Date('2026-10-05T18:31:00Z'))).toBe('2026-10-06');
  });

  it('quiet hours wrap midnight (22:00–08:00)', () => {
    expect(inQuietHours(ist('23:00'), '22:00', '08:00')).toBe(true);
    expect(inQuietHours(ist('07:59'), '22:00', '08:00')).toBe(true);
    expect(inQuietHours(ist('08:00'), '22:00', '08:00')).toBe(false);
    expect(inQuietHours(ist('12:00'), '22:00', '08:00')).toBe(false);
    expect(inQuietHours(ist('13:30'), '13:00', '14:00')).toBe(true);
  });

  it('digest is due once the IST clock passes the digest time', () => {
    expect(digestDue(ist('07:59'), '08:00')).toBe(false);
    expect(digestDue(ist('08:00'), '08:00')).toBe(true);
  });
});

describe('delivery decision (PRD-003 US-003.7)', () => {
  const base = { now: ist('10:00'), usedToday: 0, budget: 5, quietEnabled: true, quietStart: '22:00', quietEnd: '08:00', digestOnly: false };

  it('budget is clamped to the tier ceiling', () => {
    expect(effectiveBudget(30, 5)).toBe(5);
    expect(effectiveBudget(3, 30)).toBe(3);
    expect(effectiveBudget(-1, 5)).toBe(0);
  });

  it('individual within budget; digest beyond it, in quiet hours, or when digest-only', () => {
    expect(decideDelivery(base)).toBe('individual');
    expect(decideDelivery({ ...base, usedToday: 5 })).toBe('digest');
    expect(decideDelivery({ ...base, now: ist('23:00') })).toBe('digest');
    expect(decideDelivery({ ...base, now: ist('23:00'), quietEnabled: false })).toBe('individual');
    expect(decideDelivery({ ...base, digestOnly: true })).toBe('digest');
  });
});

describe('alert content (C-003.1, C-003.5)', () => {
  const c: AlertContent = {
    alert_id: 'al_X',
    kind: 'alert',
    story_id: 'st_X',
    instruments: [{ isin: 'INE000A01011', display_symbol: 'ASTERION' }],
    headline: 'Financial Results for the quarter ended September 30, 2026',
    source_name: 'BSE Announcements',
    story_time: new Date('2026-10-05T04:32:00Z'),
    url: 'https://stockpanic.example/s/st_X',
  };

  it('email carries symbol, headline, source, time and link, plus one-click unsubscribe headers', () => {
    const e = alertEmail(c, 'https://stockpanic.example/v1/alerts/unsubscribe?token=t');
    expect(e.subject).toBe('ASTERION: Financial Results for the quarter ended September 30, 2026');
    expect(e.text).toContain('BSE Announcements');
    expect(e.text).toContain('https://stockpanic.example/s/st_X');
    expect(e.headers).toEqual({
      'List-Unsubscribe': '<https://stockpanic.example/v1/alerts/unsubscribe?token=t>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('no urgency language or emoji in any template', () => {
    const texts = [alertEmail(c, 'u'), alertEmail({ ...c, kind: 'correction', removed_isin: 'INE000A01011' }, 'u'), digestEmail([c, c], 'u')];
    for (const t of texts) expect(`${t.subject}\n${t.text}`).not.toMatch(BANNED_ALERT_LANGUAGE);
    expect('🚀 Act now').toMatch(BANNED_ALERT_LANGUAGE);
  });

  it('the content object has only allow-listed fields', () => {
    expect(Object.keys(c).every((k) => (ALERT_FIELDS as readonly string[]).includes(k))).toBe(true);
  });

  it('a digest groups by instrument and counts stories', () => {
    const d = digestEmail([c, { ...c, story_id: 'st_Y', headline: 'Outcome of Board Meeting' }], 'u');
    expect(d.text).toMatch(/^2 stories about your watchlist/);
    expect(d.text.match(/ASTERION/g)).toHaveLength(1);
  });
});

describe('one-click unsubscribe token', () => {
  const secret = 'test-secret-that-is-at-least-32-chars!!';
  it('round-trips and rejects tampering or the wrong secret', () => {
    const t = unsubscribeToken(secret, 'us_ABC');
    expect(verifyUnsubscribeToken(secret, t)).toBe('us_ABC');
    expect(verifyUnsubscribeToken(secret, t.replace('us_ABC', 'us_XYZ'))).toBeNull();
    expect(verifyUnsubscribeToken('another-secret-that-is-32-chars-long!', t)).toBeNull();
    expect(verifyUnsubscribeToken(secret, 'garbage')).toBeNull();
  });
});

describe('holdings CSV import (PRD-003 US-003.2)', () => {
  it('reads ISIN and symbol columns only; quantities and prices are never returned (C-003.6)', () => {
    const r = parseHoldingsCsv('﻿Instrument,ISIN,Qty.,Avg. cost\nASTERION,INE000A01011,10,412.5\n"KESTREL, LTD",,5,99\n');
    expect(r).toEqual({
      rows: [
        { row: 2, isin: 'INE000A01011', symbol: 'ASTERION', raw: 'INE000A01011' },
        { row: 3, isin: null, symbol: 'KESTREL, LTD', raw: 'KESTREL, LTD' },
      ],
    });
    expect(JSON.stringify(r)).not.toMatch(/412|99/);
  });

  it('falls back to a symbol column', () => {
    expect(parseHoldingsCsv('Symbol,Quantity\nkestrel,4\n')).toEqual({ rows: [{ row: 2, isin: null, symbol: 'KESTREL', raw: 'KESTREL' }] });
  });

  it('reports files it cannot read', () => {
    expect(parseHoldingsCsv('')).toEqual({ error: 'empty file' });
    expect(parseHoldingsCsv('Name,Qty\nX,1')).toEqual({ error: 'No ISIN or symbol column found' });
  });
});
