// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlertSettings } from '../alerts/AlertSettings.tsx';
import type { Settings } from '../alerts/AlertSettings.tsx';
import { History } from '../alerts/History.tsx';
import { Unsubscribe } from '../alerts/Unsubscribe.tsx';
import { Watchlist } from './Watchlist.tsx';
import type { Entry } from './Watchlist.tsx';

const json = (status: number, body: unknown = null) => new Response(body === null ? null : JSON.stringify(body), { status });
afterEach(() => (cleanup(), vi.unstubAllGlobals(), vi.useRealTimers()));

const entry = (over: Partial<Entry> = {}): Entry => ({ isin: 'INE00AST1016', display_symbol: 'ASTERION', name: 'Asterion Industries Limited', status: 'listed', successor_isin: null, latest_story_at: null, added_at: '2026-10-01T00:00:00Z', ...over });

describe('watchlist (PRD-003 §2)', () => {
  it('search and one-click add; the limit shows an upgrade prompt, nothing silently dropped', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const f = vi
      .fn()
      .mockResolvedValueOnce(json(200, { results: [{ isin: 'INE00KES1011', name: 'Kestrel Power Limited', display_symbol: 'KESTREL', segment: 'mainboard', status: 'listed' }] }))
      .mockResolvedValueOnce(json(402, { error: 'upgrade_required', feature: 'watchlist_limit', limit: 20, paid_value: 200 }));
    vi.stubGlobal('fetch', f);
    render(<Watchlist initial={[]} limit={20} welcome />);
    expect(screen.getByRole('link', { name: 'Skip for now' }).getAttribute('href')).toBe('/');
    fireEvent.change(screen.getByLabelText('Find a company to add'), { target: { value: 'kes' } });
    await act(async () => void vi.advanceTimersByTime(200));
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Add' })));
    expect(screen.getByRole('status').textContent).toContain('Paid holds 200');
  });

  it('bulk removal; merged companies suggest the successor without adding it', async () => {
    const f = vi.fn().mockResolvedValue(json(204)).mockResolvedValueOnce(json(204)).mockResolvedValueOnce(json(204)).mockResolvedValueOnce(json(200, { instruments: [] }));
    vi.stubGlobal('fetch', f);
    render(<Watchlist initial={[entry(), entry({ isin: 'INE00MER1011', display_symbol: 'MERIDIAN', status: 'merged', successor_isin: 'INE00NEW1010' })]} limit={20} welcome={false} />);
    expect(screen.getByRole('link', { name: 'See successor' }).getAttribute('href')).toBe('/c/INE00NEW1010');
    fireEvent.click(screen.getByLabelText('Select all'));
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Remove selected (2)' })));
    expect(f.mock.calls.slice(0, 2).map((c) => [c[0], c[1].method])).toEqual([
      ['/v1/watchlist/INE00AST1016', 'DELETE'],
      ['/v1/watchlist/INE00MER1011', 'DELETE'],
    ]);
    expect(screen.getByText(/Alerts for them have stopped/)).toBeTruthy();
  });

  it('CSV import: preview, deselect, confirm; only identifiers are sent back', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json(200, { matched: [{ isin: 'INE00AST1016', display_symbol: 'ASTERION', row: 2, already_on_watchlist: false }, { isin: 'INE00VEL1015', display_symbol: 'VELORA', row: 3, already_on_watchlist: false }], unmatched: [{ row: 4, raw: 'XYZ LTD' }], over_limit: 0 }))
      .mockResolvedValueOnce(json(200, { added: 1, skipped_existing: 0, skipped_over_limit: 0 }))
      .mockResolvedValueOnce(json(200, { instruments: [entry()] }));
    vi.stubGlobal('fetch', f);
    const { container } = render(<Watchlist initial={[]} limit={20} welcome={false} />);
    const file = new File(['ISIN,Qty\nINE00AST1016,10\n'], 'h.csv', { type: 'text/csv' });
    await act(async () => void fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } }));
    expect(screen.getByText('row 4: XYZ LTD')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('checkbox')[1]!); // deselect VELORA
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Add 1 company' })));
    expect(f.mock.calls[1]).toMatchObject(['/v1/watchlist/import/confirm', { body: '{"isins":["INE00AST1016"]}' }]);
    expect(screen.getByRole('status').textContent).toContain('Added 1');
  });

  it('keeps failed removals selected so they can be retried, without claiming success', async () => {
    const remaining = entry({ isin: 'INE00MER1011', display_symbol: 'MERIDIAN' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(204)).mockResolvedValueOnce(json(503)).mockResolvedValueOnce(json(200, { instruments: [remaining] })));
    render(<Watchlist initial={[entry(), remaining]} limit={20} welcome={false} />);
    fireEvent.click(screen.getByLabelText('Select all'));
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Remove selected (2)' })));
    expect(screen.queryByLabelText('Select ASTERION')).toBeNull();
    expect((screen.getByLabelText('Select MERIDIAN') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('1 company could not be removed');
    expect(screen.getByRole('button', { name: 'Remove selected (1)' })).toBeTruthy();
  });

  it('files over 1 MB are refused before upload', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const { container } = render(<Watchlist initial={[]} limit={20} welcome={false} />);
    const big = new File(['x'.repeat(1024 * 1024 + 1)], 'big.csv', { type: 'text/csv' });
    await act(async () => void fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [big] } }));
    expect(f).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('over 1 MB');
  });
});

