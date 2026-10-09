'use client';

import { useEffect } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { StoryCard } from '../types.ts';
import { markUnread } from './logic.ts';

const SEEN_KEY = (view: string) => `sp-seen:${view}`;
const VISIBLE_BEFORE_SEEN_MS = 10_000;

export function readLocalSeen(view: string): string | null {
  try {
    return localStorage.getItem(SEEN_KEY(view));
  } catch {
    return null;
  }
}

export function useSeen(view: string, signedIn: boolean, newestSeen: RefObject<string | null>, setStories: Dispatch<SetStateAction<StoryCard[]>>, setUnreadCount: Dispatch<SetStateAction<number | null>>) {
  // Anonymous unread marker from browser storage (US-001.4 AC-4); signed-in comes from the server.
  useEffect(() => {
    if (signedIn) return;
    const seen = readLocalSeen(view);
    if (!seen) return;
    setStories((list) => {
      const marked = markUnread(list, seen);
      setUnreadCount(marked.filter((s) => s.is_unread).length);
      return marked;
    });
  }, [signedIn, view, newestSeen, setStories, setUnreadCount]);

  // last_seen_at moves on only after ≥ 10 s visible, when the tab hides or closes (US-001.4 AC-3).
  useEffect(() => {
    let visibleSince = document.visibilityState === 'visible' ? Date.now() : null;
    const record = () => {
      if (visibleSince === null || Date.now() - visibleSince < VISIBLE_BEFORE_SEEN_MS || !newestSeen.current) return;
      const at = newestSeen.current;
      if (signedIn) {
        fetch('/v1/stream/seen', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ view, last_seen_at: at }) }).catch(() => undefined);
      } else {
        try {
          localStorage.setItem(SEEN_KEY(view), at);
        } catch {}
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        record();
        visibleSince = null;
      } else visibleSince = Date.now();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', record);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', record);
    };
  }, [signedIn, view, newestSeen]);

}
