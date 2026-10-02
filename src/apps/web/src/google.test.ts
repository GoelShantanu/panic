import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createGoogleVerifier } from './google.ts';
import type { Jwk } from './google.ts';

// Tokens are signed with a locally generated key standing in for Google's; no network access.
const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk: Jwk = { ...(publicKey.export({ format: 'jwk' }) as Jwk), kid: 'test-key-1' };
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(claims: Record<string, unknown>, opts: { kid?: string; key?: typeof privateKey; alg?: string } = {}) {
  const head = b64({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? 'test-key-1', typ: 'JWT' });
  const body = b64(claims);
  const sig = sign('RSA-SHA256', Buffer.from(`${head}.${body}`), opts.key ?? privateKey).toString('base64url');
  return `${head}.${body}.${sig}`;
}

const now = new Date('2026-10-05T05:00:00Z');
const nowS = now.getTime() / 1000;
const good = {
  iss: 'https://accounts.google.com',
  aud: CLIENT_ID,
  sub: '1098765432101234567890',
  email: 'Trader@Example.IN',
  email_verified: true,
  iat: nowS - 10,
  exp: nowS + 3600,
};

describe('Google ID token verification (PRD-007 US-007.1)', () => {
  const verifier = () => createGoogleVerifier(CLIENT_ID, async () => [jwk]);

  it('accepts a valid token and lower-cases the email', async () => {
    expect(await verifier().verify(token(good), now)).toEqual({ sub: good.sub, email: 'trader@example.in', emailVerified: true });
  });

  it('rejects the wrong audience, issuer or an expired token', async () => {
    expect(await verifier().verify(token({ ...good, aud: 'someone-else' }), now)).toBeNull();
    expect(await verifier().verify(token({ ...good, iss: 'https://evil.example' }), now)).toBeNull();
    expect(await verifier().verify(token({ ...good, exp: nowS - 600 }), now)).toBeNull();
  });

  it('rejects an unverified email', async () => {
    expect(await verifier().verify(token({ ...good, email_verified: false }), now)).toBeNull();
  });

  it('rejects a signature from a different key, an unknown key id, or a non-RS256 header', async () => {
    expect(await verifier().verify(token(good, { key: other.privateKey }), now)).toBeNull();
    expect(await verifier().verify(token(good, { kid: 'unknown' }), now)).toBeNull();
    expect(await verifier().verify(token(good, { alg: 'none' }), now)).toBeNull();
  });

  it('rejects malformed tokens', async () => {
    expect(await verifier().verify('not.a.token', now)).toBeNull();
    expect(await verifier().verify('onlyonepart', now)).toBeNull();
  });

  it('refetches keys once when it sees an unknown key id (rotation)', async () => {
    let calls = 0;
    const v = createGoogleVerifier(CLIENT_ID, async () => (++calls === 1 ? [] : [jwk]));
    expect(await v.verify(token(good), now)).not.toBeNull();
    expect(calls).toBe(2);
  });
});
