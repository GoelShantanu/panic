// Public IDs: ULID (48-bit ms timestamp + 80 random bits, Crockford base32) with a
// type prefix. Must match is_public_id() in migration 0001.

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export type IdPrefix = 'it' | 'st' | 'us' | 'cm' | 'al';

export type RandomBytes = (length: number) => Uint8Array;

const secureRandom: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

export function newPublicId(prefix: IdPrefix, nowMs: number = Date.now(), random: RandomBytes = secureRandom): string {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 || nowMs >= 2 ** 48) {
    throw new RangeError(`timestamp out of ULID range: ${nowMs}`);
  }
  let time = '';
  let t = nowMs;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD.charAt(t % 32) + time;
    t = Math.floor(t / 32);
  }
  let bits = 0n;
  for (const byte of random(10)) bits = (bits << 8n) | BigInt(byte);
  let rand = '';
  for (let i = 0; i < 16; i++) {
    rand = CROCKFORD.charAt(Number(bits & 31n)) + rand;
    bits >>= 5n;
  }
  return `${prefix}_${time}${rand}`;
}

export function isPublicId(value: string, prefix: IdPrefix): boolean {
  return new RegExp(`^${prefix}_[0-9A-HJKMNP-TV-Z]{26}$`).test(value);
}