const settings: Settings = {
  channels: { email: true, push: false },
  daily_budget: 5,
  budget_ceiling: 5,
  used_today: 2,
  quiet_hours: { enabled: true, start: '22:00', end: '08:00', tz: 'Asia/Kolkata' },
  digest: { time: '08:00', digest_only: false },
  event_types: { results: true, routine_compliance: false },
};

describe('alert settings (PRD-003 US-003.7)', () => {
  it('restores the saved value on failure and permits a successful retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(503)).mockResolvedValueOnce(json(200, { ...settings, channels: { email: false, push: false } })));
    render(<AlertSettings initial={settings} eventTypes={[]} vapidKey={null} tier="free" />);
    await act(async () => void fireEvent.click(screen.getByLabelText('Email')));
    expect((screen.getByLabelText('Email') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('could not be saved');
    await act(async () => void fireEvent.click(screen.getByLabelText('Email')));
    expect((screen.getByLabelText('Email') as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole('status').textContent).toContain('Saved.');
  });
  it('shows budget used today; push is unavailable without a key; event types save', async () => {
    const f = vi.fn().mockResolvedValue(json(200, { ...settings, event_types: { results: true, routine_compliance: true } }));
    vi.stubGlobal('fetch', f);
    render(<AlertSettings initial={settings} eventTypes={[{ code: 'results', label: 'Results' }, { code: 'routine_compliance', label: 'Routine compliance' }]} vapidKey={null} tier="free" />);
    expect(screen.getByText(/2 used today, resets at midnight IST/)).toBeTruthy();
    expect((screen.getByLabelText(/Browser notifications/) as HTMLInputElement).disabled).toBe(true);
    await act(async () => void fireEvent.click(screen.getByLabelText('Routine compliance')));
    expect(f.mock.calls[0]).toMatchObject(['/v1/alerts/settings', { method: 'PUT', body: '{"event_types":{"routine_compliance":true}}' }]);
    expect((screen.getByLabelText('Routine compliance') as HTMLInputElement).checked).toBe(true);
  });
  it('the budget can only be lowered within the plan ceiling', async () => {
    const f = vi.fn().mockResolvedValue(json(200, settings));
    vi.stubGlobal('fetch', f);
    render(<AlertSettings initial={settings} eventTypes={[]} vapidKey={null} tier="free" />);
    await act(async () => void fireEvent.change(screen.getByLabelText('Individual alerts per day'), { target: { value: '99' } }));
    expect(f.mock.calls[0]![1].body).toBe('{"daily_budget":5}');
  });
});

describe('alert history and unsubscribe', () => {
  it('marks corrections and digest delivery; loads more by cursor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, { alerts: [{ alert_id: 'al_2', kind: 'alert', story_id: 'st_2', headline: 'Older alert', channels: ['email'], sent_at: '2026-10-01T05:00:00Z', corrected: true, via: 'individual' }], next_cursor: null })));
    render(<History initial={[{ alert_id: 'al_1', kind: 'correction', story_id: 'st_1', headline: 'Board outcome', channels: ['email'], sent_at: null, corrected: false, via: 'digest' }]} cursor="c1" days={30} />);
    expect(screen.getByText('Correction')).toBeTruthy();
    expect(screen.getByText('In digest')).toBeTruthy();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Load more' })));
    expect(screen.getByText(/Corrected later/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });
  it('unsubscribe posts JSON and confirms', async () => {
    const f = vi.fn().mockResolvedValue(json(200, { status: 'unsubscribed' }));
    vi.stubGlobal('fetch', f);
    render(<Unsubscribe token="us_1.abc" />);
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Stop alert emails' })));
    expect(f.mock.calls[0]).toMatchObject(['/v1/alerts/unsubscribe?token=us_1.abc', { method: 'POST', headers: { 'content-type': 'application/json' } }]);
    expect(screen.getByText(/no more alert or digest emails/)).toBeTruthy();
  });
});
