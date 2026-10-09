import { describe, expect, it } from 'vitest';
import { hashChallenge, hashOtp, hashPassword, isValidPassword, verifyPassword } from './auth.ts';

describe('password hashing and purpose binding', () => {
  it('uses independent salts, verifies the complete password and rejects a wrong one', async () => {
    const password = 'An exact test passphrase  ';
    const a = await hashPassword(password), b = await hashPassword(password);
    expect(a).not.toBe(b); expect(a).not.toContain(password);
    expect(await verifyPassword(password, a)).toBe(true);
    expect(await verifyPassword(password.trim(), a)).toBe(false);
    expect(await verifyPassword('Another test passphrase', a)).toBe(false);
  });
  it('permits long Unicode passphrases without truncation and bounds inputs', async () => {
    expect(isValidPassword('界'.repeat(15))).toBe(true);
    expect(isValidPassword('a'.repeat(14))).toBe(false);
    expect(isValidPassword('a'.repeat(129))).toBe(false);
    const password = '界'.repeat(128), hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    await expect(hashPassword('short')).rejects.toThrow();
    expect(await verifyPassword(password, 'scrypt$invalid')).toBe(false);
  });
  it('a code hash for one purpose cannot authenticate another', () => {
    const hashes = ['signup', 'reset', 'google'].map(p => hashChallenge('test', 'a@example.invalid', '123456', p as 'signup' | 'reset' | 'google'));
    hashes.push(hashOtp('test', 'a@example.invalid', '123456'));
    expect(new Set(hashes).size).toBe(4);
  });
});
