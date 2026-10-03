// Billing rules that need no network: GST on inclusive prices, invoice numbering, webhook
// signatures, retry grace (PRD-007 §2.2, D-036). Not legal or tax advice (PRD-007 header).

import { createHmac, timingSafeEqual } from 'node:crypto';

export type PlanId = 'monthly' | 'yearly';
export const GST_RATE = 0.18; // [INFERRED] 18 % on online subscription services
export const RETRY_GRACE_DAYS = 7; // US-007.7 AC-6: access continues while the provider retries

// Prices are GST-inclusive (US-007.7 AC-1). With no customer address on record, the place of
// supply is taken as the supplier's state, so tax splits into CGST + SGST [INFERRED].
export function gstFromInclusive(amountInr: number): { taxable: number; gst: number; cgst: number; sgst: number } {
  const paise = Math.round(amountInr * 100);
  const gstPaise = Math.round((paise * GST_RATE) / (1 + GST_RATE));
  const cgstPaise = Math.floor(gstPaise / 2);
  return { taxable: (paise - gstPaise) / 100, gst: gstPaise / 100, cgst: cgstPaise / 100, sgst: (gstPaise - cgstPaise) / 100 };
}

// Indian financial year (April–March) of an instant, in IST: "2026-27".
export function financialYear(at: Date): string {
  const ist = new Date(at.getTime() + 5.5 * 3600_000);
  const y = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

export const invoiceNumber = (fy: string, n: number) => `SP/${fy}/${String(n).padStart(6, '0')}`;

// Razorpay: X-Razorpay-Signature = hex HMAC-SHA256 of the raw body with the webhook secret.
export function razorpaySignature(secret: string, rawBody: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function verifyRazorpaySignature(secret: string, rawBody: string, header: string | null | undefined): boolean {
  if (!header || !/^[0-9a-f]{64}$/.test(header)) return false;
  return timingSafeEqual(Buffer.from(razorpaySignature(secret, rawBody), 'hex'), Buffer.from(header, 'hex'));
}

export interface Seller {
  name: string;
  address: string;
  gstin: string | null; // null: not GST-registered, so no GST is charged and a bill of supply is issued
  sac: string | null; // services accounting code, set by the founder with their accountant
}

export interface InvoiceText {
  number: string;
  issuedAt: Date;
  seller: Seller;
  buyerEmail: string;
  plan: PlanId;
  amountInr: number;
  periodEnd: Date | null;
}

// Tax lines for an inclusive amount: none when the seller is not GST-registered.
export function invoiceTax(amountInr: number, seller: Seller): { gst: number; cgst: number; sgst: number } {
  if (!seller.gstin) return { gst: 0, cgst: 0, sgst: 0 };
  const g = gstFromInclusive(amountInr);
  return { gst: g.gst, cgst: g.cgst, sgst: g.sgst };
}

// Plain-text invoice for email and download.
export function renderInvoice(i: InvoiceText): string {
  const inr = (n: number) => `₹${n.toFixed(2)}`;
  const registered = i.seller.gstin !== null;
  const g = gstFromInclusive(i.amountInr);
  return [
    registered ? 'TAX INVOICE' : 'BILL OF SUPPLY',
    `Invoice number: ${i.number}`,
    `Date: ${new Date(i.issuedAt.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10)}`,
    '',
    `Supplier: ${i.seller.name}`,
    ...(registered ? [`GSTIN: ${i.seller.gstin}`] : []),
    i.seller.address,
    '',
    `Billed to: ${i.buyerEmail}`,
    '',
    `StockPanic paid plan (${i.plan})${i.periodEnd ? `, access until ${i.periodEnd.toISOString().slice(0, 10)}` : ''}`,
    ...(i.seller.sac ? [`SAC: ${i.seller.sac}`] : []),
    ...(registered ? [`Taxable value: ${inr(g.taxable)}`, `CGST 9%: ${inr(g.cgst)}`, `SGST 9%: ${inr(g.sgst)}`, `Total (inclusive of GST): ${inr(i.amountInr)}`] : [`Total: ${inr(i.amountInr)}`]),
  ].join('\n');
}
