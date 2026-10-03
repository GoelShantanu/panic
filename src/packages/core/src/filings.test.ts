import { describe, expect, it } from 'vitest';
import { filingDedupKey, parseFilingEnvelope, signPush, verifyPush } from './filings.ts';

// Fictional filing.
const valid = {
  exchange: 'BSE',
  announcement_id: 'A-1001',
  scrip_code: '500101',
  subject: '  Financial   Results for the quarter ended September 30, 2026 ',
  category: 'Result',
  published_at: '2026-10-03T10:15:00+05:30',
  url: 'https://exchange.example.in/ann/A-1001',
  attachment_url: 'https://exchange.example.in/att/A-1001.pdf',
};

describe('filing envelope v1', () => {
  it('parses and normalises whitespace in the subject only', () => {
    const r = parseFilingEnvelope(valid);
    expect(r).toEqual({
      ok: true,
      value: {
        exchange: 'BSE', announcementId: 'A-1001', scripCode: '500101', subject: 'Financial Results for the quarter ended September 30, 2026',
        category: 'Result', publishedAt: new Date('2026-10-03T04:45:00Z'), url: valid.url, attachmentUrl: valid.attachment_url, status: 'live',
      },
    });
    expect(filingDedupKey({ exchange: 'BSE', announcementId: 'A-1001' })).toBe('BSE:A-1001');
  });

  it('category and attachment are optional; withdrawn is a status', () => {
    const r = parseFilingEnvelope({ ...valid, category: null, attachment_url: null, status: 'withdrawn' });
    expect(r.ok && r.value).toMatchObject({ category: null, attachmentUrl: null, status: 'withdrawn' });
  });

  it.each([
    ['exchange', { exchange: 'MCX' }],
    ['announcement_id', { announcement_id: '' }],
    ['scrip_code', { scrip_code: null }],
    ['subject', { subject: '   ' }],
    ['published_at', { published_at: '03/10/2026' }],
    ['url', { url: 'ftp://x' }],
    ['attachment_url', { attachment_url: 'javascript:alert(1)' }],
    ['status', { status: 'deleted' }],
  ])('rejects a bad %s', (field, patch) => {
    expect(parseFilingEnvelope({ ...valid, ...patch })).toEqual({ ok: false, error: field });
  });
});

describe('push signature', () => {
  const secret = 'a-vendor-shared-secret-of-32-chars-or-more';
  const now = new Date('2026-10-03T05:00:00Z');
  const body = JSON.stringify(valid);

  it('verifies a fresh, untampered delivery', () => {
    expect(verifyPush(secret, body, signPush(secret, body, now), now)).toBe(true);
  });
  it('rejects tampering, a wrong secret, replay after 5 minutes, and junk', () => {
    const sig = signPush(secret, body, now);
    expect(verifyPush(secret, body.replace('A-1001', 'A-1002'), sig, now)).toBe(false);
    expect(verifyPush(`${secret}x`, body, sig, now)).toBe(false);
    expect(verifyPush(secret, body, sig, new Date(now.getTime() + 301_000))).toBe(false);
    expect(verifyPush(secret, body, 'v1=abc', now)).toBe(false);
    expect(verifyPush(secret, body, null, now)).toBe(false);
  });
});
