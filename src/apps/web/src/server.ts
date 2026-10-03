import { createServer } from 'node:http';
import type { IncomingMessage, Server } from 'node:http';
import type pg from 'pg';
import { SESSION_COOKIE } from '@stockpanic/core';
import { route } from './api.ts';
import type { AuthDeps } from './auth.ts';
import { handleWebhook } from './billing.ts';
import { INGEST_PREFIX, MAX_PUSH_BYTES, receivePush } from './ingest.ts';

const MAX_BODY_BYTES = 64 * 1024;
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

export function createApiServer(pool: pg.Pool, deps: AuthDeps | null = null): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let client: pg.PoolClient | undefined;
    try {
      // Vendor push: signed raw body, verified before parsing (ingestion.md §3).
      if (req.method === 'POST' && url.pathname.startsWith(INGEST_PREFIX)) {
        const raw = await readRaw(req, MAX_PUSH_BYTES);
        client = await pool.connect();
        const sig = req.headers['x-sp-signature'];
        const r = await receivePush(client, decodeURIComponent(url.pathname.slice(INGEST_PREFIX.length)), raw, typeof sig === 'string' ? sig : null, process.env, new Date());
        res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify(r.body));
        return;
      }
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
      client = await pool.connect();
      const r = await route(client, req.method ?? 'GET', url, new Date(), { body, sessionToken: sessionTokenFrom(req), ip: req.socket.remoteAddress ?? null }, deps);
      res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(r.headers ?? {}) });
      res.end(r.status === 204 ? undefined : JSON.stringify(r.body));
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
