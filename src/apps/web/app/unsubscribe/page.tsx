import type { Metadata } from 'next';
import Link from 'next/link';
import { Unsubscribe } from '../../site/alerts/Unsubscribe.tsx';

export const metadata: Metadata = { title: 'Stop alert emails', robots: { index: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const token = (await searchParams)['token'];
  return (
    <div className="auth panel">
      <h1>Stop alert emails</h1>
      {typeof token === 'string' && token ? <Unsubscribe token={token} /> : <p>This link is incomplete.</p>}
      <p className="faint">
        Prefer fewer emails instead? Lower your daily alerts or switch to the digest in <Link href="/settings/alerts">alert settings</Link>.
      </p>
    </div>
  );
}
