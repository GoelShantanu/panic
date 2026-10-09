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
type Mode = 'login' | 'signup' | 'reset' | 'google';

export function SignIn({ next, googleClientId, initialMode = 'login' }: { next: string; googleClientId: string | null; initialMode?: 'login' | 'reset' }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState<'entry' | 'verify'>('entry');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState(false);
  const googleRef = useRef<HTMLDivElement>(null);
  const googleToken = useRef<string | null>(null);
  const after = (isNew: boolean) => {
    router.push(isNew ? `/welcome?next=${encodeURIComponent(next)}` : next);
    router.refresh();
  };
  const changeMode = (value: Mode) => {
    setMode(value); setStep('entry'); setPassword(''); setConfirmPassword(''); setCode(''); setError(null); setNotice(null);
  };

  useEffect(() => {
    if (!googleClientId || !googleRef.current) return;
    let active = true;
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onerror = () => { if (active) setGoogleError(true); };
    s.onload = () => {
      if (!active || !window.google) { if (active) setGoogleError(true); return; }
      window.google.accounts.id.initialize({ client_id: googleClientId, callback: async ({ credential }) => {
        if (!active) return;
        setBusy(true); setError(null);
        googleToken.current = credential;
        const r = await post('/v1/auth/google', { id_token: credential });
        if (!active) return;
        setBusy(false); setPassword('');
        if (r.status === 200) after(r.body.is_new);
        else if (r.status === 202) { setEmail(r.body.email); setMode('google'); setStep('verify'); setCode(''); }
        else setError('Google sign-in did not work. Please try again or use email.');
      } });
      if (googleRef.current) window.google.accounts.id.renderButton(googleRef.current, { theme: 'outline', size: 'large', text: 'continue_with', width: 340 });
    };
    document.head.appendChild(s);
    return () => { active = false; s.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleClientId, next]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    const path = mode === 'login' ? '/v1/auth/password/sign-in' : mode === 'signup' ? '/v1/auth/password/signup/start' : '/v1/auth/password/reset/start';
    const r = await post(path, { email, ...(mode === 'login' || mode === 'signup' ? { password } : {}), ...(mode === 'signup' ? { first_name: firstName, last_name: lastName } : {}) });
    setBusy(false);
    if (mode === 'login' && r.status === 200) { setPassword(''); return after(false); }
    if (r.status === 204) { setStep('verify'); setPassword(''); return; }
    if (r.status === 429) setError('Too many attempts. Please try again later.');
    else if (mode === 'login' && r.status === 401) setError('Email or password is incorrect. If you previously used an email code, use Forgot password to set a password.');
    else if (r.body?.param === 'password') setError('Use a password with 15–128 characters.');
    else if (r.status === 400) setError('Please check the information you entered.');
    else setError('Could not complete your request. Please try again.');
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (mode === 'reset' && password !== confirmPassword) return setError('Passwords do not match.');
    setBusy(true); setError(null);
    const path = mode === 'signup' ? '/v1/auth/password/signup/verify' : mode === 'reset' ? '/v1/auth/password/reset/complete' : '/v1/auth/google/verify';
    const r = await post(path, { email, code: code.trim(), ...(mode === 'reset' ? { password } : {}) });
    setBusy(false);
    if (mode === 'reset' && r.status === 204) {
      changeMode('login'); setNotice('Password saved. Sign in with your email and new password.'); return;
    }
    if (r.status === 200) return after(r.body.is_new);
    if (r.status === 423) setError('Too many wrong attempts. Request a new code.');
    else if (r.status === 429) setError('Too many attempts. Please try again later.');
    else if (r.body?.param === 'password') setError('Use a password with 15–128 characters.');
    else if (r.body?.error === 'account_exists') setError('This email already has an account. Sign in or reset your password.');
    else if (r.body?.error === 'google_already_linked') setError('This account is already linked to a different Google account.');
    else if (r.status === 400) setError('That code is not right, or it has expired.');
    else setError('Could not verify your code. Please try again.');
  }

  async function resend() {
    if (busy) return;
    if (mode === 'signup') { setStep('entry'); setCode(''); setError(null); return; }
    setBusy(true); setError(null); setNotice(null);
    const r = await post(mode === 'reset' ? '/v1/auth/password/reset/start' : '/v1/auth/google', mode === 'google' ? { id_token: googleToken.current } : { email });
    setBusy(false); setCode('');
    if (mode === 'google' && r.status === 200) return after(r.body.is_new);
    if (r.status === 204 || r.status === 202) setNotice('If eligible, a new code has been sent.');
    else setError('Could not send a new code. Please try again later.');
  }

  const heading = step === 'verify' ? mode === 'reset' ? 'Choose a new password' : 'Verify your email' : mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back';
  return (
    <div className="auth panel">
      <h1>{heading}</h1>
      <p className="muted auth-intro">{mode === 'login' ? 'Sign in to follow companies and keep your news in one place.' : mode === 'signup' ? 'Start with your details. We’ll verify your email before creating your account.' : mode === 'reset' ? 'The recovery code only resets your password. You’ll sign in afterward.' : 'Confirm your email to finish connecting your Google account.'}</p>
      {step === 'entry' ? (
        <form onSubmit={start} className="form">
          {mode === 'signup' && <div className="auth-name-row">
            <label>First name<input required maxLength={80} autoComplete="given-name" value={firstName} onChange={e => setFirstName(e.target.value)} /></label>
            <label>Last name<input required maxLength={80} autoComplete="family-name" value={lastName} onChange={e => setLastName(e.target.value)} /></label>
          </div>}
          <label>Email<input type="email" required autoComplete={mode === 'login' ? 'username' : 'email'} autoFocus value={email} onChange={e => setEmail(e.target.value)} /></label>
          {(mode === 'login' || mode === 'signup') && <label>Password<input type="password" required minLength={mode === 'signup' ? 15 : undefined} maxLength={128} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} /></label>}
          {mode === 'signup' && <p className="faint field-help">Use 15–128 characters. A unique passphrase works well.</p>}
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Send verification code' : 'Send password reset code'}</button>
          {mode === 'login' && <button type="button" className="auth-text-button" disabled={busy} onClick={() => changeMode('reset')}>Forgot password?</button>}
        </form>
      ) : (
        <form onSubmit={verify} className="form">
          <p className="muted">Check your inbox for a 6-digit code at <strong>{email}</strong>. It works once, for 10 minutes.{mode === 'reset' && ' We only send recovery codes for existing accounts.'}{mode === 'signup' && ' Already registered? Sign in or reset your password instead.'}</p>
          <label>Code<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="one-time-code" autoFocus value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></label>
          {mode === 'reset' && <>
            <label>New password<input type="password" required minLength={15} maxLength={128} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
            <label>Confirm new password<input type="password" required minLength={15} maxLength={128} autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></label>
            <p className="faint field-help">Use 15–128 characters. Saving signs out your other sessions.</p>
          </>}
          <button type="submit" className="button button-primary" disabled={busy || code.length !== 6}>{busy ? 'Please wait…' : mode === 'reset' ? 'Save new password' : 'Verify email'}</button>
          <button type="button" className="auth-text-button" disabled={busy} onClick={() => void resend()}>{mode === 'signup' ? 'Start again and send a new code' : 'Send a new code'}</button>
          {mode !== 'google' && <button type="button" className="auth-text-button" disabled={busy} onClick={() => { setStep('entry'); setCode(''); setPassword(''); setError(null); }}>Use a different email</button>}
        </form>
      )}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      <div className="auth-switches">
        {mode !== 'login' && <button type="button" className="auth-text-button" disabled={busy} onClick={() => changeMode('login')}>Back to sign in</button>}
        {mode !== 'signup' && <button type="button" className="auth-text-button" disabled={busy} onClick={() => changeMode('signup')}>Create an account</button>}
      </div>
      <div className="divider-text">or</div>
      <div ref={googleRef} className="google-button" hidden={!googleClientId || googleError || step === 'verify'} />
      {(!googleClientId || googleError) && <>
        <button type="button" className="button auth-google-unavailable" disabled>Continue with Google</button>
        <p className="faint auth-google-note">{googleError ? 'Google could not load. Please use email or try again later.' : 'Google sign-in is not available yet. Please use email.'}</p>
      </>}
      <p className="faint auth-legal">New accounts need to be 18 or older. See the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Notice</Link>.</p>
    </div>
  );
}
