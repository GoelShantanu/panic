'use client';

import { useState } from 'react';
import { useShortcuts } from '../keyboard.ts';
import type { Instrument, VoteDisplay } from '../types.ts';
import { useVoteAction, VoteControls } from '../votes/VoteControls.tsx';

// Story page votes (PRD-005 US-005.1 AC-1/AC-2): the controls, plus + − 0 I acting on the open story.
export function StoryVotes({ storyId, initial, instruments, signedIn, onVotes, shortcuts = true }: { storyId: string; initial: VoteDisplay; instruments: Instrument[]; signedIn: boolean; onVotes?: (v: VoteDisplay) => void; shortcuts?: boolean }) {
  const [votes, setLocal] = useState(initial);
  // The stream reader passes onVotes so the row in the list shows the same counts (D-055).
  const setVotes = (v: VoteDisplay) => {
    setLocal(v);
    onVotes?.(v);
  };
  const { act, message } = useVoteAction(storyId, votes, setVotes);
  const guard = (fn: () => void) => () => (signedIn ? fn() : undefined);
  // The stream reader is hidden on narrow screens; its keys stay off there (D-055).
  useShortcuts(shortcuts ? {
    '+': guard(() => votes.directional && void act({ kind: 'directional', value: 'bullish' })),
    '=': guard(() => votes.directional && void act({ kind: 'directional', value: 'bullish' })),
    '-': guard(() => votes.directional && void act({ kind: 'directional', value: 'bearish' })),
    '0': guard(() => votes.directional && void act({ kind: 'directional', value: 'neutral' })),
    i: guard(() => void act({ kind: 'quality', value: 'important' })),
  } : {});
  return (
    <section className="story-votes" aria-label="Votes">
      <VoteControls storyId={storyId} votes={votes} instruments={instruments} signedIn={signedIn} onVotes={setVotes} />
      {message && (
        <span className="vote-error" role="status">
          {message}
        </span>
      )}
    </section>
  );
}
