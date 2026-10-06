'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

// PRD-007 US-007.1 AC-2, US-007.2, US-007.4 AC-2: username, 18+, Terms, and a separate unticked
// privacy consent. Marketing email is its own optional opt-in (AC-5).
export function Welcome({ next }: { next: string }) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validName = /^[A-Za-z0-9_]{3,20}$/.test(username);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/v1/auth/signup/complete', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, age_confirmed: age, terms_accepted: terms, privacy_consent: privacy, marketing_opt_in: marketing }),
    }).catch(() => null);
    setBusy(false);
    if (!res) return setError('No connection. Try again.');
    if (res.ok) {
      router.push(next === '/' ? '/watchlist?welcome=1' : next); // US-007.1 AC-5: watchlist setup next, skippable
      router.refresh();
      return;
    }
    const body = await res.json().catch(() => null);
    if (res.status === 401) setError('Your sign-in expired. Start again from Sign in.');
    else if (body?.error === 'username_taken') setError('That username is taken.');
    else if (body?.error === 'username_reserved') setError('That username is reserved. Choose another.');
    else if (body?.param === 'username') setError('Usernames are 3–20 letters, digits or underscores.');
    else setError('Please complete every required item.');
  }

  return (
    <div className="auth panel">
      <h1>Choose your username</h1>
      <form onSubmit={submit} className="form">
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required maxLength={20} aria-describedby="username-help" autoComplete="username" />
        </label>
        <p id="username-help" className="faint field-help">
          Shown on your comments. 3–20 letters, digits or underscores. You can change it once every 30 days.
        </p>
        <label className="check">
          <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} required />
          <span>I am 18 or older.</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} required />
          <span>
            I accept the <Link href="/terms" target="_blank">Terms of Use</Link>.
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} required />
          <span>
            I agree to StockPanic processing my data as described in the <Link href="/privacy" target="_blank">Privacy Notice</Link>.
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
          <span>Optional: email me occasional product news.</span>
        </label>
        <button type="submit" className="button button-primary" disabled={busy || !validName || !age || !terms || !privacy}>
          Create account
        </button>
      </form>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
