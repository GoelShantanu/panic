import { describe, expect, it } from 'vitest';
import { hashOtp, hashToken, isValidUsername, newOtp, newToken, normaliseEmail, safeEqualHex } from './index.ts';

describe('account rules (PRD-007)', () => {
  it('sign-in codes are 6 digits', () => {
    for (let i = 0; i < 50; i++) expect(newOtp()).toMatch(/^\d{6}$/);
  });

  it('code hashes are keyed and bound to the email', () => {
    const a = hashOtp('secret-one-that-is-long-enough-xx', 'a@example.invalid', '123456');
    expect(a).toBe(hashOtp('secret-one-that-is-long-enough-xx', 'a@example.invalid', '123456'));
    expect(a).not.toBe(hashOtp('secret-one-that-is-long-enough-xx', 'b@example.invalid', '123456'));
    expect(a).not.toBe(hashOtp('secret-two-that-is-long-enough-xx', 'a@example.invalid', '123456'));
    expect(a).not.toContain('123456');
  });

  it('session tokens are random and stored only as hashes', () => {
    const t = newToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(t);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
  });

  it('constant-time comparison rejects mismatches and malformed input', () => {
    const h = hashToken('x');
    expect(safeEqualHex(h, h)).toBe(true);
    expect(safeEqualHex(h, hashToken('y'))).toBe(false);
    expect(safeEqualHex(h, h.slice(1))).toBe(false);
    expect(safeEqualHex('zz', 'zz')).toBe(false);
  });

  it('normalises emails and rejects malformed ones', () => {
    expect(normaliseEmail('  Trader@Example.IN ')).toBe('trader@example.in');
    expect(normaliseEmail('not-an-email')).toBeNull();
    expect(normaliseEmail('a b@example.in')).toBeNull();
  });

  it('usernames: 3–20 letters, digits, underscore', () => {
    expect(isValidUsername('trader_a')).toBe(true);
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('a'.repeat(21))).toBe(false);
    expect(isValidUsername('bad name')).toBe(false);
    expect(isValidUsername('emoji🙂')).toBe(false);
  });
});
