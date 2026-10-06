'use client';

import { useEffect, useRef, useState } from 'react';
import type { CommentPage } from '../comments/Comments.tsx';
import type { VoteDisplay } from '../types.ts';
import { StoryView } from './StoryView.tsx';
import type { RelatedGroup, StoryDetail } from './StoryView.tsx';

export interface ReaderData {
  story: StoryDetail;
  comments: CommentPage | null;
}

type Loaded = { state: 'loading' } | { state: 'error' } | ({ state: 'ready' } & ReaderData);

async function getJson<T>(path: string): Promise<{ status: number; body: T | null }> {
  const res = await fetch(path, { credentials: 'same-origin' }).catch(() => null);
  return { status: res?.status ?? 0, body: res ? ((await res.json().catch(() => null)) as T | null) : null };
}

// The stream's reader pane on wide screens (D-055, D-057): part of the page, beside the list, the way
// CryptoPanic's works. The first story arrives server-rendered; later ones are fetched on selection.
// On a story's own URL (pageStory) it is the page's main content, on every screen size.
export function StoryPanel({
  storyId,
  initial,
  eventLabels,
  signedIn,
  me,
  active,
  onVotes,
  pageStory,
  onClose,
}: {
  storyId: string;
  initial: ReaderData | null;
  eventLabels: [string, string][];
  signedIn: boolean;
  me: string | null;
  // False while the column is hidden (narrow screens): its vote keys must not act, and it fetches nothing.
  active: boolean;
  onVotes: (v: VoteDisplay) => void;
  pageStory?: { id: string; related: RelatedGroup[] };
  onClose?: () => void;
}) {
  const fromInitial = (id: string): Loaded | null => (initial && initial.story.story_id === id ? { state: 'ready', ...initial } : null);
  const [loaded, setLoaded] = useState<Loaded>(() => fromInitial(storyId) ?? { state: 'loading' });
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    const ready = fromInitial(storyId);
    if (ready) {
      loadedFor.current = storyId;
      return setLoaded(ready);
    }
    if (!active || loadedFor.current === storyId) return;
    loadedFor.current = storyId;
    let live = true;
    let done = false;
    setLoaded({ state: 'loading' });
    void (async () => {
      let r = await getJson<StoryDetail & { redirect?: string }>(`/v1/stories/${encodeURIComponent(storyId)}`);
      if (r.status === 301 && r.body?.redirect) r = await getJson<StoryDetail>(`/v1/stories/${encodeURIComponent(r.body.redirect)}`); // merged
      const c = r.status === 200 && r.body ? await getJson<CommentPage>(`/v1/stories/${encodeURIComponent(r.body.story_id)}/comments`) : null;
      if (!live) return;
      done = true;
      if (r.status !== 200 || !r.body) setLoaded({ state: 'error' });
      else setLoaded({ state: 'ready', story: r.body, comments: c?.status === 200 ? c.body : null });
    })();
    return () => {
      live = false;
      if (!done) loadedFor.current = null; // interrupted: fetch again when next shown
    };
    // initial is fixed for the page's life; only the selected story changes what is shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyId, active]);

  const Pane = pageStory ? 'section' : 'aside';
  const isPage = loaded.state === 'ready' && loaded.story.story_id === pageStory?.id;
  return (
    <Pane className="story-panel" aria-label="Story" aria-busy={loaded.state === 'loading'}>
      {loaded.state === 'ready' ? (
        <StoryView
          key={loaded.story.story_id}
          story={loaded.story}
          eventLabels={eventLabels}
          signedIn={signedIn}
          me={me}
          comments={loaded.comments}
          variant={isPage ? 'page' : 'panel'}
          related={isPage ? pageStory!.related : undefined}
          onVotes={onVotes}
          shortcuts={active}
          onClose={!isPage ? onClose : undefined}
        />
      ) : (
        <div className="story story-panel-body">
          <p className="faint panel-status">{loaded.state === 'loading' ? 'Loading story…' : 'This story could not be loaded.'}</p>
          {loaded.state === 'error' && (
            <p>
              <a href={`/s/${storyId}`}>Open the story page</a>
            </p>
          )}
        </div>
      )}
    </Pane>
  );
}
