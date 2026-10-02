import { createServer } from 'node:http';
import type { IncomingMessage, Server } from 'node:http';
import type pg from 'pg';
import { SESSION_COOKIE } from '@stockpanic/core';
import { route } from './api.ts';
import type { AuthDeps } from './auth.ts';

const MAX_BODY_BYTES = 64 * 1024;

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
async function readJson(req: IncomingMessage): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') return null;
  if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'unsupported_media_type');
  }
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'payload_too_large');
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

export function createApiServer(pool: pg.Pool, deps: AuthDeps | null = null): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let client: pg.PoolClient | undefined;
    try {
      const body = await readJson(req);
      client = await pool.connect();
      const r = await route(client, req.method ?? 'GET', url, new Date(), { body, sessionToken: sessionTokenFrom(req) }, deps);
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
