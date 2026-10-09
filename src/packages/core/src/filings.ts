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
  const publishedAt = publishedRaw && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(publishedRaw) ? new Date(publishedRaw) : null;
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

function providerPath(value:unknown,path:string):unknown {
  if(!/^[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+){0,7}$/.test(path)||path.split('.').some(p=>['__proto__','constructor','prototype'].includes(p))) throw new Error('invalid provider field path');
  let current=value;
  for(const part of path.split('.')) {
    if(!current||typeof current!=='object'||!Object.hasOwn(current,part)) return undefined;
    current=(current as Record<string,unknown>)[part];
  }
  return current;
}

// A licensed JSON vendor can be mapped without changing ingestion/storage. The
// operator must supply that vendor's documented fields; no exchange endpoints are guessed.
export function parseProviderPage(body:unknown,adapter:Record<string,unknown>,reconcile=false):{announcements:unknown[];nextCursor:string|null} {
  const mapping=adapter['mapping'];
  if(mapping!==undefined&&(!mapping||typeof mapping!=='object'||Array.isArray(mapping))) throw new Error('mapping must be an object');
  const m=(mapping??{}) as Record<string,unknown>;
  const listPath=m['announcements_path']??'announcements';
  const cursorPath=m['cursor_path']??'next_cursor';
  if(typeof listPath!=='string'||typeof cursorPath!=='string') throw new Error('invalid response mapping paths');
  const raw=providerPath(body,listPath);
  if(!Array.isArray(raw)) throw new Error('announcements is not an array');
  const cursor=providerPath(body,cursorPath);
  if(cursor!==null&&cursor!==undefined&&(typeof cursor!=='string'||cursor.length>4096)) throw new Error('invalid next cursor');
  if(reconcile&&typeof cursor==='string'&&cursor) throw new Error('reconciliation requires a complete list, not a partial page');
  const fields=m['fields'];
  if(fields===undefined) return {announcements:raw,nextCursor:typeof cursor==='string'&&cursor?cursor:null};
  if(!fields||typeof fields!=='object'||Array.isArray(fields)) throw new Error('fields must be an object');
  const allowed=['exchange','announcement_id','scrip_code','subject','category','published_at','url','attachment_url','status'];
  const f=fields as Record<string,unknown>;
  for(const [key,path] of Object.entries(f)) if(!allowed.includes(key)||typeof path!=='string') throw new Error('invalid envelope field mapping');
  const announcements=raw.map(row=>{
    const envelope:Record<string,unknown>={};
    for(const [key,path] of Object.entries(f)) envelope[key]=providerPath(row,path as string);
    if(envelope['exchange']===undefined&&m['exchange']!==undefined) envelope['exchange']=m['exchange'];
    for(const key of ['announcement_id','scrip_code']) if(typeof envelope[key]==='number'&&Number.isSafeInteger(envelope[key])) envelope[key]=String(envelope[key]);
    if(m['timezone']==='Asia/Kolkata'&&typeof envelope['published_at']==='string'&&/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(envelope['published_at'])) envelope['published_at']=envelope['published_at'].replace(' ','T')+'+05:30';
    if(envelope['status']!==undefined&&m['status_values']!==undefined) {
      const values=m['status_values'];
      if(!values||typeof values!=='object'||typeof envelope['status']!=='string'||!Object.hasOwn(values,envelope['status'])) throw new Error('unmapped provider status');
      envelope['status']=(values as Record<string,unknown>)[envelope['status']];
    }
    return envelope;
  });
  return {announcements,nextCursor:typeof cursor==='string'&&cursor?cursor:null};
}
