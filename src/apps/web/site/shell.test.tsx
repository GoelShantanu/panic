// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { age, sessionLabel } from './format.ts';
import { Header } from './Header.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';

let path = '/';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => path }));

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
  it('shows Trial badge for a user on active trial', () => {
    render(<Header session={null} viewer={{ username: 'sgoel', tier: 'paid', isTrial: true }} />);
    expect(screen.getByRole('link', { name: /sgoel/ }).textContent).toContain('Trial');
  });
  it('marks the current section; a story page counts as News; Alerts only when signed in (D-057)', () => {
    path = '/s/st_00000000000000000000000001';
    const { unmount } = render(<Header session={null} viewer={null} />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav.querySelector('[aria-current="page"]')!.textContent).toBe('News');
    expect(screen.queryByRole('link', { name: 'Alerts' })).toBeNull();
    unmount();
    path = '/watchlist';
    render(<Header session={null} viewer={{ username: 'asha', tier: 'free' }} />);
    expect(screen.getByRole('link', { name: 'Watchlist' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Alerts' }).getAttribute('href')).toBe('/alerts');
    path = '/';
  });
  it('"/" opens company search and focuses it; Esc closes it', async () => {
    render(<Header session={null} viewer={null} />);
    const box = screen.getByRole('combobox', { name: 'Search companies' });
    await act(async () => {
      fireEvent.keyDown(window, { key: '/' });
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    });
    expect(document.querySelector('.search[data-open]')).toBeTruthy();
    expect(document.activeElement).toBe(box);
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(document.querySelector('.search[data-open]')).toBeNull();
  });
  it('splits the session label into state and detail without losing it for screen readers', () => {
    render(<Header session={{ state: 'closed', exchange_date: '2026-10-03', next_transition_at: '2026-10-05T03:30:00Z' }} viewer={null} />);
    expect(document.querySelector('.session')!.textContent).toMatch(/^Closed · opens \w{3} 09:00 IST$/);
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
