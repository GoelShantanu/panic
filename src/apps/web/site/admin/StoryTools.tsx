'use client';

import Link from 'next/link';
import { useState } from 'react';
import { adminCall, outcome } from './call.ts';
import { istDateTime } from '../format.ts';
import { Action, UserActions } from './Action.tsx';
import { StoryCorrections } from './Corrections.tsx';

// ---------------------------------------------------------------- story tools: voters, comment controls

export function StoryTools() {
  const [storyId, setStoryId] = useState('');
  const [vote, setVote] = useState('bullish');
  const [voters, setVoters] = useState<{ user_id: string; username: string; account_created_at: string; voted_at: string; discounted: boolean }[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [posting, setPosting] = useState(true);
  const [visible, setVisible] = useState(true);
  const valid = /^st_[0-9A-Z]{26}$/.test(storyId);
  return (
    <div>
      <label className="stack-label">
        Story ID
        <input value={storyId} onChange={(e) => setStoryId(e.target.value.trim())} placeholder="st_…" />
      </label>
      {valid && (
        <>
          <p>
            <Link href={`/s/${storyId}`} target="_blank">
              Open the story
            </Link>
          </p>
          <h3 className="sub-h">Corrections</h3>
          <StoryCorrections storyId={storyId} />
          <h3 className="sub-h">Who voted (viewing is audited)</h3>
          <div className="row-buttons">
            <select value={vote} onChange={(e) => setVote(e.target.value)} aria-label="Vote">
              {['bullish', 'bearish', 'neutral', 'important'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <button
              type="button"
              className="button"
              onClick={async () => {
                const r = await adminCall('GET', `/v1/admin/stories/${storyId}/voters?vote=${vote}`);
                if (r.status === 200) setVoters(r.body.voters);
                else setMsg(outcome(r, ''));
              }}
            >
              Show voters
            </button>
          </div>
          {voters && (
            <table className="panel wl-table">
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Account created</th>
                  <th scope="col">Voted</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {voters.length === 0 && (
                  <tr>
                    <td colSpan={4} className="faint">
                      No votes of this kind.
                    </td>
                  </tr>
                )}
                {voters.map((v) => (
                  <tr key={v.user_id}>
                    <td>
                      {v.username}
                      {v.discounted && <span className="tag"> discounted</span>}
                    </td>
                    <td className="faint">{istDateTime(v.account_created_at)}</td>
                    <td className="faint">{istDateTime(v.voted_at)}</td>
                    <td>
                      <UserActions userId={v.user_id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h3 className="sub-h">Comments on this story</h3>
          <label className="check">
            <input type="checkbox" checked={posting} onChange={(e) => setPosting(e.target.checked)} /> Posting allowed
          </label>
          <label className="check">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Comments visible
          </label>
          <Action label="Apply to this story" onRun={async (reason) => outcome(await adminCall('PUT', '/v1/admin/settings/comments', { story_id: storyId, posting, visible, reason }), 'Applied to this story.')} />
          {msg && <p role="status">{msg}</p>}
        </>
      )}
    </div>
  );
}
