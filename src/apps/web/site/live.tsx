'use client';

// One live connection per tab (ADR-005), shared by every component that listens. Reconnects with
// backoff 1 s, 2 s, 4 s … capped at 60 s, resuming from the last event id so nothing is missed
// (PRD-001 US-001.2 AC-4). "Reconnecting" is reported only after 10 s without a connection.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type LiveEventType = 'story.created' | 'story.updated' | 'session.changed' | 'source.health' | 'resync';
type Listener = (data: any) => void;

interface LiveApi {
  subscribe(type: LiveEventType, fn: Listener): () => void;
  reconnecting: boolean;
}

export const LiveContext = createContext<LiveApi>({ subscribe: () => () => undefined, reconnecting: false });
const TYPES: LiveEventType[] = ['story.created', 'story.updated', 'session.changed', 'source.health', 'resync'];

export const backoffMs = (attempt: number) => Math.min(60_000, 1000 * 2 ** attempt);

export function LiveProvider({ children, url = '/v1/live' }: { children: ReactNode; url?: string }) {
  const listeners = useRef(new Map<LiveEventType, Set<Listener>>());
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    let es: EventSource | null = null;
    let attempt = 0;
    let lastId: string | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let downTimer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const emit = (type: LiveEventType, data: unknown) => listeners.current.get(type)?.forEach((fn) => fn(data));
    const markDown = () => {
      if (!downTimer) downTimer = setTimeout(() => setReconnecting(true), 10_000);
    };
    const connect = () => {
      if (closed) return;
      es = new EventSource(lastId ? `${url}?last_event_id=${encodeURIComponent(lastId)}` : url);
      es.onopen = () => {
        attempt = 0;
        clearTimeout(downTimer);
        downTimer = undefined;
        setReconnecting(false);
      };
      for (const type of TYPES) {
        es.addEventListener(type, (ev) => {
          const m = ev as MessageEvent<string>;
          if (m.lastEventId) lastId = m.lastEventId;
          try {
            emit(type, JSON.parse(m.data));
          } catch {
            /* a malformed frame is skipped, never fatal */
          }
        });
      }
      es.onerror = () => {
        es?.close();
        markDown();
        retryTimer = setTimeout(connect, backoffMs(attempt++));
      };
    };
    connect();
    return () => {
      closed = true;
      es?.close();
      clearTimeout(retryTimer);
      clearTimeout(downTimer);
    };
  }, [url]);

  const subscribe = useCallback((type: LiveEventType, fn: Listener) => {
    if (!listeners.current.has(type)) listeners.current.set(type, new Set());
    listeners.current.get(type)!.add(fn);
    return () => void listeners.current.get(type)?.delete(fn);
  }, []);
  const api = useMemo<LiveApi>(() => ({ subscribe, reconnecting }), [subscribe, reconnecting]);
  return <LiveContext.Provider value={api}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveApi {
  return useContext(LiveContext);
}

export function useLiveEvent(type: LiveEventType, fn: Listener) {
  const { subscribe } = useLive();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => subscribe(type, (d) => ref.current(d)), [subscribe, type]);
}
