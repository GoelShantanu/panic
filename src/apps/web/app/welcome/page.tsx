import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { api } from '../../site/api.ts';
import { Welcome } from '../../site/account/Welcome.tsx';

export const metadata: Metadata = { title: 'Create your account', robots: { index: false } };

const safeNext = (n: string | string[] | undefined) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '/');

export default async function WelcomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if ((await api('/v1/me')).status === 200) redirect('/');
  return <Welcome next={safeNext((await searchParams)['next'])} />;
}
