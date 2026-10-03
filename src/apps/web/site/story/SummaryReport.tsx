'use client';

import Link from 'next/link';
import { useState } from 'react';

// PRD-004 US-004.4 AC-5: readers can say a summary is wrong; an operator reviews it.
export function SummaryReport({ storyId, signedIn }: { storyId: string; signedIn: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  if (!signedIn) return <Link href={`/sign-in?next=${encodeURIComponent(`/s/${storyId}`)}`}>Sign in to report an inaccurate summary</Link>;
  if (msg) return <span role="status">{msg}</span>;
  return (
    <button
      type="button"
      className="link-button"
      onClick={async () => {
        const res = await fetch(`/v1/stories/${encodeURIComponent(storyId)}/summary/reports`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => null);
        const body = await res?.json().catch(() => null);
        if (res?.status === 201) setMsg('Thanks. An operator will check this summary against the filing.');
        else if (res?.status === 409) setMsg('You have already reported this summary.');
        else if (res?.status === 403) setMsg(body?.reason === 'email_unverified' ? 'Verify your email address to report.' : 'You cannot report this summary.');
        else setMsg('The report could not be sent. Try again.');
      }}
    >
      Report an inaccurate summary
    </button>
  );
}
