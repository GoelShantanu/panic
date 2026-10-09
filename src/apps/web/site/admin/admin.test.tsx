// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { outcome } from './call.ts';
import { Console } from './Console.tsx';
import type { ConsoleData, Grievance } from './Console.tsx';
import { MfaVerify } from './Mfa.tsx';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }), usePathname: () => '/admin' }));

const json = (status: number, body: unknown = null) => new Response(body === null ? null : JSON.stringify(body), { status });
afterEach(() => (cleanup(), vi.unstubAllGlobals(), refresh.mockReset()));

// All people, companies and complaints are fictional.
const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const grievance = (over: Partial<Grievance> = {}): Grievance => ({
  reference: 'GR-2026-000001',
  source: 'report',
  urgent: false,
  status: 'open',
  received_at: hours(-2),
  ack_due_at: hours(22),
  resolve_due_at: hours(358),
  acknowledged_at: null,
  details: 'defamation: names a person falsely',
  complainant_email: null,
  comment_id: 'cm_01M40ZZZZZZZZZZZZZZZZZZZZ1',
  reports: 2,
  report_reasons: ['defamation'],
  comment_state: 'visible',
  comment_body: 'A fictional claim about a person.',
  comment_story_id: 'st_01M40ZZZZZZZZZZZZZZZZZZZZ1',
  comment_author_id: 'us_01M40ZZZZZZZZZZZZZZZZZZZZ1',
  comment_author: 'loud_one',
  ack_overdue: false,
  resolve_overdue: false,
  ...over,
});
const data = (over: Partial<ConsoleData> = {}): ConsoleData => ({
  grievances: [grievance()],
  corrections: [],

  abuse: { vote_bursts: [], shared_ips: [], concentrated_voters: [], bullish_view_sme_share: { total: 0, sme: 0 } },
  settings: { comments_posting_enabled: true, comments_visible: true, directional_voting_enabled: true, article_tags_enabled: true },
  ...over,
});

const fill = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

