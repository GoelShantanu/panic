'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Direction, Instrument, QualityKind, VoteDisplay } from '../types.ts';
import { optimistic, sendVote } from './vote.ts';
import type { VoteAction } from './vote.ts';

// PRD-005 US-005.3: 0 → "Be the first to vote"; 1–2 → "N people voted"; ≥ 3 → counts, always
// labelled as community opinion (C-001.5) and always with words next to colour.
export function CommunityOpinion({ votes, compact = false }: { votes: VoteDisplay; compact?: boolean }) {
  const d = votes.directional;
  if (!d) return null;
  if (d.state === 'none') return compact ? null : <span className="faint">Be the first to vote</span>;
  if (d.state === 'few') return compact ? null : <span className="muted">{d.total === 1 ? '1 person voted' : `${d.total} people voted`}</span>;
  return (
    <span className="opinion" title="Community opinion: what users voted, not StockPanic's assessment">
      <span className="opinion-label">{d.label}:</span> <span className="bull">Bullish {d.bullish}</span> · <span className="bear">Bearish {d.bearish}</span> · <span className="neu">Neutral {d.neutral}</span>
    </span>
  );
}

const DIRECTIONS: { value: Direction; label: string; key: string }[] = [
  { value: 'bullish', label: 'Bullish', key: '+' },
  { value: 'bearish', label: 'Bearish', key: '−' },
  { value: 'neutral', label: 'Neutral', key: '0' },
];
const QUALITY: { value: QualityKind; label: string }[] = [
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'wrong_stock', label: 'Wrong stock' },
  { value: 'spam', label: 'Spam' },
  { value: 'old_news', label: 'Old news' },
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
  if (!signedIn) {
    return (
      <div className="vote-controls">
        <CommunityOpinion votes={votes} />
        <span className="muted">
          <Link href="/sign-in">Sign in</Link> to vote.
        </span>
      </div>
    );
  }
  const mine = votes.mine ?? { directional: null, quality: [] };
  const canDirectional = votes.directional !== undefined;
  return (
    <div className="vote-controls" onClick={(e) => e.stopPropagation()}>
      {canDirectional && (
        <span className="vote-group" role="group" aria-label="Your view (community opinion)">
          {DIRECTIONS.map((d) => (
            <button key={d.value} type="button" className={`vote vote-${d.value}`} aria-pressed={mine.directional === d.value} onClick={() => act({ kind: 'directional', value: d.value })} title={`${d.label} (${d.key})`}>
              {d.label}
            </button>
          ))}
        </span>
      )}
      <button type="button" className="vote" aria-pressed={mine.quality.includes('important')} onClick={() => act({ kind: 'quality', value: 'important' })} title="Important (I)">
        Important{votes.important_count ? ` ${votes.important_count}` : ''}
      </button>
      <details className="vote-more">
        <summary className="vote">Report</summary>
        <div className="vote-menu">
          {QUALITY.map((q) => (
            <button
              key={q.value}
              type="button"
              className="vote"
              aria-pressed={mine.quality.includes(q.value)}
              onClick={() => (q.value === 'wrong_stock' || q.value === 'duplicate') && !mine.quality.includes(q.value) ? setForm(q.value) : act({ kind: 'quality', value: q.value })}
            >
              {q.label}
            </button>
          ))}
        </div>
      </details>
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
