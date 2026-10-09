'use client';

import { useEffect, useState } from 'react';

// PRD-001 US-001.8, D-067: under 768 px participation remains limited, with watchlist/alerts enabled.
// CSS hides `.desktop-only` and shows
// `.phone-only`; this media query is the same breakpoint for script.
export const PHONE_QUERY = '(max-width: 767px)';
export const isPhone = () => typeof window !== 'undefined' && window.matchMedia?.(PHONE_QUERY).matches === true;

// AC-3: shown where voting/commenting would be.
export function PhoneNote() {
  return <p className="phone-only faint phone-note">Open on desktop to take part.</p>;
}

const KEY = 'sp.phone-notice-dismissed';

// AC-2: dismissible, remembered for the browser session.
export function PhoneNotice() {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(KEY) === '1');
    } catch {
      // storage blocked: the notice simply shows again
    }
  }, []);
  if (dismissed) return null;
  return (
    <div className="phone-only notice notice-warn phone-notice" role="status">
      <span>Manage your watchlist and alerts here. Voting and comments need desktop.</span>
      <button
        type="button"
        className="icon-button"
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(true);
          try {
            sessionStorage.setItem(KEY, '1');
          } catch {
            // not remembered; dismissed for this page view
          }
        }}
      >
        ✕
      </button>
    </div>
  );
}
