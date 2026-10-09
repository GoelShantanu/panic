// "Sign in with Google" ID-token verification (PRD-007 US-007.1 AC-1). Verifies the RS256
// signature against Google's published keys, the issuer, audience (our client ID), expiry and
// that Google has verified the email. The key fetcher is injectable so tests need no network.

import { createPublicKey, verify } from 'node:crypto';
import type { webcrypto } from 'node:crypto';
import { normaliseEmail } from '@stockpanic/core';

export type Jwk = webcrypto.JsonWebKey & { kid?: string };

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const CLOCK_SKEW_S = 300;
const JWKS_CACHE_MS = 60 * 60_000;

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: true;
  emailAuthoritative: boolean;
  firstName: string | null;
  lastName: string | null;
}

export type JwksFetcher = () => Promise<Jwk[]>;

export interface GoogleVerifier {
  verify(idToken: string, now?: Date): Promise<GoogleIdentity | null>;
}

const defaultFetcher: JwksFetcher = async () => {
  const res = await fetch(GOOGLE_JWKS_URL, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`JWKS HTTP ${res.status}`);
  return ((await res.json()) as { keys: Jwk[] }).keys;
};

function decodePart(part: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function createGoogleVerifier(clientId: string, fetchJwks: JwksFetcher = defaultFetcher): GoogleVerifier {
  let cache: { keys: Jwk[]; at: number } | null = null;
  const keysFor = async (kid: string, refresh: boolean) => {
    if (!cache || refresh || Date.now() - cache.at > JWKS_CACHE_MS) cache = { keys: await fetchJwks(), at: Date.now() };
    return cache.keys.find((k) => k.kid === kid);
  };

  return {
    async verify(idToken, now = new Date()) {
      const parts = idToken.split('.');
      if (parts.length !== 3) return null;
      const [h, p, s] = parts as [string, string, string];
      const header = decodePart(h);
      const claims = decodePart(p);
      if (!header || !claims || header['alg'] !== 'RS256' || typeof header['kid'] !== 'string') return null;

      // Unknown key id: refresh once, in case Google rotated its keys.
      const jwk = (await keysFor(header['kid'], false)) ?? (await keysFor(header['kid'], true));
      if (!jwk) return null;
      const valid = verify('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'));
      if (!valid) return null;

      const nowS = now.getTime() / 1000;
      if (!GOOGLE_ISSUERS.has(String(claims['iss']))) return null;
      if (claims['aud'] !== clientId) return null;
      if (typeof claims['exp'] !== 'number' || claims['exp'] + CLOCK_SKEW_S < nowS) return null;
      if (typeof claims['iat'] === 'number' && claims['iat'] - CLOCK_SKEW_S > nowS) return null;
      if (claims['email_verified'] !== true && claims['email_verified'] !== 'true') return null;
      if (typeof claims['sub'] !== 'string' || !claims['sub'] || claims['sub'].length > 255 || typeof claims['email'] !== 'string') return null;
      const email = normaliseEmail(claims['email']);
      if (!email) return null;
      const name = (value: unknown) => typeof value === 'string' && value.trim() && value.trim().length <= 80 ? value.trim() : null;
      return { sub: claims['sub'], email, emailVerified: true,
        emailAuthoritative: email.endsWith('@gmail.com') || (typeof claims['hd'] === 'string' && claims['hd'].length > 0),
        firstName: name(claims['given_name']), lastName: name(claims['family_name']) };
    },
  };
}
