'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    google?: { accounts: { id: { initialize(o: { client_id: string; callback: (r: { credential: string }) => void }): void; renderButton(el: HTMLElement, o: Record<string, unknown>): void } } };
  }
}

async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  return { status: res?.status ?? 0, body: res && res.status !== 204 ? await res.json().catch(() => null) : null };
}

// PRD-007 US-007.1: email one-time code or Google. No passwords.
export function SignIn({ next, googleClientId }: { next: string; googleClientId: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googleRef = useRef<HTMLDivElement>(null);

  const after = (isNew: boolean) => {
    router.push(isNew ? `/welcome?next=${encodeURIComponent(next)}` : next);
    router.refresh();
  };

  useEffect(() => {
    if (!googleClientId || !googleRef.current) return;
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => {
      window.google?.accounts.id.initialize({
        client_id: googleClientId,
        callback: async ({ credential }) => {
          setError(null);
          const r = await post('/v1/auth/google', { id_token: credential });
          if (r.status === 200) after(r.body.is_new);
          else setError('Google sign-in did not work. Try the email code instead.');
        },
      });
      if (googleRef.current) window.google?.accounts.id.renderButton(googleRef.current, { theme: 'outline', size: 'large', text: 'continue_with', width: 320 });
    };
    document.head.appendChild(s);
    return () => s.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleClientId]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await post('/v1/auth/email/start', { email });
    setBusy(false);
    if (r.status === 204) setStep('code');
    else if (r.status === 400) setError('That email address does not look right.');
    else setError('Could not send a code. Try again in a moment.');
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await post('/v1/auth/email/verify', { email, code: code.trim() });
    setBusy(false);
    if (r.status === 200) return after(r.body.is_new);
    if (r.status === 423) setError('Too many wrong attempts. Request a new code.');
    else if (r.status === 400) setError('That code is not right, or it has expired.');
    else setError('Something went wrong. Try again.');
  }

  return (
    <div className="auth panel">
      <h1>Sign in or create an account</h1>
      {step === 'email' ? (
        <form onSubmit={start} className="form">
          <label>
            Email
            <input type="email" required autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button type="submit" className="button button-primary" disabled={busy}>
            Email me a sign-in code
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="form">
          <p className="muted">
            We sent a 6-digit code to <strong>{email}</strong>. It works once, for 10 minutes.
          </p>
          <label>
            Code
            <input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </label>
          <button type="submit" className="button button-primary" disabled={busy || code.length !== 6}>
            Continue
          </button>
          <button type="button" className="icon-button" onClick={() => (setStep('email'), setCode(''), setError(null))}>
            Use a different email or send a new code
          </button>
        </form>
      )}
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      {googleClientId && (
        <>
          <div className="divider-text">or</div>
          <div ref={googleRef} className="google-button" />
        </>
      )}
      <p className="faint auth-legal">
        New accounts need to be 18 or older. See the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Notice</Link>.
      </p>
    </div>
  );
}
