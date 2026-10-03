// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { age, sessionLabel } from './format.ts';
import { Header } from './Header.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

const at = (iso: string) => new Date(iso);

describe('session label (PRD-001 US-001.7 AC-1)', () => {
  it('open, closing today', () => {
    expect(sessionLabel({ state: 'open', exchange_date: '2026-10-05', next_transition_at: '2026-10-05T10:00:00Z' }, at('2026-10-05T05:00:00Z'))).toBe('Open · closes 15:30 IST');
  });
  it('closed over a weekend names the day', () => {
    expect(sessionLabel({ state: 'closed', exchange_date: '2026-10-03', next_transition_at: '2026-10-05T03:30:00Z' }, at('2026-10-03T06:00:00Z'))).toBe('Closed · opens Mon 09:00 IST');
  });
  it('halted resumes; holiday opens', () => {
    expect(sessionLabel({ state: 'halted', exchange_date: '2026-10-05', next_transition_at: '2026-10-05T06:15:00Z' }, at('2026-10-05T05:40:00Z'))).toBe('Halted · resumes 11:45 IST');
    expect(sessionLabel({ state: 'holiday', exchange_date: '2026-10-02', next_transition_at: null }, at('2026-10-02T06:00:00Z'))).toBe('Holiday');
  });
});

describe('age', () => {
  it('compact and IST-dated after a day', () => {
    const now = at('2026-10-05T06:00:00Z');
    expect(age('2026-10-05T05:59:30Z', now)).toBe('now');
    expect(age('2026-10-05T05:15:00Z', now)).toBe('45m');
    expect(age('2026-10-05T01:00:00Z', now)).toBe('5h');
    expect(age('2026-10-03T20:00:00Z', now)).toBe('4 Oct'); // 01:30 IST on 4 Oct
  });
});

describe('header', () => {
  it('shows market state, and Sign in for visitors', () => {
    render(<Header session={{ state: 'open', exchange_date: '2026-10-05', next_transition_at: '2026-10-05T10:00:00Z' }} viewer={null} />);
    expect(screen.getByText(/^Open/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/sign-in');
  });
  it('shows the account and tier for a signed-in user', () => {
    render(<Header session={null} viewer={{ username: 'asha', tier: 'paid' }} />);
    expect(screen.getByRole('link', { name: /asha/ }).textContent).toContain('Paid');
  });
});

describe('theme toggle', () => {
  it('cycles system → light → dark → system and remembers the choice', () => {
    render(<ThemeToggle />);
    const b = screen.getByRole('button');
    fireEvent.click(b);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    fireEvent.click(b);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('sp-theme')).toBe('dark');
    fireEvent.click(b);
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    expect(localStorage.getItem('sp-theme')).toBeNull();
  });
});
