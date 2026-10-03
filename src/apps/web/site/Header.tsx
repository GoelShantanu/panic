import Link from 'next/link';
import type { SessionInfo } from './format.ts';
import { SessionStatus } from './LiveStatus.tsx';
import { Search } from './Search.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';

export interface Viewer {
  username: string | null;
  tier: 'free' | 'paid';
  attention?: boolean;
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
        <Link href="/watchlist" aria-current={current === 'watchlist' ? 'page' : undefined}>
          Watchlist
        </Link>
      </nav>
      <Search />
      <div className="header-spacer" />
      <SessionStatus initial={session} />
      <ThemeToggle />
      {viewer && (
        <Link href="/replies" className="icon-button replies-link" aria-label={viewer.attention ? 'Replies and notices (new)' : 'Replies and notices'}>
          Replies{viewer.attention && <span className="dot" aria-hidden="true" />}
        </Link>
      )}
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
