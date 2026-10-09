// Server-side API access for pages: the same JSON API the browser uses, over loopback, carrying the
// visitor's cookie. Pages never import database code (D-040).
import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';

export interface ApiResult<T> {
  status: number;
  body: T;
}

// React invalidates this cache for every server render request. A visitor's cookie and data
// never enter a process-wide cache; layout and page share the same in-flight read (D-067).
const readApi = cache(async (path: string): Promise<ApiResult<unknown>> => {
  const origin = process.env['SP_INTERNAL_ORIGIN'];
  if (!origin) throw new Error('SP_INTERNAL_ORIGIN is not set (the page server must start through src/cli/serve.ts)');
  const cookie = (await cookies()).toString();
  const res = await fetch(`${origin}${path}`, { headers: cookie ? { cookie } : {}, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(10_000) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
});

export async function api<T>(path: string): Promise<ApiResult<T>> {
  return await readApi(path) as ApiResult<T>;
}
