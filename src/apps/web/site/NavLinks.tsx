'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './Icon.tsx';
import type { IconName } from './Icon.tsx';

const ITEMS: { href: string; label: string; icon: IconName; match: (p: string) => boolean; signedIn?: boolean }[] = [
  { href: '/', label: 'News', icon: 'news', match: (p) => p === '/' || p.startsWith('/s/') },
  { href: '/watchlist', label: 'Watchlist', icon: 'star', match: (p) => p.startsWith('/watchlist') },
  { href: '/alerts', label: 'Alerts', icon: 'bell', match: (p) => p.startsWith('/alerts') || p.startsWith('/settings/alerts'), signedIn: true },
  { href: '/plans', label: 'Plans', icon: 'crown', match: (p) => p.startsWith('/plans') },
];

// The main navigation: a vertical rail on desktop, a row in the top bar on smaller screens.
export function NavLinks({ signedIn }: { signedIn: boolean }) {
  const path = usePathname() ?? '/';
  return (
    <nav className="nav" aria-label="Main">
      {ITEMS.filter((i) => !i.signedIn || signedIn).map((i) => (
        <Link key={i.href} href={i.href} className="nav-item" aria-current={i.match(path) ? 'page' : undefined}>
          <Icon name={i.icon} />
          <span>{i.label}</span>
        </Link>
      ))}
    </nav>
  );
}
