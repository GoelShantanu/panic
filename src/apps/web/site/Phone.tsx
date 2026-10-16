'use client';

import { useEffect, useState } from 'react';

// PRD-001 US-001.8, D-067: under 768 px participation remains limited, with watchlist/alerts enabled.
// CSS hides `.desktop-only` and shows
// `.phone-only`; this media query is the same breakpoint for script.
export const PHONE_QUERY = '(max-width: 767px)';
export const isPhone = () => typeof window !== 'undefined' && window.matchMedia?.(PHONE_QUERY).matches === true;

// Mobile phone support: full voting, commenting and alerts are enabled across viewports.
export function PhoneNote() {
  return null;
}

export function PhoneNotice() {
  return null;
}
