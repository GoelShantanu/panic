import { createServer, request as httpRequest } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type pg from 'pg';
import { SESSION_COOKIE } from '@stockpanic/core';
import { route } from './api.ts';
import type { AuthDeps } from './auth.ts';
import { handleWebhook } from './billing.ts';

const MAX_BODY_BYTES = 64 * 1024;
// About one NFR-001.3 budget (300 ms) of queueing at measured throughput (docs/qa/test-strategy.md §3).
const MAX_DB_QUEUE = 20;
const LATEST_CACHE_MS = 2_000;
const MAX_IMPORT_BODY_BYTES = 1536 * 1024; // CSV text (≤ 1 MB) inside JSON
const UNSUBSCRIBE_PATH = '/v1/alerts/unsubscribe';

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function sessionTokenFrom(req: IncomingMessage): string | null {
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim() || null;
  for (const part of (req.headers['cookie'] ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === SESSION_COOKIE) return v.join('=') || null;
  }
  return null;
}

// State-changing requests must be JSON: browsers cannot send cross-site JSON without a CORS
// preflight, which together with SameSite=Lax cookies blocks cross-site request forgery.
// The token-authenticated one-click unsubscribe is the one exception (RFC 8058 posts a form).
async function readJson(req: IncomingMessage, pathname: string): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') return null;
  const type = (req.headers['content-type'] ?? '').toLowerCase();
  if (pathname === UNSUBSCRIBE_PATH && type.startsWith('application/x-www-form-urlencoded')) {
    await readRaw(req, 0, false);
    return null;
  }
  if (!type.startsWith('application/json')) {
    await readRaw(req, 0, false);
    throw new HttpError(415, 'unsupported_media_type');
  }
  const raw = await readRaw(req, pathname === '/v1/watchlist/import/preview' ? MAX_IMPORT_BODY_BYTES : MAX_BODY_BYTES);
  if (raw === '') return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

// Over the limit, the rest of the upload is read and discarded so the client receives the 413;
// stopping mid-upload resets the connection instead. Past DRAIN_CAP_BYTES the connection is cut.
const DRAIN_CAP_BYTES = 32 * 1024 * 1024;

async function readRaw(req: IncomingMessage, limit: number, enforce = true): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size <= limit) chunks.push(chunk as Buffer);
    else if (size > DRAIN_CAP_BYTES) break;
  }
  if (enforce && size > limit) throw new HttpError(413, 'payload_too_large');
  return Buffer.concat(chunks).toString('utf8');
}

export interface SiteOptions {
  // Renders every non-API path (the Next.js page handler, ADR-002).
  pages?: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  // The SSE live channel runs in apps/live (ADR-005); /v1/live is passed through so pages stay same-origin.
  liveOrigin?: string;
  // Requests waiting for a database connection before new ones get 503 (default MAX_DB_QUEUE).
  maxDbQueue?: number;
}

function proxyLive(req: IncomingMessage, res: ServerResponse, origin: string) {
  const target = new URL(req.url ?? '/v1/live', origin);
  const headers: Record<string, string> = { accept: 'text/event-stream' };
  const lastId = req.headers['last-event-id'];
  if (typeof lastId === 'string') headers['last-event-id'] = lastId;
  const upstream = httpRequest(target, { method: 'GET', headers }, (up) => {
    res.writeHead(up.statusCode ?? 502, { ...up.headers, 'x-accel-buffering': 'no' });
    up.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'live_unavailable' }));
  });
  // IncomingMessage 'close' fires when the request has been read, which is immediate for GET.
  // The response stays open for SSE; close the upstream only when the client response closes.
  res.on('close', () => upstream.destroy());
  upstream.end();
}

// Behind the reverse proxy (ADR-003) every socket is the proxy's. With TRUST_PROXY=1 the client is the
// last X-Forwarded-For entry, the one our proxy appended; earlier entries are client-supplied (D-053).
export function clientIp(req: IncomingMessage, trustProxy = process.env['TRUST_PROXY'] === '1'): string | null {
  const fwd = req.headers['x-forwarded-for'];
  const raw = trustProxy && typeof fwd === 'string' && fwd.trim() ? fwd.split(',').at(-1)!.trim() : req.socket.remoteAddress ?? null;
  return raw ? raw.replace(/^::ffff:/, '') : null;
}

