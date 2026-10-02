// Account and session rules (PRD-007 §1, §2.2). Codes and session tokens are stored only as
// hashes: a database leak exposes no usable code or session.

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const OTP_TTL_MS = 10 * 60_000; // PRD-007 US-007.1 AC-3
export const OTP_MAX_ATTEMPTS = 5; // PRD-007 US-007.1 AC-3
export const OTP_MAX_PER_HOUR = 5; // per email; requests beyond this are accepted but not sent
export const PENDING_SIGNUP_TTL_MS = 30 * 60_000;
export const SESSION_IDLE_DAYS = 30; // PRD-007 US-007.1 AC-6
export const SESSION_COOKIE = 'sp_session';
export const TRIAL_DAYS = 14; // PRD-007 OQ-007.2
export const USERNAME_CHANGE_INTERVAL_DAYS = 30; // PRD-007 US-007.2 AC-3
export const USERNAME_HOLD_DAYS = 30; // old name held after a change
export const DELETED_USERNAME_HOLD_DAYS = 90; // PRD-007 §6
export const EXPORT_TTL_DAYS = 7; // PRD-007 §5
export const DELETION_DEADLINE_DAYS = 30; // PRD-007 US-007.3 AC-2

// PRD-007 OQ-007.1: GST-inclusive prices.
export const PLANS = [
  { id: 'monthly', price_inr: 299, gst_inclusive: true },
  { id: 'yearly', price_inr: 2999, gst_inclusive: true },
] as const;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliseEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  return e.length <= 254 && EMAIL_SHAPE.test(e) ? e : null;
}

export function newOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashOtp(secret: string, email: string, code: string): string {
  return createHmac('sha256', secret).update(`${email}\n${code}`).digest('hex');
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || !/^[0-9a-f]*$/.test(a) || !/^[0-9a-f]*$/.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

// PRD-007 US-007.2 AC-1. Reserved names, NSE symbols and held names are enforced by the database.
export function isValidUsername(u: string): boolean {
  return /^[A-Za-z0-9_]{3,20}$/.test(u);
}

export const daysFrom = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);
