'use client';

import { useEffect, useState } from 'react';
import type { CommentPage } from '../comments/Comments.tsx';
import type { VoteDisplay } from '../types.ts';
import { StoryView } from './StoryView.tsx';
import type { StoryDetail } from './StoryView.tsx';

type Loaded = { state: 'loading' } | { state: 'error' } | { state: 'ready'; story: StoryDetail; comments: CommentPage | null };

async function getJson<T>(path: string): Promise<{ status: number; body: T | null }> {
  const res = await fetch(path, { credentials: 'same-origin' }).catch(() => null);
  return { status: res?.status ?? 0, body: res ? ((await res.json().catch(() => null)) as T | null) : null };
}

// The stream's side panel on wide screens (D-055): the list stays put on the left; the story opens
// on the right, the way CryptoPanic's reader works. Same content as /s/{id}.
export function StoryPanel({
  storyId,
  eventLabels,
  signedIn,
  me,
  onClose,
  onVotes,
}: {
  storyId: string;
  eventLabels: [string, string][];
  signedIn: boolean;
  me: string | null;
  onClose: () => void;
  onVotes: (v: VoteDisplay) => void;
}) {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  useEffect(() => {
    let live = true;
    setLoaded({ state: 'loading' });
    void (async () => {
      let r = await getJson<StoryDetail & { redirect?: string }>(`/v1/stories/${encodeURIComponent(storyId)}`);
      if (r.status === 301 && r.body?.redirect) r = await getJson<StoryDetail>(`/v1/stories/${encodeURIComponent(r.body.redirect)}`); // merged
      if (r.status !== 200 || !r.body) return live && setLoaded({ state: 'error' });
      const c = await getJson<CommentPage>(`/v1/stories/${encodeURIComponent(r.body.story_id)}/comments`);
      if (live) setLoaded({ state: 'ready', story: r.body, comments: c.status === 200 ? c.body : null });
    })();
    return () => {
      live = false;
    };
  }, [storyId]);

  return (
    <aside className="story-panel" aria-label="Story" aria-busy={loaded.state === 'loading'}>
      {loaded.state === 'ready' ? (
        <StoryView key={loaded.story.story_id} story={loaded.story} eventLabels={eventLabels} signedIn={signedIn} me={me} comments={loaded.comments} variant="panel" onClose={onClose} onVotes={onVotes} />
      ) : (
        <div className="story story-panel-body">
          <div className="panel-bar">
            <span className="faint">{loaded.state === 'loading' ? 'Loading story…' : 'This story could not be loaded.'}</span>
            <button type="button" className="icon-button panel-close" aria-label="Close story" onClick={onClose}>
              ✕
            </button>
          </div>
          {loaded.state === 'error' && (
            <p>
              <a href={`/s/${storyId}`}>Open the story page</a>
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