const PRODUCTION = process.env['NODE_ENV'] === 'production';
// Third parties the pages load: Google Identity (sign-in) and Razorpay Checkout (D-036). Inline scripts
// are still allowed because Next.js streams inline payloads; React escapes rendered text (D-053).
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${PRODUCTION ? '' : " 'unsafe-eval'"} https://accounts.google.com https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://accounts.google.com https://api.razorpay.com https://lumberjack.razorpay.com${PRODUCTION ? '' : ' ws: wss:'}`,
  'frame-src https://accounts.google.com https://api.razorpay.com https://checkout.razorpay.com',
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function securityHeaders(res: ServerResponse): void {
  res.setHeader('content-security-policy', CSP);
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com")');
  if (PRODUCTION) res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
}

export function createApiServer(pool: pg.Pool, deps: AuthDeps | null = null, site: SiteOptions = {}): Server {
  let latestCache: { until: number; body: string } | null = null;
  let latestPending: Promise<string | null> | null = null;
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    securityHeaders(res);
    if (site.liveOrigin && url.pathname === '/v1/live') return proxyLive(req, res, site.liveOrigin);
    if (site.pages && !url.pathname.startsWith('/v1/')) {
      try {
        await site.pages(req, res);
      } catch (err) {
        console.error(`page ${url.pathname}:`, err);
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Something went wrong.');
      }
      return;
    }
    let client: pg.PoolClient | undefined;
    try {
      // Payment provider webhook: signature over the raw body (D-036).
      if (req.method === 'POST' && url.pathname === '/v1/billing/webhook') {
        const raw = await readRaw(req, MAX_BODY_BYTES);
        client = await pool.connect();
        const header = (n: string) => (typeof req.headers[n] === 'string' ? (req.headers[n] as string) : null);
        const r = await handleWebhook(client, raw, header('x-razorpay-signature'), header('x-razorpay-event-id'), deps?.billing ?? null, new Date());
        res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify(r.body));
        return;
      }
      const body = await readJson(req, url.pathname);
      const sessionToken = sessionTokenFrom(req);
      // The anonymous first page of Latest is the same for every visitor: one computation serves
      // everyone for LATEST_CACHE_MS, and concurrent misses wait for it (D-050).
      const cacheable = req.method === 'GET' && url.pathname === '/v1/stream' && url.search === '' && !sessionToken;
      if (cacheable) {
        const fresh = latestCache && latestCache.until > Date.now() ? latestCache.body : await (latestPending ?? Promise.resolve(null));
        if (fresh) {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
          res.end(fresh);
          return;
        }
      }
      // Past capacity, fail fast rather than queue for tens of seconds (QA load test, D-050).
      if (pool.waitingCount >= (site.maxDbQueue ?? MAX_DB_QUEUE)) {
        res.writeHead(503, { 'content-type': 'application/json; charset=utf-8', 'retry-after': '2' });
        res.end('{"error":"overloaded"}');
        return;
      }
      let settle: ((v: string | null) => void) | undefined;
      if (cacheable) latestPending = new Promise((r) => (settle = r));
      try {
        client = await pool.connect();
        const r = await route(client, req.method ?? 'GET', url, new Date(), { body, sessionToken, ip: clientIp(req) }, deps);
        const text = r.status === 204 || r.status === 302 ? undefined : JSON.stringify(r.body);
        if (cacheable && r.status === 200 && text) latestCache = { until: Date.now() + LATEST_CACHE_MS, body: text };
        settle?.(cacheable && r.status === 200 ? (text ?? null) : null);
        res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(r.headers ?? {}) });
        res.end(text);
      } finally {
        if (cacheable) {
          settle?.(null);
          latestPending = null;
        }
      }
    } catch (err) {
      if (err instanceof HttpError) {
        res.writeHead(err.status, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
      console.error(`${req.method} ${url.pathname}:`, err);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'internal' }));
    } finally {
      client?.release();
    }
  });
}
