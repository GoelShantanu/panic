// Operator API calls from the console. Every write carries a reason; the server audits it.

export interface Result {
  status: number;
  body: any;
}

export async function adminCall(method: string, path: string, body?: unknown): Promise<Result> {
  const res = await fetch(path, { method, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }).catch(() => null);
  return { status: res?.status ?? 0, body: res && res.status !== 204 ? await res.json().catch(() => null) : null };
}

// Plain-language outcome for a console action.
export function outcome(r: Result, ok: string): string {
  if (r.status >= 200 && r.status < 300) return ok;
  if (r.status === 0) return 'No connection. Nothing was changed.';
  if (r.status === 403 && r.body?.error === 'mfa_required') return 'Your two-factor check has expired. Reload the page and enter a new code.';
  if (r.status === 400) return `Not accepted: ${r.body?.param ?? 'input'}${r.body?.detail ? ` (${r.body.detail})` : ''}.`;
  if (r.status === 404) return 'Not found. It may have been merged, removed or already handled.';
  if (r.status === 409) return `Not changed: ${String(r.body?.error ?? 'conflict').replace(/_/g, ' ')}.`;
  return `Failed (${r.status}). Nothing was changed.`;
}
