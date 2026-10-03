import Link from 'next/link';
import { sessionLabel } from './format.ts';
import type { SessionInfo } from './format.ts';
import { ThemeToggle } from './ThemeToggle.tsx';

export interface Viewer {
  username: string | null;
  tier: 'free' | 'paid';
}

export function Header({ session, viewer, current }: { session: SessionInfo | null; viewer: Viewer | null; current?: string }) {
  return (
    <header className="header">
      <Link href="/" className="brand">
        StockPanic
      </Link>
      <nav className="nav" aria-label="Main">
        <Link href="/" aria-current={current === 'stream' ? 'page' : undefined}>
          Stream
        </Link>
        <Link href="/?view=watchlist" aria-current={current === 'watchlist' ? 'page' : undefined}>
          Watchlist
        </Link>
      </nav>
      <div className="header-spacer" />
      {session && (
        <span className="session" data-state={session.state} title={`Exchange date ${session.exchange_date}`}>
          <span className="session-dot" aria-hidden="true" />
          {sessionLabel(session)}
        </span>
      )}
      <ThemeToggle />
      {viewer ? (
        <Link href="/settings" className="button">
          {viewer.username ?? 'Account'}
          {viewer.tier === 'paid' && <span className="faint">· Paid</span>}
        </Link>
      ) : (
        <Link href="/sign-in" className="button button-primary">
          Sign in
        </Link>
      )}
    </header>
  );
}
