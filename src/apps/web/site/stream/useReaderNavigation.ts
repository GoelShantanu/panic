'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export const PANEL_QUERY = '(min-width: 1100px)';
const panelState = () => (typeof history !== 'undefined' ? ((history.state as { spStory?: string } | null)?.spStory ?? null) : null);

export function useReaderNavigation(defaultStory: string | null, setSelected: Dispatch<SetStateAction<string | null>>) {
  const [shown, setShown] = useState<string | null>(defaultStory);
  // Read on the first client render (it only changes click handlers, never markup), so a click right
  // after load already uses the reader.
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(PANEL_QUERY).matches === true);
  const streamUrl = useRef<string | null>(null);
  useEffect(() => {
    const mq = window.matchMedia?.(PANEL_QUERY);
    if (!mq) return;
    setWide(mq.matches);
    const on = () => setWide(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [setSelected]);
  // A chosen story puts its own URL in the address bar, so it can be copied or shared; Back returns.
  const openPanel = useCallback((id: string) => {
    setSelected(id);
    if (panelState() === null) {
      streamUrl.current = window.location.pathname + window.location.search;
      history.pushState({ spStory: id }, '', `/s/${id}`);
    } else if (panelState() !== id) history.replaceState({ spStory: id }, '', `/s/${id}`);
    setShown(id);
  }, [setSelected]);
  const closePanel = useCallback(() => {
    setShown(null);
    setSelected(null);
    if (panelState() !== null) {
      history.pushState(null, '', streamUrl.current ?? '/');
    }
  }, [setSelected]);
  useEffect(() => {
    const onPop = () => {
      const id = panelState();
      setShown(id ?? defaultStory);
      setSelected(id);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [defaultStory, setSelected]);
  // Narrowed while a chosen story is in the address bar: hand over to its full page.
  useEffect(() => {
    if (!wide && shown && panelState() && streamUrl.current !== null) window.location.assign(`/s/${shown}`);
  }, [shown, wide]);
  const resetReader = () => {
    if (panelState() && streamUrl.current) history.replaceState({}, '', streamUrl.current);
    setShown(defaultStory);
  };
  return { shown, wide, openPanel, closePanel, resetReader };
}
