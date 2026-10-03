'use client';

import Link from 'next/link';
import { useState } from 'react';

// Follow = add to watchlist (PRD-003 §2, PRD-004 US-004.3 AC-2). Hidden behind sign-in for visitors;
// disabled for delisted or merged companies (PRD-004 §7).
export function FollowButton({ isin, initial, signedIn, disabled }: { isin: string; initial: boolean; signedIn: boolean; disabled?: boolean }) {
  const [followed, setFollowed] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!signedIn) {
    return (
      <Link href="/sign-in" className="button">
        Sign in to follow
      </Link>
    );
  }
  async function toggle() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(followed ? `/v1/watchlist/${isin}` : '/v1/watchlist', {
      method: followed ? 'DELETE' : 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      ...(followed ? {} : { body: JSON.stringify({ isin }) }),
    }).catch(() => null);
    setBusy(false);
    if (res && (res.ok || res.status === 409)) setFollowed(!followed);
    else if (res?.status === 402) setMessage('Your watchlist is full on the free plan. Paid allows more companies.');
    else setMessage('That did not work. Try again.');
  }
  return (
    <span className="follow">
      <button type="button" className={followed ? 'button' : 'button button-primary'} aria-pressed={followed} disabled={busy || disabled} onClick={() => void toggle()}>
        {followed ? 'Following' : 'Follow'}
      </button>
      {message && (
        <span className="vote-error" role="status">
          {message} {message.includes('plan') && <Link href="/plans">See plans</Link>}
        </span>
      )}
    </span>
  );
}
