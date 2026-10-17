import { describe, expect, it } from 'vitest';
import { hashChallenge, hashOtp, hashPassword, hasEmailAlias, hasSequentialDigits, isValidPassword, validatePasswordComplexity, verifyPassword } from './auth.ts';

describe('password hashing and purpose binding', () => {
  it('uses independent salts, verifies the complete password and rejects a wrong one', async () => {
    const password = 'TestPass#1  ';
    const a = await hashPassword(password), b = await hashPassword(password);
    expect(a).not.toBe(b); expect(a).not.toContain(password);
    expect(await verifyPassword(password, a)).toBe(true);
    expect(await verifyPassword(password.trim(), a)).toBe(false);
    expect(await verifyPassword('AnotherPass#2', a)).toBe(false);
  });
  it('permits Unicode passwords and bounds inputs to 8–16 characters', async () => {
    expect(isValidPassword('界'.repeat(8))).toBe(true);
    expect(isValidPassword('界'.repeat(16))).toBe(true);
    expect(isValidPassword('a'.repeat(7))).toBe(false);
    expect(isValidPassword('a'.repeat(17))).toBe(false);
    const password = '界'.repeat(16), hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    await expect(hashPassword('short')).rejects.toThrow();
    expect(await verifyPassword(password, 'scrypt$invalid')).toBe(false);
  });
  it('validates password complexity and detects sequential digits', () => {
    expect(hasSequentialDigits('Pass123!')).toBe(true);
    expect(hasSequentialDigits('Pass321!')).toBe(true);
    expect(hasSequentialDigits('Pass111!')).toBe(true);
    expect(hasSequentialDigits('Pass135!')).toBe(false);
    expect(validatePasswordComplexity('Aa1!xxxx').valid).toBe(true);
    expect(validatePasswordComplexity('aa1!xxxx').valid).toBe(false); // missing upper
    expect(validatePasswordComplexity('AA1!XXXX').valid).toBe(false); // missing lower
    expect(validatePasswordComplexity('Aa12xxxx').valid).toBe(false); // missing special
    expect(validatePasswordComplexity('Aa123!xx').valid).toBe(false); // sequential 123
    expect(validatePasswordComplexity('Short1!').valid).toBe(false); // < 8
    expect(validatePasswordComplexity('WayTooLongPassword1!').valid).toBe(false); // > 16
  });
  it('detects email aliases with plus-addressing', () => {
    expect(hasEmailAlias('user@domain.com')).toBe(false);
    expect(hasEmailAlias('user+1@domain.com')).toBe(true);
    expect(hasEmailAlias('abc+trial@xyz.com')).toBe(true);
    expect(hasEmailAlias('plain.dots@gmail.com')).toBe(false);
  });
  it('a code hash for one purpose cannot authenticate another', () => {
    const hashes = ['signup', 'reset', 'google'].map(p => hashChallenge('test', 'a@example.invalid', '123456', p as 'signup' | 'reset' | 'google'));
    hashes.push(hashOtp('test', 'a@example.invalid', '123456'));
    expect(new Set(hashes).size).toBe(4);
  });
});
