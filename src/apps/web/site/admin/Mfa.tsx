'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { adminCall } from './call.ts';

function CodeForm({ path, label, onDone }: { path: string; label: string; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="inline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await adminCall('POST', path, { code: code.trim() });
        if (r.status === 200) return onDone();
        setError(r.status === 429 ? 'Too many attempts. Wait 15 minutes.' : r.body?.error === 'invalid_code' ? 'That code is not right. Check the time on your phone and try the next code.' : 'Could not verify. Try again.');
      }}
    >
      <label className="stack-label">
        {label}
        <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
      </label>
      <button type="submit" className="button button-primary" disabled={code.trim().length !== 6}>
        Verify
      </button>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

// PRD-007 US-007.5 AC-2: operators enrol an authenticator app before any moderation action.
export function TotpEnrol() {
  const router = useRouter();
  const [secret, setSecret] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="panel settings-section">
      <h2>Set up two-factor sign-in</h2>
      <p>The operator console needs a code from an authenticator app (for example Google Authenticator or 1Password) on every session.</p>
      {!secret ? (
        <button
          type="button"
          className="button button-primary"
          onClick={async () => {
            const r = await adminCall('POST', '/v1/me/totp/enrol');
            if (r.status === 200) setSecret(r.body);
            else setError('Could not start set-up. Reload and try again.');
          }}
        >
          Start set-up
        </button>
      ) : (
        <>
          <p>
            In your authenticator app, add an account by entering this key by hand. It is shown once.
          </p>
          <p className="mono totp-secret">{secret.secret.replace(/(.{4})/g, '$1 ').trim()}</p>
          <p className="faint">
            Or open this setup link on the device with the app: <a href={secret.otpauth_uri}>otpauth link</a>
          </p>
          <CodeForm path="/v1/me/totp/confirm" label="Code from the app" onDone={() => router.refresh()} />
        </>
      )}
      {error && <p className="notice notice-error">{error}</p>}
    </section>
  );
}

export function MfaVerify() {
  const router = useRouter();
  return (
    <section className="panel settings-section">
      <h2>Two-factor check</h2>
      <p>Enter the current code from your authenticator app. The check lasts 12 hours on this device.</p>
      <CodeForm path="/v1/auth/mfa" label="Code" onDone={() => router.refresh()} />
    </section>
  );
}
