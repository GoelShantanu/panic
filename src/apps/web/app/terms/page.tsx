import type { Metadata } from 'next';
import Link from 'next/link';
import { GrievanceOfficer, UPDATED } from '../../site/legal.tsx';

export const metadata: Metadata = { title: 'Terms of Use' };

// PRD-007 US-007.4 AC-3 (IT Rules 2021 Rule 3(1)(b) [INFERRED]): unlawful-content categories named.
export default function TermsPage() {
  return (
    <article className="legal">
      <h1>Terms of Use</h1>
      <p className="faint">Last updated {UPDATED}</p>
      <h2>What StockPanic is</h2>
      <p>StockPanic collects financial news about Indian listed companies, groups duplicates into one story, and links to the original sources. It is an information service, not investment advice. Vote counts and comments are what users think, not StockPanic&apos;s assessment. Decide for yourself, and read the original sources.</p>
      <h2>Your account</h2>
      <ul>
        <li>You must be 18 or older to create an account.</li>
        <li>Keep access to your email secure; anyone with it can sign in as you.</li>
        <li>One person, one account. Accounts used to manipulate votes may have voting turned off.</li>
      </ul>
      <h2>What you must not post</h2>
      <p>You may share any opinion about any company, including buy or sell views. You must not post content that is unlawful, including content that:</p>
      <ul>
        <li>defames someone;</li>
        <li>impersonates a person or organisation;</li>
        <li>is obscene or pornographic;</li>
        <li>threatens violence or harm;</li>
        <li>promotes hatred against a group;</li>
        <li>reveals someone&apos;s private information without consent;</li>
        <li>infringes copyright or other intellectual property;</li>
        <li>is spam, or is otherwise unlawful under Indian law.</li>
      </ul>
      <p>
        We remove content when a court or government order requires it, when a valid complaint shows it is unlawful, and spam. We do not remove content for disagreeing with a view. Anyone can complain using the <Link href="/grievance">grievance form</Link>; you are told when we remove your content and can dispute it there.
      </p>
      <h2>Paid plans</h2>
      <ul>
        <li>Prices include GST. Paid plans renew automatically until cancelled.</li>
        <li>Cancel any time from settings in one step. Paid features last until the end of the period you paid for; we do not give partial refunds.</li>
        <li>If a renewal payment fails, it is retried for 7 days and paid features stay on; after that the account returns to Free. Nothing you saved is deleted.</li>
      </ul>
      <h2>Our responsibility</h2>
      <p>We work hard to tag every story to the right company and to keep the feed complete, but sources can be late, wrong or incomplete. StockPanic is provided as it is, and we are not liable for decisions made using it.</p>
      <h2>Changes</h2>
      <p>We will tell you before any material change to these terms takes effect. These terms are governed by the laws of India.</p>
      <GrievanceOfficer />
    </article>
  );
}
