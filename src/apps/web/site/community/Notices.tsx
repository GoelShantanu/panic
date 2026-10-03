'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { removalLabel } from '../comments/text.tsx';
import { istDateTime } from '../format.ts';

export interface Notice {
  kind: 'comment_removed' | 'comment_restored' | 'commenting_suspended' | 'voting_revoked' | 'payment_retrying' | 'downgraded';
  created_at: string;
  comment_id?: string;
  reason?: string;
  access_until?: string;
}

function NoticeText({ n }: { n: Notice }) {
  switch (n.kind) {
    case 'comment_removed':
      // PRD-006 US-006.8 AC-5/AC-7: the reason, and how to dispute it once.
      return (
        <>
          Your comment was removed: {removalLabel(n.reason)}. <Link href={`/grievance${n.comment_id ? `?comment=${n.comment_id}` : ''}`}>Dispute this removal</Link>
        </>
      );
    case 'comment_restored':
      return <>Your removed comment was reviewed and restored.</>;
    case 'commenting_suspended':
      return (
        <>
          Commenting has been suspended for your account{n.reason ? `: ${n.reason}` : ''}. <Link href="/grievance">Dispute this</Link>
        </>
      );
    case 'voting_revoked':
      return (
        <>
          Voting has been turned off for your account{n.reason ? `: ${n.reason}` : ''}. <Link href="/grievance">Dispute this</Link>
        </>
      );
    case 'payment_retrying':
      return (
        <>
          Your last payment did not go through and will be retried. You keep Paid until {n.access_until ? `${istDateTime(n.access_until)} IST` : 'the retry period ends'}. <Link href="/settings">Billing settings</Link>
        </>
      );
    case 'downgraded':
      return (
        <>
          Your account moved to Free because payment did not go through. Your settings are kept. <Link href="/plans">Plans</Link>
        </>
      );
    default:
      return <>Account notice.</>;
  }
}

// In-app notices (PRD-006 US-006.8 AC-5, PRD-007 §5). They stay until dismissed.
export function Notices({ initial }: { initial: Notice[] }) {
  const [notices, setNotices] = useState(initial);
  const router = useRouter();
  if (notices.length === 0) return null;
  return (
    <section className="panel settings-section" aria-labelledby="notices-h">
      <h2 id="notices-h">Notices</h2>
      <ul className="plain-list">
        {notices.map((n, i) => (
          <li key={`${n.kind}-${n.created_at}-${i}`} className="notice-row">
            <span className="faint">{istDateTime(n.created_at)} IST</span> <NoticeText n={n} />
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="button"
        onClick={async () => {
          const res = await fetch('/v1/me/notices/seen', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ up_to: notices[0]!.created_at }) }).catch(() => null);
          if (res?.ok) {
            setNotices([]);
            router.refresh();
          }
        }}
      >
        Dismiss
      </button>
    </section>
  );
}
