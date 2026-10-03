// Filing attachment text for summaries (ai-layer.md §3.1 steps 1–2). The attachment is fetched
// transiently; only the extracted text is kept, for audit (ingestion.md §3 rule 4).

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ATTACHMENT_HOSTS_DEFAULT, isAllowedAttachmentUrl } from '@stockpanic/core';
import { USER_AGENT } from '../ingestion/http.ts';
import type { FetchLike } from '../ingestion/http.ts';

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // [ASSUMPTION]
export const MAX_PDF_PAGES = 60; // the summary uses at most the first ~30,000 characters anyway
const TIMEOUT_MS = 30_000;

export type DocumentText = { ok: true; text: string; kind: 'pdf' | 'html' | 'text'; pages: number | null } | { ok: false; error: string };

export interface DocumentFetcher {
  fetchText(url: string): Promise<DocumentText>;
}

export async function pdfText(data: Uint8Array, maxPages = MAX_PDF_PAGES): Promise<{ text: string; pages: number }> {
  const task = getDocument({ data, disableFontFace: true, useSystemFonts: false });
  const doc = await task.promise;
  try {
    const parts: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      parts.push(content.items.map((i) => ('str' in i ? i.str + (i.hasEOL ? '\n' : ' ') : '')).join(''));
    }
    return { text: parts.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(), pages: doc.numPages };
  } finally {
    await task.destroy();
  }
}

const htmlText = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .trim();

const MAX_REDIRECTS = 3;

export class HttpDocumentFetcher implements DocumentFetcher {
  readonly #fetch: FetchLike;
  readonly #hosts: readonly string[];
  // ATTACHMENT_HOSTS (comma-separated) widens the allowlist when a feed vendor hosts copies (D-053).
  constructor(fetchImpl: FetchLike = fetch, hosts: readonly string[] = process.env['ATTACHMENT_HOSTS']?.split(',').map((h) => h.trim()).filter(Boolean) ?? ATTACHMENT_HOSTS_DEFAULT) {
    this.#fetch = fetchImpl;
    this.#hosts = hosts;
  }

  async fetchText(url: string): Promise<DocumentText> {
    let res: Response | null = null;
    let target = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      // Only exchange hosts, at every hop: a feed URL must not reach the private network (SSRF).
      if (!isAllowedAttachmentUrl(target, this.#hosts)) return { ok: false, error: `attachment host not allowed: ${new URL(target).hostname}` };
      try {
        res = await this.#fetch(target, { headers: { 'user-agent': USER_AGENT }, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (err) {
        return { ok: false, error: `request failed: ${(err as Error).message}` };
      }
      const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (!next) break;
      target = new URL(next, target).toString();
      res = null;
    }
    if (!res) return { ok: false, error: 'too many redirects' };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    if (Number(res.headers.get('content-length') ?? '0') > MAX_ATTACHMENT_BYTES) return { ok: false, error: 'attachment too large' };
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_ATTACHMENT_BYTES) return { ok: false, error: 'attachment too large' };
    const type = (res.headers.get('content-type') ?? '').toLowerCase();
    const isPdf = type.includes('pdf') || new TextDecoder().decode(buf.subarray(0, 5)) === '%PDF-';
    try {
      if (isPdf) {
        const { text, pages } = await pdfText(buf);
        return { ok: true, text, kind: 'pdf', pages };
      }
      const body = new TextDecoder().decode(buf);
      if (type.includes('html') || /<html[\s>]/i.test(body.slice(0, 2000))) return { ok: true, text: htmlText(body), kind: 'html', pages: null };
      if (type.startsWith('text/')) return { ok: true, text: body.trim(), kind: 'text', pages: null };
      return { ok: false, error: `unsupported attachment type: ${type || 'unknown'}` };
    } catch (err) {
      return { ok: false, error: `extraction failed: ${(err as Error).message}` };
    }
  }
}
