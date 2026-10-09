import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { api } from '../../site/api.ts';
import { SignIn } from '../../site/account/SignIn.tsx';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

// Only same-site paths are honoured as a return destination.
const safeNext = (n: string | string[] | undefined) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '/');

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = safeNext(params['next']);
  const reset = params['mode'] === 'reset';
  if (!reset && (await api('/v1/me')).status === 200) redirect(next);
  return <SignIn next={next} initialMode={reset ? 'reset' : 'login'} googleClientId={process.env['GOOGLE_CLIENT_ID'] ?? null} />;
}