describe('operator console (PRD-006 §5, PRD-002 US-002.11, PRD-004 US-004.4 AC-5)', () => {
  it('a grievance shows deadlines, the comment as posted and its author; overdue items are flagged', () => {
    render(<Console initial={data({ grievances: [grievance(), grievance({ reference: 'GR-2026-000002', source: 'court_order', resolve_due_at: hours(-3), resolve_overdue: true, comment_id: null, comment_author_id: null })] })} />);
    expect(screen.getByText('A fictional claim about a person.')).toBeTruthy();
    expect(screen.getAllByText(/2[12] h left/).length).toBeGreaterThan(0);
    expect(screen.getByText(/3 h overdue/)).toBeTruthy();
    expect(screen.getByText('1 grievance past a legal deadline')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Grievances (2)' })).toBeTruthy();
  });

  it('take-down sends the category and the grievance; the outcome survives the card re-rendering', async () => {
    const f = vi.fn().mockResolvedValueOnce(json(200, { comment_id: 'cm_01M40ZZZZZZZZZZZZZZZZZZZZ1', state: 'removed' })).mockImplementation(async () => json(200, { grievances: [], queue: [] }));
    vi.stubGlobal('fetch', f);
    render(<Console initial={data()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Take down comment' }));
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Confirm' })));
    expect(f.mock.calls[0]).toMatchObject(['/v1/admin/comments/cm_01M40ZZZZZZZZZZZZZZZZZZZZ1/takedown', { method: 'POST', body: '{"reason":"defamation","grievance_id":"GR-2026-000001"}' }]);
    expect(screen.getByText('Last action — GR-2026-000001: Comment removed; the author was notified.')).toBeTruthy();
  });

  it('resolving needs a written decision', async () => {
    const f = vi.fn().mockImplementation(async () => json(200, { grievances: [], queue: [] }));
    vi.stubGlobal('fetch', f);
    render(<Console initial={data()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Confirm' })));
    expect(f).not.toHaveBeenCalledWith('/v1/admin/grievances/GR-2026-000001', expect.anything());
    expect(screen.getByText(/A decision is required/)).toBeTruthy();
  });

  it('every audited action needs a reason before it can be confirmed', async () => {
    const f = vi.fn().mockResolvedValue(json(200, { user_id: 'us_01M40ZZZZZZZZZZZZZZZZZZZZ1', suspended: true }));
    vi.stubGlobal('fetch', f);
    render(<Console initial={data()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Suspend commenting' }));
    const confirm = screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fill(screen.getByLabelText('Reason (recorded in the audit log)'), 'Upheld spam removals.');
    await act(async () => void fireEvent.click(confirm));
    expect(f.mock.calls[0]).toMatchObject(['/v1/admin/users/us_01M40ZZZZZZZZZZZZZZZZZZZZ1/comment-suspension', { body: '{"suspended":true,"reason":"Upheld spam removals."}' }]);
    expect(screen.getByText('Commenting suspended.')).toBeTruthy();
  });

  it('corrections: retag is prefilled from what readers suggested', async () => {
    const f = vi.fn().mockImplementation(async () => json(200, { story: null, audit_id: '9' }));
    vi.stubGlobal('fetch', f);
    render(
      <Console
        initial={data({
          grievances: [],
          corrections: [{ story_id: 'st_01M40ZZZZZZZZZZZZZZZZZZZZ2', headline: 'Asterion wins order', first_seen_at: hours(-5), kind: 'wrong_stock', reporters: 3, last_report_at: hours(-1), details: [{ isin: 'INE00KES1011' }], tags: ['INE00AST1016'] }],
        })}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Corrections (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retag' }));
    const form = screen.getByRole('button', { name: 'Confirm' }).closest('form')!;
    expect((within(form).getByLabelText(/^Add/) as HTMLInputElement).value).toBe('INE00KES1011');
    expect((within(form).getByLabelText(/^Remove/) as HTMLInputElement).value).toBe('INE00AST1016');
    fill(within(form).getByLabelText(/Reason/), 'Readers are right: Kestrel won the order.');
    await act(async () => void fireEvent.click(within(form).getByRole('button', { name: 'Confirm' })));
    expect(JSON.parse(f.mock.calls[0]![1].body)).toEqual({ add: ['INE00KES1011'], remove: ['INE00AST1016'], reason: 'Readers are right: Kestrel won the order.' });
  });

  it('does not expose the retired summaries tab', () => {
    render(<Console initial={data({ grievances: [] })} />);
    expect(screen.queryByRole('tab', { name: /Summaries/ })).toBeNull();
  });

  it('kill switch: turning directional voting off', async () => {
    const f = vi.fn().mockResolvedValue(json(200, { directional_voting_enabled: false }));
    vi.stubGlobal('fetch', f);
    render(<Console initial={data({ grievances: [] })} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Switches' }));
    const row = screen.getByText(/Directional voting/).closest('.switch-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Turn off' }));
    fill(within(row).getByLabelText(/Reason/), 'Coordinated pumping on SME stories.');
    await act(async () => void fireEvent.click(within(row).getByRole('button', { name: 'Confirm' })));
    expect(f.mock.calls[0]).toMatchObject(['/v1/admin/settings/directional-voting', { method: 'PUT', body: '{"enabled":false,"reason":"Coordinated pumping on SME stories."}' }]);
    expect(within(row).getByText('Off')).toBeTruthy();
  });

  it('an expired two-factor check is explained', () => {
    expect(outcome({ status: 403, body: { error: 'mfa_required' } }, 'ok')).toContain('two-factor check has expired');
    expect(outcome({ status: 400, body: { param: 'into_story_id', detail: 'story was merged' } }, 'ok')).toBe('Not accepted: into_story_id (story was merged).');
  });

  it('MFA: a wrong code is explained; a right one refreshes into the console', async () => {
    const f = vi.fn().mockResolvedValueOnce(json(400, { error: 'invalid_code' })).mockResolvedValueOnce(json(200, { mfa_verified_until: hours(12) }));
    vi.stubGlobal('fetch', f);
    render(<MfaVerify />);
    fill(screen.getByLabelText('Code'), '123456');
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Verify' })));
    expect(screen.getByRole('alert').textContent).toContain('not right');
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Verify' })));
    expect(f.mock.calls[1]).toMatchObject(['/v1/auth/mfa', { body: '{"code":"123456"}' }]);
    expect(refresh).toHaveBeenCalled();
  });
});
