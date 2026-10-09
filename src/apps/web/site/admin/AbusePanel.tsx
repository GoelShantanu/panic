'use client';

import Link from 'next/link';
import { UserActions } from './Action.tsx';
import type { Abuse } from './types.ts';

// PRD-005 §8: signals for review. Nothing here acts automatically (D-020).
export function AbusePanel({ abuse }: { abuse: Abuse }) {
  const share = abuse.bullish_view_sme_share;
  return (
    <div>
      <p className="muted">Signals for review only. Nothing here changes votes until an operator acts.</p>
      <h3 className="sub-h">Vote bursts (last 15 min, half or more from accounts under 30 days)</h3>
      {abuse.vote_bursts.length === 0 ? (
        <p className="faint">None.</p>
      ) : (
        <ul className="plain-list">
          {abuse.vote_bursts.map((b) => (
            <li key={b.story_id}>
              <Link href={`/s/${b.story_id}`} target="_blank" className="mono">
                {b.story_id}
              </Link>{' '}
              · {b.votes} votes, {b.new_account_votes} from new accounts
            </li>
          ))}
        </ul>
      )}
      <h3 className="sub-h">Shared addresses (5+ accounts voting from one IP, 24 h)</h3>
      {abuse.shared_ips.length === 0 ? (
        <p className="faint">None.</p>
      ) : (
        <ul className="plain-list">
          {abuse.shared_ips.map((s) => (
            <li key={`${s.story_id}-${s.ip}`}>
              <span className="mono">{s.story_id}</span> · {s.ip} · {s.accounts} accounts
            </li>
          ))}
        </ul>
      )}
      <h3 className="sub-h">Concentrated voters (80%+ of 7-day votes on one company)</h3>
      {abuse.concentrated_voters.length === 0 ? (
        <p className="faint">None.</p>
      ) : (
        <ul className="plain-list">
          {abuse.concentrated_voters.map((c) => (
            <li key={`${c.user_id}-${c.isin}`}>
              {c.votes} of {c.total} votes on <Link href={`/c/${c.isin}`}>{c.isin}</Link>
              <UserActions userId={c.user_id} />
            </li>
          ))}
        </ul>
      )}
      <h3 className="sub-h">Bullish-leaning stories that are SME (24 h)</h3>
      <p>
        {share.sme} of {share.total}
        {share.total > 0 && ` (${Math.round((share.sme / share.total) * 100)}%)`}
      </p>
      {(abuse.sme_bullish_stories?.length ?? 0) > 0 && (
        <>
          <h3 className="sub-h">SME stories in the Bullish view: read them (patient brigades trip no signal above)</h3>
          <ul className="plain-list">
            {abuse.sme_bullish_stories!.map((s) => (
              <li key={s.story_id}>
                <Link href={`/s/${s.story_id}`} target="_blank">
                  {s.headline}
                </Link>{' '}
                <span className="faint">
                  · {s.bullish} bullish / {s.bearish} bearish · {s.voters_under_90_days} bullish voters with accounts under 90 days
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
