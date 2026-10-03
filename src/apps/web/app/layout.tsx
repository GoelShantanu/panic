import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { api } from '../site/api.ts';
import type { SessionInfo } from '../site/format.ts';
import { Header } from '../site/Header.tsx';
import type { Viewer } from '../site/Header.tsx';
import { LiveProvider } from '../site/live.tsx';
import { THEME_BOOT } from '../site/ThemeToggle.tsx';
import './globals.css';

// Every page shows live data and the visitor's session: render on request, never at build time.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  // Absolute canonical and Open Graph URLs (PRD-004 AC-8 indexability). PUBLIC_BASE_URL in production.
  metadataBase: new URL(process.env['PUBLIC_BASE_URL'] ?? 'http://localhost:3000'),
  title: { default: 'StockPanic — Indian market news, deduplicated', template: '%s · StockPanic' },
  description: 'NSE and BSE filings and financial news, one row per event, tagged to the right company.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [session, me] = await Promise.all([
    api<{ session: SessionInfo }>('/v1/session').catch(() => null),
    api<{ username: string | null; tier: 'free' | 'paid' }>('/v1/me').catch(() => null),
  ]);
  const notes = me && me.status === 200 ? await api<{ unread_replies: boolean; notices: unknown[] }>('/v1/me/notifications').catch(() => null) : null;
  // PRD-006 US-006.5 AC-1: a dot, never a number.
  const attention = !!notes && notes.status === 200 && (notes.body.unread_replies || notes.body.notices.length > 0);
  const viewer: Viewer | null = me && me.status === 200 ? { username: me.body.username, tier: me.body.tier, attention } : null;
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <LiveProvider>
          <a href="#main" className="skip-link">
            Skip to content
          </a>
          <Header session={session && session.status === 200 ? session.body.session : null} viewer={viewer} />
          <main id="main" className="main">
            {children}
          </main>
          <footer className="footer">
            <p>Stories link to their original sources. Vote counts and comments are user opinion, not StockPanic&apos;s assessment, and not investment advice.</p>
            <nav className="footer-links" aria-label="Footer">
              <Link href="/plans">Plans</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/grievance">Grievances</Link>
            </nav>
          </footer>
        </LiveProvider>
      </body>
    </html>
  );
}
