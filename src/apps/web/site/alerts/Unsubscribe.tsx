'use client';

import { useState } from 'react';

// One-click unsubscribe from an email (PRD-003 US-003.6 AC-4): works without signing in. The action is
// a POST, so link scanners that prefetch the page never unsubscribe anyone.
export function Unsubscribe({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'error'>('idle');
  if (state === 'done') return <p>Done. You will get no more alert or digest emails. You can turn them back on in alert settings.</p>;
  return (
    <>
      <button
        type="button"
        className="button button-primary"
        onClick={async () => {
          // JSON body: every browser write is JSON (cross-site request forgery protection, server.ts).
          const res = await fetch(`/v1/alerts/unsubscribe?token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => null);
          setState(res?.ok ? 'done' : 'error');
        }}
      >
        Stop alert emails
      </button>
      {state === 'error' && <p className="notice notice-error">This link is not valid any more. Sign in to change alert settings.</p>}
    </>
  );
}
