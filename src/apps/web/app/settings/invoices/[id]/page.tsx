import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { api } from '../../../../site/api.ts';

export const metadata: Metadata = { title: 'Invoice', robots: { index: false } };

// PRD-007 US-007.7 AC-5: every invoice downloadable from settings (the same text that was emailed).
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const r = await api<{ invoice_id: string; text: string }>(`/v1/billing/invoices/${encodeURIComponent(id)}`);
  if (r.status === 401) redirect('/sign-in?next=/settings');
  if (r.status !== 200) notFound();
  return (
    <div className="invoice">
      <p>
        <Link href="/settings">← Settings</Link>
      </p>
      <pre className="panel invoice-text">{r.body.text}</pre>
      <p className="faint">Use your browser&apos;s Print to save this invoice as a PDF.</p>
    </div>
  );
}
