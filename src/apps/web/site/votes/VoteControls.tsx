'use client';

import { Icon } from '../Icon.tsx';
import type { IconName } from '../Icon.tsx';
import Link from 'next/link';
import { useState } from 'react';
import type { Direction, Instrument, QualityKind, VoteDisplay } from '../types.ts';
import { optimistic, sendVote } from './vote.ts';
import type { VoteAction } from './vote.ts';

// PRD-005 US-005.3: 0 → "Be the first to vote"; 1–2 → "N people voted"; ≥ 3 → counts.
// Compact mode renders sleek CryptoPanic-style symbols with counts (↑ Bullish, ↓ Bearish, ― Neutral, ▲ Important).
export function CommunityOpinion({ votes, compact = false, emptyText = 'Be the first to vote' }: { votes: VoteDisplay; compact?: boolean; emptyText?: string }) {
  const d = votes.directional;
  if (!d) return null;
  if (d.state === 'none') return compact ? null : <span className="opinion-empty faint">{emptyText}</span>;
  if (d.state === 'few') return compact ? null : <span className="opinion-few muted">{d.total === 1 ? '1 person voted' : `${d.total} people voted`}</span>;
  if (compact) {
    return (
      <span className="opinion-compact" aria-label={`Community opinion: Bullish ${d.bullish}, Bearish ${d.bearish}, Neutral ${d.neutral}`} title="Community opinion">
        <span className="opinion-badge bull" title={`Bullish: ${d.bullish}`}>
          <Icon name="arrowUp" size={11} strokeWidth={2.4} />
          <span>{d.bullish}</span>
        </span>
        <span className="opinion-badge bear" title={`Bearish: ${d.bearish}`}>
          <Icon name="arrowDown" size={11} strokeWidth={2.4} />
          <span>{d.bearish}</span>
        </span>
        <span className="opinion-badge neu" title={`Neutral: ${d.neutral}`}>
          <Icon name="neutral" size={11} strokeWidth={2.8} />
          <span>{d.neutral}</span>
        </span>
        {votes.important_count > 0 && (
          <span className="opinion-badge important" title={`Important: ${votes.important_count}`}>
            <Icon name="alertTriangle" size={11} strokeWidth={2.2} />
            <span>{votes.important_count}</span>
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="opinion" title="Community opinion: what users voted, not StockPanic's assessment">
      <span className="opinion-label">{d.label}:</span> <span className="bull">Bullish {d.bullish}</span> · <span className="bear">Bearish {d.bearish}</span> · <span className="neu">Neutral {d.neutral}</span>
    </span>
  );
}

const DIRECTIONS: { value: Direction; label: string; key: string; icon: IconName }[] = [
  { value: 'bullish', label: 'Bullish', key: '+', icon: 'bull' },
  { value: 'bearish', label: 'Bearish', key: '−', icon: 'bear' },
  { value: 'neutral', label: 'Neutral', key: '0', icon: 'neutral' },
];
const QUALITY: { value: QualityKind; label: string }[] = [
  { value: 'duplicate', label: 'Duplicate story' },
  { value: 'wrong_stock', label: 'Wrong company tagged' },
  { value: 'spam', label: 'Spam or promo' },
  { value: 'old_news', label: 'Outdated news' },
];

export interface VoteControlsProps {
  storyId: string;
  votes: VoteDisplay;
  instruments: Instrument[];
  signedIn: boolean;
  onVotes: (v: VoteDisplay) => void;
}

// Controls for one story (US-005.1). Keyboard shortcuts call the same action through `useVoteAction`.
export function VoteControls({ storyId, votes, instruments, signedIn, onVotes }: VoteControlsProps) {
  const { act, message, setMessage } = useVoteAction(storyId, votes, onVotes);
  const [form, setForm] = useState<'wrong_stock' | 'duplicate' | null>(null);
  const [duplicateOf, setDuplicateOf] = useState('');

  const mine = votes.mine ?? { directional: null, quality: [] };
  const canDirectional = votes.directional !== undefined;
  const isAccountTooNew = signedIn && votes.can_vote?.directional === false && votes.can_vote?.reason === 'account_too_new';

  const handleDirectional = (val: Direction) => {
    if (!signedIn) {
      setMessage('Sign in to vote.');
      return;
    }
    if (isAccountTooNew) {
      setMessage('Directional voting unlocks 7 days after account creation to protect against market manipulation.');
      return;
    }
    act({ kind: 'directional', value: val });
  };

  const handleQuality = (val: QualityKind) => {
    if (!signedIn) {
      setMessage('Sign in to vote.');
      return;
    }
    act({ kind: 'quality', value: val });
  };

  return (
    <div className="vote-controls" onClick={(e) => e.stopPropagation()}>
      {canDirectional && (
        <span className="vote-group" role="group" aria-label="Your view (community opinion)">
          {DIRECTIONS.map((d) => {
            const count = votes.directional && votes.directional.state === 'counts' ? votes.directional[d.value] : undefined;
            return (
              <button
                key={d.value}
                type="button"
                className={`vote vote-${d.value}`}
                aria-label={d.label}
                aria-pressed={mine.directional === d.value}
                onClick={() => handleDirectional(d.value)}
                title={isAccountTooNew ? `${d.label}: Unlocks 7 days after account creation` : `${d.label} (${d.key})`}
              >
                <Icon name={d.icon} size={13} />
                <span className="vote-label">{d.label}</span>
                {count !== undefined && count > 0 && <span className="vote-count" aria-hidden="true">{count}</span>}
                <kbd className="vote-key" aria-hidden="true">{d.key}</kbd>
                {isAccountTooNew && <Icon name="lock" size={11} />}
              </button>
            );
          })}
        </span>
      )}
      <button
        type="button"
        className="vote vote-important"
        aria-label="Important"
        aria-pressed={mine.quality.includes('important')}
        onClick={() => handleQuality('important')}
        title="Important (I)"
      >
        <Icon name="star" size={13} />
        <span className="vote-label">Important</span>
        {votes.important_count > 0 && <span className="vote-count" aria-hidden="true">{votes.important_count}</span>}
        <kbd className="vote-key" aria-hidden="true">I</kbd>
      </button>
      <details className="vote-more">
        <summary className="vote vote-report" aria-label="Report" title="Report issue with story">
          <Icon name="flag" size={13} />
          <span className="vote-label">Report</span>
          <Icon name="chevronDown" size={10} />
        </summary>
        <div className="vote-menu">
          {QUALITY.map((q) => (
            <button
              key={q.value}
              type="button"
              className="vote vote-menu-item"
              aria-pressed={mine.quality.includes(q.value)}
              onClick={() => {
                if (!signedIn) {
                  setMessage('Sign in to report.');
                  return;
                }
                if ((q.value === 'wrong_stock' || q.value === 'duplicate') && !mine.quality.includes(q.value)) {
                  setForm(q.value);
                } else {
                  act({ kind: 'quality', value: q.value });
                }
              }}
            >
              {q.label}
            </button>
          ))}
        </div>
      </details>

      {!signedIn && (
        <Link href="/sign-in" className="vote-signin-btn" title="Sign in to cast votes">
          <Icon name="signin" size={13} />
          <span>Sign in to vote</span>
        </Link>
      )}

      <CommunityOpinion votes={votes} />

      {form === 'wrong_stock' && (
        <div className="vote-form" role="dialog" aria-label="Which company is wrongly tagged?">
          <span>Which company is wrongly tagged?</span>
          {instruments.length === 0 && <span className="muted">This story has no tagged company.</span>}
          {instruments.map((i) => (
            <button key={i.isin} type="button" className="button" onClick={() => (act({ kind: 'quality', value: 'wrong_stock', detail: { isin: i.isin } }), setForm(null))}>
              {i.display_symbol ?? i.isin}
            </button>
          ))}
          <button type="button" className="icon-button" onClick={() => setForm(null)}>
            Cancel
          </button>
        </div>
      )}
      {form === 'duplicate' && (
        <form
          className="vote-form"
          onSubmit={(e) => {
            e.preventDefault();
            const m = duplicateOf.match(/st_[0-9A-Z]{26}/);
            act({ kind: 'quality', value: 'duplicate', ...(m ? { detail: { story_id: m[0] } } : {}) });
            setForm(null);
          }}
        >
          <label>
            Duplicate of (optional link)
            <input value={duplicateOf} onChange={(e) => setDuplicateOf(e.target.value)} placeholder="Paste the other story's link" />
          </label>
          <button type="submit" className="button">
            Report duplicate
          </button>
          <button type="button" className="icon-button" onClick={() => setForm(null)}>
            Cancel
          </button>
        </form>
      )}
      {message && (
        <span className="vote-error" role="status" onClick={() => setMessage(null)}>
          {message}
          {!signedIn && (
            <>
              {' '}
              <Link href="/sign-in" className="vote-error-link">
                Sign in
              </Link>
            </>
          )}
        </span>
      )}
    </div>
  );
}

export function useVoteAction(storyId: string, votes: VoteDisplay, onVotes: (v: VoteDisplay) => void) {
  const [message, setMessage] = useState<string | null>(null);
  async function act(a: VoteAction) {
    const before = votes;
    onVotes(optimistic(before, a));
    setMessage(null);
    const r = await sendVote(storyId, before, a);
    if (r.ok) onVotes(r.votes);
    else {
      onVotes(before);
      setMessage(r.message);
    }
  }
  return { act, message, setMessage };
}
