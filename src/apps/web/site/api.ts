// Server-side API access for pages: the same JSON API the browser uses, over loopback, carrying the
// visitor's cookie. Pages never import database code (D-040).
import 'server-only';
import { cookies } from 'next/headers';

export interface ApiResult<T> {
  status: number;
  body: T;
}

export async function api<T>(path: string): Promise<ApiResult<T>> {
  const origin = process.env['SP_INTERNAL_ORIGIN'];
  if (!origin) throw new Error('SP_INTERNAL_ORIGIN is not set (the page server must start through src/cli/serve.ts)');
  const cookie = (await cookies()).toString();
  const res = await fetch(`${origin}${path}`, { headers: cookie ? { cookie } : {}, cache: 'no-store', redirect: 'manual' });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}
