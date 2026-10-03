'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// The header lives in the root layout, which soft navigation does not re-render. After a page marks
// something read, this refreshes once so the header's dot reflects it.
export function RefreshOnce({ when }: { when: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (when) router.refresh();
  }, [when, router]);
  return null;
}
