import { describe, expect, it } from 'vitest';
import { financialYear, gstFromInclusive, invoiceNumber, invoiceTax, razorpaySignature, renderInvoice, verifyRazorpaySignature } from './billing.ts';

const seller = { name: 'Example Media Private Limited', address: 'Bengaluru, Karnataka', gstin: '29ABCDE1234F1Z5', sac: null };

describe('GST on inclusive prices', () => {
  it('splits ₹149 and ₹1,199 into taxable value and 9% + 9%', () => {
    expect(gstFromInclusive(149)).toEqual({ taxable: 126.27, gst: 22.73, cgst: 11.36, sgst: 11.37 });
    expect(gstFromInclusive(1199)).toEqual({ taxable: 1016.1, gst: 182.9, cgst: 91.45, sgst: 91.45 });
  });
  it('charges no GST when the seller is not registered', () => {
    expect(invoiceTax(149, { ...seller, gstin: null })).toEqual({ gst: 0, cgst: 0, sgst: 0 });
    expect(invoiceTax(149, seller).gst).toBe(22.73);
  });
});

describe('invoice numbering', () => {
  it('uses the Indian financial year in IST', () => {
    expect(financialYear(new Date('2026-03-31T18:29:00Z'))).toBe('2025-26'); // 23:59 IST, 31 March
    expect(financialYear(new Date('2026-03-31T18:31:00Z'))).toBe('2026-27'); // 00:01 IST, 1 April
    expect(invoiceNumber('2026-27', 42)).toBe('SP/2026-27/000042');
  });
  it('renders a tax invoice, or a bill of supply when unregistered', () => {
    const base = { number: 'SP/2026-27/000001', issuedAt: new Date('2026-10-03T06:00:00Z'), buyerEmail: 'buyer@example.invalid', plan: 'monthly' as const, amountInr: 149, periodEnd: null };
    const t = renderInvoice({ ...base, seller });
    expect(t).toContain('TAX INVOICE');
    expect(t).toContain('GSTIN: 29ABCDE1234F1Z5');
    expect(t).toContain('CGST 9%: ₹11.36');
    const b = renderInvoice({ ...base, seller: { ...seller, gstin: null } });
    expect(b).toContain('BILL OF SUPPLY');
    expect(b).not.toContain('CGST');
  });
});

describe('Razorpay webhook signature', () => {
  it('HMAC-SHA256 of the raw body', () => {
    const body = '{"event":"subscription.charged"}';
    const sig = razorpaySignature('whsec-test', body);
    expect(verifyRazorpaySignature('whsec-test', body, sig)).toBe(true);
    expect(verifyRazorpaySignature('whsec-test', `${body} `, sig)).toBe(false);
    expect(verifyRazorpaySignature('other', body, sig)).toBe(false);
    expect(verifyRazorpaySignature('whsec-test', body, null)).toBe(false);
  });
});
