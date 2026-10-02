import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type pg from 'pg';
import { route } from './api.ts';

export function createApiServer(pool: pg.Pool): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let client: pg.PoolClient | undefined;
    try {
      client = await pool.connect();
      const r = await route(client, req.method ?? 'GET', url);
      res.writeHead(r.status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        ...(r.headers ?? {}),
      });
      res.end(JSON.stringify(r.body));
    } catch (err) {
      console.error(`${req.method} ${url.pathname}:`, err);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'internal' }));
    } finally {
      client?.release();
    }
  });
}
