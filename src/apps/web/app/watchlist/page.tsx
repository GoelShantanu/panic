import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { api } from '../../site/api.ts';
import { Watchlist } from '../../site/watchlist/Watchlist.tsx';
import type { Entry } from '../../site/watchlist/Watchlist.tsx';

export const metadata: Metadata = { title: 'Watchlist', robots: { index: false } };

export default async function WatchlistPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const r = await api<{ instruments: Entry[]; limit: number }>('/v1/watchlist');
  if (r.status === 401) redirect('/sign-in?next=/watchlist');
  return <Watchlist initial={r.status === 200 ? r.body.instruments : []} limit={r.status === 200 ? r.body.limit : 20} welcome={(await searchParams)['welcome'] === '1'} />;
}
