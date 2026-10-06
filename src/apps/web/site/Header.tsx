import Link from 'next/link';
import type { SessionInfo } from './format.ts';
import { BrandMark, Icon } from './Icon.tsx';
import { SessionStatus } from './LiveStatus.tsx';
import { NavLinks } from './NavLinks.tsx';
import { Search } from './Search.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';

export interface Viewer {
  username: string | null;
  tier: 'free' | 'paid';
  isTrial?: boolean;
  attention?: boolean;
}

// The app's frame (D-057): a navigation rail down the left on desktop, like CryptoPanic's; a top bar on
// smaller screens. Same markup for both; CSS decides.
export function Header({ session, viewer }: { session: SessionInfo | null; viewer: Viewer | null }) {
  return (
    <header className="header">
      <a href="/" className="brand" aria-label="StockPanic home">
        <BrandMark />
        <span className="brand-name">StockPanic</span>
      </a>
      <NavLinks signedIn={!!viewer} />
      <Search />
      <div className="header-spacer" />
      <SessionStatus initial={session} />
      <div className="header-tools">
        {viewer && (
          <Link href="/replies" className="nav-item replies-link" aria-label={viewer.attention ? 'Replies and notices (new)' : 'Replies and notices'}>
            <Icon name="chat" />
            <span>Replies</span>
            {viewer.attention && <span className="dot" aria-hidden="true" />}
          </Link>
        )}
        {viewer ? (
          <Link href="/settings" className="nav-item account-link">
            <Icon name="user" />
            <span className="account-name">{viewer.username ?? 'Account'}</span>
            {viewer.tier === 'paid' && <span className="tier-badge">{viewer.isTrial ? 'Trial' : 'Paid'}</span>}
          </Link>
        ) : (
          <Link href="/sign-in" className="nav-item sign-in-link">
            <Icon name="signin" />
            <span>Sign in</span>
          </Link>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}
