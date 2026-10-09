import type { Metadata } from 'next';
import Link from 'next/link';
import { GrievanceOfficer, UPDATED } from '../../site/legal.tsx';

export const metadata: Metadata = { title: 'Privacy Notice' };

const DATA: [string, string, string][] = [
  ['Email address', 'Your account, sign-in codes, alerts, digests and billing emails', 'Until you delete your account, then erased within 30 days'],
  ['Username', 'Your public identity on comments', 'Until you delete your account'],
  ['Watchlist and alert settings', 'Sending the alerts you asked for, and your Watchlist view', 'Until you delete your account, then erased within 30 days'],
  ['Votes', 'Vote counts and abuse prevention. Votes are not shown publicly with your name', 'Until you delete your account; then kept only as anonymous counts'],
  ['Comments', 'Showing your comments under your username', 'Your choice on deletion: kept as "[deleted user]" or deleted. Removed content is kept 180 days for legal requests'],
  ['IP address and device data', 'Preventing abuse such as vote manipulation', '180 days'],
  ['Payment status and invoices', 'Billing and tax records. Card and bank details are held by Razorpay, never by StockPanic', 'As required for tax records (GST: 72 months), with restricted access'],
];

// PRD-007 US-007.4 AC-1 (DPDP Act 2023 notice, [INFERRED]); plain English.
export default function PrivacyPage() {
  return (
    <article className="legal">
      <h1>Privacy Notice</h1>
      <p className="faint">Last updated {UPDATED}</p>
      <p>StockPanic collects only what it needs to run the service. This notice says what we collect, why, and for how long.</p>
      <h2>What we collect and why</h2>
      <table className="panel legal-table">
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">Why</th>
            <th scope="col">How long</th>
          </tr>
        </thead>
        <tbody>
          {DATA.map(([d, why, how]) => (
            <tr key={d}>
              <th scope="row">{d}</th>
              <td>{why}</td>
              <td>{how}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>What we never do</h2>
      <ul>
        <li>We do not sell your data or show you paid placements.</li>
        <li>We do not send your data to AI models. AI is used only on public news headlines.</li>
        <li>We do not send marketing email unless you opt in, separately, at sign-up or in settings.</li>
      </ul>
      <h2>Who processes data for us</h2>
      <ul>
        <li>Google, for sending email and for &quot;Sign in with Google&quot; if you use it.</li>
        <li>Razorpay, for payments. Razorpay holds your payment details.</li>
        <li>Our hosting provider, which stores the service&apos;s data.</li>
      </ul>
      <h2>Cookies and storage</h2>
      <p>One cookie keeps you signed in. Your browser also stores your theme choice and, if you are not signed in, which stories you have already seen. We use no advertising or tracking cookies. When you open a source link we count the click, without recording who you are.</p>
      <h2>Your rights</h2>
      <ul>
        <li>
          Download your data, change your username, or delete your account from <Link href="/settings">settings</Link>.
        </li>
        <li>Withdraw consent by deleting your account.</li>
        <li>
          Complain about how your data is handled through the <Link href="/grievance">grievance form</Link>.
        </li>
      </ul>
      <GrievanceOfficer />
      <p>We tell users about this notice at least once a year, and before any material change takes effect.</p>
    </article>
  );
}
