'use client';

import Link from 'next/link';

const ROWS: [string, string, string][] = [
  ['Live stream & breaking news', 'Included', 'Included'],
  ['Market Breadth intelligence', 'Every 15 min overview', 'Live auto-refresh + 100 on-demand instant refreshes/day'],
  ['Put/Call Ratio (PCR) sentiment', 'Real-time Nifty & Bank Nifty PCR', 'Real-time Nifty & Bank Nifty PCR + writing bias'],
  ['Sector Heatmap & Intelligence', 'Overview only', 'Full interactive filtering across all 12 sectors & indices'],
  ['Watchlist size', '5 stocks (local)', 'Up to 200 companies (synced to account)'],
  ['Alerts & Notifications', '—', 'Browser Push & Email alerts (up to 25/day)'],
  ['Daily market digest', '—', 'Included (email)'],
  ['Stream & filings history', 'Last 3 days', 'Full 30-day deep archive search'],
  ['Multi-event filter & saved views', '—', 'Up to 10 saved custom views'],
  ['Voting and community comments', 'Read-only', 'Full voting & discussion access'],
];

export function Plans({
  signedIn,
}: {
  plans?: unknown;
  signedIn: boolean;
  tier?: unknown;
  trialUsed?: boolean;
  subscribed?: boolean;
}) {
  return (
    <div className="plans">
      <div style={{ marginBottom: '2rem' }}>
        <span
          style={{
            display: 'inline-block',
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            background: 'var(--accent)',
            color: '#fff',
            marginBottom: '0.75rem',
          }}
        >
          100% FREE FOR TRADERS
        </span>
        <h1>All Features Unlocked. Zero Paywalls.</h1>
        <p className="muted" style={{ maxWidth: '640px', lineHeight: 1.6 }}>
          BazaarPanic is freely available to all Indian market participants. Simply sign in to access full 12-sector heatmaps, 30-day corporate filings archive, 200-stock watchlists, and live F&amp;O PCR telemetry.
        </p>

        {!signedIn ? (
          <Link
            href="/sign-in"
            className="button button-primary"
            style={{ marginTop: '1.25rem', display: 'inline-block', padding: '0.6rem 1.25rem' }}
          >
            Sign in with Google / Email — Free →
          </Link>
        ) : (
          <p style={{ color: 'var(--accent)', fontWeight: 600, marginTop: '1.25rem' }}>
            ✓ You are signed in with full Member access.
          </p>
        )}
      </div>

      <table className="plans-table panel">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Feature</span>
            </th>
            <th scope="col">Guest (Not Signed In)</th>
            <th scope="col">Member (Signed In)</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([what, guest, member]) => (
            <tr key={what}>
              <th scope="row">{what}</th>
              <td>{guest}</td>
              <td>
                <strong style={{ color: member === '—' ? 'inherit' : 'var(--accent)' }}>{member}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="faint" style={{ marginTop: '1.5rem' }}>
        No payment details, no subscriptions, and no trial expirations. BazaarPanic is built to deliver real-time Indian stock market intelligence without friction.
      </p>
    </div>
  );
}
