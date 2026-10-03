// Votes, comments, grievances and operator 2FA (PRD-005, PRD-006, PRD-007 US-007.5).

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { daysFrom } from './auth.ts';

export const DIRECTIONAL_MIN_ACCOUNT_DAYS = 7; // PRD-005 OQ-005.1
export const VOTES_PER_HOUR = 60; // PRD-005 US-005.1 AC-8
export const COMMENT_MIN_INTERVAL_S = 30; // PRD-006 US-006.1 AC-6
export const COMMENTS_PER_HOUR = 20;
export const COMMENT_MAX_CHARS = 2000; // PRD-006 US-006.1 AC-3
export const COMMENT_EDIT_WINDOW_MS = 10 * 60_000; // PRD-006 OQ-006.3
export const COMMENT_PAGE_THREADS = 50; // PRD-006 US-006.4 AC-1
export const REMOVED_CONTENT_RETENTION_DAYS = 180; // PRD-006 US-006.8 AC-6
export const IP_RETENTION_DAYS = 180; // PRD-005 OQ-005.6
export const OPERATOR_MFA_TTL_MS = 12 * 3600_000;

export interface Participant {
  emailVerified: boolean;
  createdAt: Date;
  votingRevoked: boolean;
  commentSuspended: boolean;
}

export type Block = { ok: false; reason: 'not_signed_in' | 'email_unverified' | 'account_too_new' | 'revoked' | 'suspended'; eligibleFrom?: Date };

// PRD-005 US-005.5: quality votes need a verified email; directional votes also a 7-day-old account.
export function voteEligibility(u: Participant | null, kind: 'directional' | 'quality', now: Date): { ok: true } | Block {
  if (!u) return { ok: false, reason: 'not_signed_in' };
  if (u.votingRevoked) return { ok: false, reason: 'revoked' };
  if (!u.emailVerified) return { ok: false, reason: 'email_unverified' };
  if (kind === 'directional') {
    const from = daysFrom(u.createdAt, DIRECTIONAL_MIN_ACCOUNT_DAYS);
    if (now < from) return { ok: false, reason: 'account_too_new', eligibleFrom: from };
  }
  return { ok: true };
}

// PRD-006 US-006.1 AC-2: same bar as directional voting, plus no commenting suspension.
export function commentEligibility(u: Participant | null, now: Date): { ok: true } | Block {
  if (!u) return { ok: false, reason: 'not_signed_in' };
  if (u.commentSuspended) return { ok: false, reason: 'suspended' };
  if (!u.emailVerified) return { ok: false, reason: 'email_unverified' };
  const from = daysFrom(u.createdAt, DIRECTIONAL_MIN_ACCOUNT_DAYS);
  if (now < from) return { ok: false, reason: 'account_too_new', eligibleFrom: from };
  return { ok: true };
}

export const DIRECTIONS = ['bullish', 'bearish', 'neutral'] as const;
export const QUALITY_VOTES = ['important', 'duplicate', 'wrong_stock', 'spam', 'old_news'] as const;
// PRD-006 US-006.7 AC-1/AC-2 (+ spam, D-022). "I disagree" and "bad advice" are deliberately absent.
export const REPORT_REASONS = ['defamation', 'impersonation', 'obscene', 'threat', 'hate_speech', 'privacy', 'copyright', 'spam', 'other_unlawful'] as const;
export const TAKEDOWN_REASONS = [...REPORT_REASONS, 'court_order', 'government_notice'] as const;

export const isOneOf = <T extends string>(set: readonly T[], v: unknown): v is T => typeof v === 'string' && (set as readonly string[]).includes(v);

export function grievanceReference(year: number, seq: number | bigint): string {
  return `GR-${year}-${String(seq).padStart(6, '0')}`;
}

// ------------------------------------------------------------ TOTP (RFC 6238, SHA-1, 6 digits, 30 s)

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpAt(secret: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(msg).digest();
  const offset = h[h.length - 1]! & 0xf;
  const code = (h.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, '0');
}

// Accepts the current 30-second step and one step either side (clock drift).
export function verifyTotp(secretB32: string, code: string, now: Date): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const secret = base32Decode(secretB32);
  const step = Math.floor(now.getTime() / 30_000);
  return [-1, 0, 1].some((d) => totpAt(secret, step + d) === code);
}

export function totpUri(secretB32: string, account: string): string {
  return `otpauth://totp/StockPanic:${encodeURIComponent(account)}?secret=${secretB32}&issuer=StockPanic&algorithm=SHA1&digits=6&period=30`;
}

// AES-256-GCM with a key derived from the server secret; stored as base64(iv | tag | ciphertext).
const totpKey = (serverSecret: string) => createHash('sha256').update(`totp-key:${serverSecret}`).digest();

export function encryptSecret(serverSecret: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', totpKey(serverSecret), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

export function decryptSecret(serverSecret: string, stored: string): string {
  const buf = Buffer.from(stored, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', totpKey(serverSecret), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}
