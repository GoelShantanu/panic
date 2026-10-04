'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

// On desktop, pages scroll inside <main>, not the window (D-057), so the router's own scroll handling
// leaves a new page part-way down. Start each page at its top.
export function ScrollReset() {
  const path = usePathname();
  useEffect(() => {
    document.getElementById('main')?.scrollTo(0, 0);
  }, [path]);
  return null;
}
