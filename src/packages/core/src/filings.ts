// Exchange filings: the vendor-neutral envelope every filings adapter produces (ingestion.md §3, D-035),
// and the push-delivery signature.

import { createHmac, timingSafeEqual } from 'node:crypto';

// StockPanic filing envelope, version 1. A vendor adapter maps its own format to this; nothing
// downstream knows the vendor. Subjects are stored verbatim (PRD-002 C-002.1).
export interface FilingEnvelope {
  exchange: 'NSE' | 'BSE';
  announcementId: string;
  scripCode: string;
  subject: string;
  category: string | null;
  publishedAt: Date;
  url: string;
  attachmentUrl: string | null;
  status: 'live' | 'withdrawn';
}

const HTTP_URL = /^https?:\/\/\S+$/;

export function parseFilingEnvelope(raw: unknown): { ok: true; value: FilingEnvelope } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'not an object' };
  const r = raw as Record<string, unknown>;
  const str = (k: string) => (typeof r[k] === 'string' ? (r[k] as string).trim() : null);
  const exchange = str('exchange');
  if (exchange !== 'NSE' && exchange !== 'BSE') return { ok: false, error: 'exchange' };
  const announcementId = str('announcement_id');
  if (!announcementId || announcementId.length > 200) return { ok: false, error: 'announcement_id' };
  const scripCode = str('scrip_code');
  if (!scripCode || scripCode.length > 50) return { ok: false, error: 'scrip_code' };
  const subject = typeof r['subject'] === 'string' ? (r['subject'] as string).replace(/\s+/g, ' ').trim() : '';
  if (!subject || subject.length > 2000) return { ok: false, error: 'subject' };
  const category = r['category'] === null || r['category'] === undefined ? null : str('category');
  if (r['category'] !== null && r['category'] !== undefined && !category) return { ok: false, error: 'category' };
  const publishedRaw = str('published_at');
  const publishedAt = publishedRaw && /^\d{4}-\d{2}-\d{2}T/.test(publishedRaw) ? new Date(publishedRaw) : null;
  if (!publishedAt || Number.isNaN(publishedAt.getTime())) return { ok: false, error: 'published_at' };
  const url = str('url');
  if (!url || !HTTP_URL.test(url)) return { ok: false, error: 'url' };
  const attachmentUrl = r['attachment_url'] === null || r['attachment_url'] === undefined ? null : str('attachment_url');
  if (attachmentUrl !== null && !HTTP_URL.test(attachmentUrl)) return { ok: false, error: 'attachment_url' };
  const status = r['status'] === undefined ? 'live' : r['status'];
  if (status !== 'live' && status !== 'withdrawn') return { ok: false, error: 'status' };
  return { ok: true, value: { exchange, announcementId, scripCode, subject, category, publishedAt, url, attachmentUrl, status } };
}

export const filingDedupKey = (e: Pick<FilingEnvelope, 'exchange' | 'announcementId'>) => `${e.exchange}:${e.announcementId}`;

// Push signature: header `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`. A vendor
// whose scheme differs gets a small translating receiver; the inbox contract stays the same.
export const SIGNATURE_TOLERANCE_S = 300;

export function signPush(secret: string, body: string, at: Date): string {
  const t = Math.floor(at.getTime() / 1000);
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
}

export function verifyPush(secret: string, body: string, header: string | null | undefined, now: Date): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=', 2) as [string, string]));
  const t = Number(parts['t']);
  const sig = parts['v1'];
  if (!Number.isInteger(t) || !sig || !/^[0-9a-f]{64}$/.test(sig)) return false;
  if (Math.abs(now.getTime() / 1000 - t) > SIGNATURE_TOLERANCE_S) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest();
  return timingSafeEqual(expected, Buffer.from(sig, 'hex'));
}

export const RECONCILIATION_ALERT_COVERAGE = 0.995; // ingestion.md §3.1
