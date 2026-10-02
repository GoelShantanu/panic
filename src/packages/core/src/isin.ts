// ISO 6166 ISIN for Indian securities (ADR-001). The database checks shape only;
// the check digit is verified here, at the boundary where external data enters.

const INDIAN_ISIN_SHAPE = /^IN[A-Z0-9]{9}[0-9]$/;

export type Isin = string & { readonly __brand: 'Isin' };

export function isinCheckDigit(first11: string): number {
  let digits = '';
  for (const ch of first11) {
    const code = ch.charCodeAt(0);
    digits += code >= 65 && code <= 90 ? String(code - 55) : ch;
  }
  let sum = 0;
  let double = true;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits.charAt(i));
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

export function parseIsin(value: string): Isin | null {
  const v = value.trim().toUpperCase();
  if (!INDIAN_ISIN_SHAPE.test(v)) return null;
  return isinCheckDigit(v.slice(0, 11)) === Number(v.charAt(11)) ? (v as Isin) : null;
}
