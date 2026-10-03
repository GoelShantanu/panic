'use client';

import Link from 'next/link';
import { age, istDateTime } from '../format.ts';
import type { StoryCard, VoteDisplay } from '../types.ts';
import { CommunityOpinion, VoteControls } from '../votes/VoteControls.tsx';
import { PhoneNote } from '../Phone.tsx';

export interface RowProps {
  story: StoryCard;
  selected: boolean;
  labels: ReadonlyMap<string, string>;
  signedIn: boolean;
  message: string | null;
  onSelect: () => void;
  onVotes: (v: VoteDisplay) => void;
  followed?: ReadonlySet<string> | null;
  onFollow?: (isin: string, follow: boolean) => void;
}

// PRD-001 US-001.1 AC-2: headline, source, age, symbols, event types, source count, comment count,
// compact community opinion at ≥ 3 votes; the selected row carries vote controls.
export function StoryRow({ story: s, selected, labels, signedIn, message, onSelect, onVotes, followed, onFollow }: RowProps) {
  const symbols = s.instruments.map((i) => i.display_symbol ?? i.exchange_codes.bse ?? i.isin);
  const unresolved = s.instruments.length === 0 && s.unresolved_mentions.length > 0;
  return (
    <li
      className="row"
      id={`row-${s.story_id}`}
      data-selected={selected || undefined}
      data-unread={s.is_unread || undefined}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
    >
      <div className="row-main">
        <time className="row-age mono" dateTime={s.first_seen_at} title={`${istDateTime(s.first_seen_at)} IST`}>
          {age(s.first_seen_at)}
        </time>
        <div className="row-body">
          <div className="row-line">
            {s.primary_item.kind === 'filing' && <span className="badge badge-filing">Filing</span>}
            <Link href={`/s/${s.story_id}`} className="row-headline" tabIndex={-1}>
              {s.headline}
            </Link>
          </div>
          <div className="row-meta">
            <span className="row-source">{s.primary_item.source.name}</span>
            {s.source_count > 1 && <span className="badge" title={`${s.source_count} sources`}>{s.source_count} sources</span>}
            {symbols.map((sym, i) => (
              <Link key={s.instruments[i]!.isin} href={`/c/${s.instruments[i]!.isin}`} className="symbol" tabIndex={-1}>
                {sym}
              </Link>
            ))}
            {unresolved && <span className="symbol symbol-unresolved" title={`Mentions: ${s.unresolved_mentions.join(', ')}`}>Unresolved</span>}
            {s.event_types
              .filter((t) => t !== 'other')
              .map((t) => (
                <span key={t} className="tag">
                  {labels.get(t) ?? t}
                </span>
              ))}
            {s.comment_count > 0 && <span className="faint">{s.comment_count === 1 ? '1 comment' : `${s.comment_count} comments`}</span>}
            {!selected && <CommunityOpinion votes={s.votes} compact />}
          </div>
        </div>
      </div>
      {selected && <PhoneNote />}
      {selected && (
        <div className="row-actions desktop-only">
          <VoteControls storyId={s.story_id} votes={s.votes} instruments={s.instruments} signedIn={signedIn} onVotes={onVotes} />
          {signedIn && followed && onFollow && s.instruments.length > 0 && (
            <span className="row-follow" onClick={(e) => e.stopPropagation()}>
              {s.instruments.map((i) => {
                const on = followed.has(i.isin);
                return (
                  <button key={i.isin} type="button" className="vote" aria-pressed={on} onClick={() => onFollow(i.isin, !on)}>
                    {on ? 'Following' : 'Follow'} {i.display_symbol ?? i.isin}
                  </button>
                );
              })}
            </span>
          )}
          {message && <span className="vote-error" role="status">{message}</span>}
        </div>
      )}
    </li>
  );
}
