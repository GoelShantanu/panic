import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { api } from '../site/api.ts';
import type { SessionInfo } from '../site/format.ts';
import { Header } from '../site/Header.tsx';
import type { Viewer } from '../site/Header.tsx';
import { THEME_BOOT } from '../site/ThemeToggle.tsx';
import './globals.css';

// Every page shows live data and the visitor's session: render on request, never at build time.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'StockPanic — Indian market news, deduplicated', template: '%s · StockPanic' },
  description: 'NSE and BSE filings and financial news, one row per event, tagged to the right company.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [session, me] = await Promise.all([
    api<{ session: SessionInfo }>('/v1/session').catch(() => null),
    api<{ username: string | null; tier: 'free' | 'paid' }>('/v1/me').catch(() => null),
  ]);
  const viewer: Viewer | null = me && me.status === 200 ? { username: me.body.username, tier: me.body.tier } : null;
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Header session={session && session.status === 200 ? session.body.session : null} viewer={viewer} />
        <main id="main" className="main">
          {children}
        </main>
        <footer className="footer">
          Stories link to their original sources. Vote counts and comments are user opinion, not StockPanic&apos;s assessment, and not investment advice.
        </footer>
      </body>
    </html>
  );
}
