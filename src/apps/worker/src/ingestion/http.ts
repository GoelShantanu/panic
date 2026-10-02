// Conditional GET for feeds (ingestion.md §4: ETag / If-Modified-Since, honour Retry-After).

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type FetchResult =
  | { status: 'ok'; body: string; etag: string | null; lastModified: string | null }
  | { status: 'not_modified' }
  | { status: 'error'; message: string; retryAfterSeconds: number | null };

export interface ConditionalGetOptions {
  etag: string | null;
  lastModified: string | null;
  timeoutMs?: number;
  maxBytes?: number;
  fetchImpl?: FetchLike;
}

export const USER_AGENT = 'StockPanicBot/0.1';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export function parseRetryAfter(value: string | null, now: Date = new Date()): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) return Number(value.trim());
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - now.getTime()) / 1000));
}

export async function conditionalGet(url: string, opts: ConditionalGetOptions): Promise<FetchResult> {
  const headers: Record<string, string> = {
    'user-agent': USER_AGENT,
    accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
  };
  if (opts.etag) headers['if-none-match'] = opts.etag;
  if (opts.lastModified) headers['if-modified-since'] = opts.lastModified;

  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    return { status: 'error', message: `request failed: ${(err as Error).message}`, retryAfterSeconds: null };
  }

  if (res.status === 304) return { status: 'not_modified' };
  if (!res.ok) {
    return {
      status: 'error',
      message: `HTTP ${res.status}`,
      retryAfterSeconds: parseRetryAfter(res.headers.get('retry-after')),
    };
  }

  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > maxBytes) return { status: 'error', message: `response too large: ${declared} bytes`, retryAfterSeconds: null };
  const buf = await res.arrayBuffer();
  if (buf.byteLength > maxBytes) return { status: 'error', message: `response too large: ${buf.byteLength} bytes`, retryAfterSeconds: null };

  return {
    status: 'ok',
    body: new TextDecoder().decode(buf),
    etag: res.headers.get('etag'),
    lastModified: res.headers.get('last-modified'),
  };
}
