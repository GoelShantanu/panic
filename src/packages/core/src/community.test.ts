import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  commentEligibility,
  decryptSecret,
  encryptSecret,
  grievanceReference,
  newTotpSecret,
  totpAt,
  verifyTotp,
  voteEligibility,
} from './community.ts';

const now = new Date('2026-10-10T10:00:00Z');
const user = (o: Partial<{ emailVerified: boolean; createdAt: Date; votingRevoked: boolean; commentSuspended: boolean }> = {}) => ({
  emailVerified: true,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  votingRevoked: false,
  commentSuspended: false,
  ...o,
});

describe('vote and comment eligibility (PRD-005 US-005.5, PRD-006 US-006.1 AC-2)', () => {
  it('anonymous, unverified, revoked', () => {
    expect(voteEligibility(null, 'quality', now)).toEqual({ ok: false, reason: 'not_signed_in' });
    expect(voteEligibility(user({ emailVerified: false }), 'quality', now)).toMatchObject({ reason: 'email_unverified' });
    expect(voteEligibility(user({ votingRevoked: true }), 'quality', now)).toMatchObject({ reason: 'revoked' });
  });

  it('directional votes and comments need a 7-day-old account; quality votes do not', () => {
    const fresh = user({ createdAt: new Date('2026-10-08T10:00:00Z') });
    expect(voteEligibility(fresh, 'quality', now)).toEqual({ ok: true });
    expect(voteEligibility(fresh, 'directional', now)).toEqual({ ok: false, reason: 'account_too_new', eligibleFrom: new Date('2026-10-15T10:00:00Z') });
    expect(commentEligibility(fresh, now)).toMatchObject({ reason: 'account_too_new' });
    expect(voteEligibility(user(), 'directional', now)).toEqual({ ok: true });
  });

  it('a commenting suspension does not touch voting', () => {
    const u = user({ commentSuspended: true });
    expect(commentEligibility(u, now)).toMatchObject({ reason: 'suspended' });
    expect(voteEligibility(u, 'directional', now)).toEqual({ ok: true });
  });
});

describe('grievance references', () => {
  it('GR-YYYY-NNNNNN', () => {
    expect(grievanceReference(2026, 123)).toBe('GR-2026-000123');
  });
});

describe('TOTP (RFC 6238)', () => {
  it('matches the RFC 6238 SHA-1 test vector', () => {
    const secret = Buffer.from('12345678901234567890');
    expect(totpAt(secret, Math.floor(59 / 30), 8)).toBe('94287082');
    expect(totpAt(secret, Math.floor(1111111109 / 30), 8)).toBe('07081804');
    expect(totpAt(secret, Math.floor(59 / 30))).toBe('287082');
  });

  it('base32 round-trips and verifies within one step of drift', () => {
    const secret = newTotpSecret();
    expect(base32Encode(base32Decode(secret))).toBe(secret);
    const code = totpAt(base32Decode(secret), Math.floor(now.getTime() / 30_000));
    expect(verifyTotp(secret, code, now)).toBe(true);
    expect(verifyTotp(secret, code, new Date(now.getTime() + 30_000))).toBe(true);
    expect(verifyTotp(secret, code, new Date(now.getTime() + 90_000))).toBe(false);
    expect(verifyTotp(secret, '12345', now)).toBe(false);
  });

  it('secrets are encrypted at rest and tamper-evident', () => {
    const key = 'a-server-secret-of-at-least-32-characters';
    const stored = encryptSecret(key, 'JBSWY3DPEHPK3PXP');
    expect(stored).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(key, stored)).toBe('JBSWY3DPEHPK3PXP');
    expect(() => decryptSecret('another-server-secret-of-32-characters!', stored)).toThrow();
  });
});
