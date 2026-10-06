'use client';

import Link from 'next/link';
import { age, istDateTime } from '../format.ts';
import { Icon } from '../Icon.tsx';
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
  // Wide screens: open the story in the side panel instead of leaving the stream (D-055).
  onOpen?: () => void;
  // Inline vote and Follow controls; hidden while the side panel shows them.
  actions?: boolean;
  // The story in the reader column (D-055); marked on wide screens only, by CSS.
  shown?: boolean;
}

// PRD-001 US-001.1 AC-2: headline, source, age, symbols, event types, source count, comment count,
// compact community opinion at ≥ 3 votes; the selected row carries vote controls.
export function StoryRow({ story: s, selected, labels, signedIn, message, onSelect, onVotes, followed, onFollow, onOpen, actions = true, shown = false }: RowProps) {
  const symbols = s.instruments.map((i) => i.display_symbol ?? i.exchange_codes.bse ?? i.isin);
  const unresolved = s.instruments.length === 0 && s.unresolved_mentions.length > 0;
  return (
    <li
      className="row"
      id={`row-${s.story_id}`}
      data-selected={selected || undefined}
      data-shown={shown || undefined}
      data-unread={s.is_unread || undefined}
      aria-current={selected ? 'true' : undefined}
      onClick={(e) => {
        // Links (the headline handles its own clicks), buttons and menus keep their own behaviour.
        if ((e.target as HTMLElement).closest('a, button, details, input')) return;
        onSelect();
      }}
    >
      <div className="row-main">
        <time className="row-age mono" dateTime={s.first_seen_at} title={`${istDateTime(s.first_seen_at)} IST`}>
          {age(s.first_seen_at)}
        </time>
        <div className="row-body">
          <div className="row-line">
            {s.primary_item.kind === 'filing' && <span className="badge badge-filing">Filing</span>}
            <Link
              href={`/s/${s.story_id}`}
              className="row-headline"
              tabIndex={-1}
              onClick={(e) => {
                // A plain click opens the reader; Ctrl/Cmd/middle click still opens the page in a new tab.
                if (!onOpen || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                e.stopPropagation();
                onOpen();
              }}
            >
              {s.headline}
            </Link>
          </div>
          <div className="row-meta">
            <span className="row-source">{s.primary_item.source.name}</span>
            {s.source_count > 1 && <span className="badge" title={`${s.source_count} sources`}>{s.source_count} sources</span>}
            {unresolved && <span className="symbol symbol-unresolved" title={`Mentions: ${s.unresolved_mentions.join(', ')}`}>Unresolved</span>}
            {s.event_types
              .filter((t) => t !== 'other')
              .map((t) => (
                <span key={t} className="tag">
                  {labels.get(t) ?? t}
                </span>
              ))}
            {s.comment_count > 0 && (
              <span className="opinion-badge comment" title={s.comment_count === 1 ? '1 comment' : `${s.comment_count} comments`}>
                <Icon name="chat" size={11} />
                <span>{s.comment_count}</span>
              </span>
            )}
            {!(selected && actions) && <CommunityOpinion votes={s.votes} compact />}
          </div>
        </div>
        {/* Companies in their own column at the right edge, so the eye can run down them. */}
        {symbols.length > 0 && (
          <div className="row-symbols">
            {symbols.map((sym, i) => (
              <Link key={s.instruments[i]!.isin} href={`/c/${s.instruments[i]!.isin}`} className="symbol" tabIndex={-1} title={s.instruments[i]!.name ?? undefined}>
                {sym}
              </Link>
            ))}
          </div>
        )}
      </div>
      {selected && <PhoneNote />}
      {selected && actions && (
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
