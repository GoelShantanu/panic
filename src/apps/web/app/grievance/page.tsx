import type { Metadata } from 'next';
import Link from 'next/link';
import { GrievanceForm } from '../../site/community/GrievanceForm.tsx';
import { GrievanceOfficer } from '../../site/legal.tsx';

export const metadata: Metadata = { title: 'Grievances', alternates: { canonical: '/grievance' } };

// PRD-006 US-006.8 (IT Rules 2021 Rule 3(2) [INFERRED]); linked from every page footer (C-006.6).
export default async function GrievancePage({ searchParams }: { searchParams: Promise<{ comment?: string }> }) {
  const { comment } = await searchParams;
  return (
    <article className="legal">
      <h1>Grievances</h1>
      <GrievanceOfficer />
      <p>
        Use this form to report unlawful content (for example defamation, impersonation, or personal data posted without consent), to send a court order or government notice, or to dispute the removal of your own comment. You do not need an account.
      </p>
      <p className="muted">
        Disagreeing with a comment, or thinking it is bad investment advice, is not a reason for removal. See the <Link href="/terms">Terms</Link>.
      </p>
      <GrievanceForm commentId={typeof comment === 'string' && /^cm_[0-9A-Z]{26}$/.test(comment) ? comment : null} />
    </article>
  );
}
