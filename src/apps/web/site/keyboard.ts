'use client';

import { useEffect, useRef } from 'react';
import { isPhone } from './Phone.tsx';

// PRD-001 US-001.5 AC-4: shortcuts do nothing while typing, or with Ctrl/Alt/Meta held.
export function shortcutAllowed(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.altKey || e.metaKey) return false;
  const t = e.target as HTMLElement | null;
  if (!t) return true;
  const tag = t.tagName;
  return !(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable);
}

export function useShortcuts(handlers: Record<string, (e: KeyboardEvent) => void>) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isPhone()) return; // PRD-001 US-001.8 AC-3
      if (e.key !== 'Escape' && !shortcutAllowed(e)) return;
      // Some layouts and tools report the physical key with Shift rather than the character.
      const key = e.shiftKey && e.code === 'Slash' ? '?' : e.shiftKey && e.code === 'Equal' ? '+' : e.key;
      const fn = ref.current[key] ?? ref.current[key.toLowerCase()];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
