'use client';

import { useEffect, useState } from 'react';

type Theme = 'system' | 'light' | 'dark';
const KEY = 'sp-theme';
const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<Theme, string> = { system: 'Theme: system', light: 'Theme: light', dark: 'Theme: dark' };

function apply(theme: Theme) {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

// Runs before first paint (inlined in <head>) so a saved theme never flashes the wrong one.
export const THEME_BOOT = `try{var t=localStorage.getItem('${KEY}');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    try {
      const t = localStorage.getItem(KEY);
      if (t === 'light' || t === 'dark') setTheme(t);
    } catch {}
  }, []);
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={LABEL[theme]}
      title={LABEL[theme]}
      onClick={() => {
        const next = NEXT[theme];
        setTheme(next);
        apply(next);
        try {
          if (next === 'system') localStorage.removeItem(KEY);
          else localStorage.setItem(KEY, next);
        } catch {}
      }}
    >
      {theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'}
    </button>
  );
}
