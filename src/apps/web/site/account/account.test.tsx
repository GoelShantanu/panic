// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Plans } from './Plans.tsx';
import { Settings } from './Settings.tsx';
import type { Me } from './Settings.tsx';
import { SignIn } from './SignIn.tsx';
import { Welcome } from './Welcome.tsx';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
const json = (status: number, body: unknown = null) => new Response(body === null ? null : JSON.stringify(body), { status });

beforeEach(() => (push.mockReset(), refresh.mockReset()));
afterEach(() => (cleanup(), vi.unstubAllGlobals()));

describe('sign in (PRD-007 US-007.1)', () => {
  it('uses password sign-in and password-manager autocomplete for returning users', async () => {
    const f = vi.fn().mockResolvedValue(json(200, { is_new: false })); vi.stubGlobal('fetch', f);
    render(<SignIn next="/watchlist" googleClientId={null} />);
    expect(screen.getByLabelText('Email').getAttribute('autocomplete')).toBe('username');
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('current-password');
    expect(screen.queryByRole('button', { name: 'Sign in with an email code' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.invalid' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'A browser test passphrase' } });
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Sign in' })));
    expect(f).toHaveBeenCalledWith('/v1/auth/password/sign-in', expect.objectContaining({ body: JSON.stringify({ email: 'ada@example.invalid', password: 'A browser test passphrase' }) }));
    expect(push).toHaveBeenCalledWith('/watchlist');
  });

  it('signup sends names and password, clears the password, then verifies before onboarding', async () => {
    const f = vi.fn().mockResolvedValueOnce(json(204)).mockResolvedValueOnce(json(200, { is_new: true })); vi.stubGlobal('fetch', f);
    render(<SignIn next="/" googleClientId={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Lovelace' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.invalid' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'A browser test passphrase' } });
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Send verification code' })));
    expect(JSON.parse(f.mock.calls[0]![1].body)).toMatchObject({ first_name: 'Ada', last_name: 'Lovelace' });
    expect(push).not.toHaveBeenCalled(); expect(screen.queryByLabelText('Password')).toBeNull();
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Verify email' })));
    expect(f).toHaveBeenLastCalledWith('/v1/auth/password/signup/verify', expect.objectContaining({ body: JSON.stringify({ email: 'ada@example.invalid', code: '123456' }) }));
    expect(push).toHaveBeenCalledWith('/welcome?next=%2F');
  });

  it('forgot password validates confirmation and returns to sign-in without logging in', async () => {
    const f = vi.fn().mockResolvedValue(json(204)); vi.stubGlobal('fetch', f);
    render(<SignIn next="/" googleClientId={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.invalid' } });
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Send password reset code' })));
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'A browser test passphrase' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'A different passphrase' } });
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Save new password' })));
    expect(screen.getByRole('alert').textContent).toContain('do not match'); expect(f).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'A browser test passphrase' } });
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Save new password' })));
    expect(f.mock.calls[1]![0]).toBe('/v1/auth/password/reset/complete');
    expect(screen.getByRole('status').textContent).toContain('Password saved'); expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it('Google callback supports mailbox confirmation before linking and signing in', async () => {
    let callback!: (r: { credential: string }) => void;
    window.google = { accounts: { id: { initialize: opts => { callback = opts.callback; }, renderButton: vi.fn() } } };
    const f = vi.fn().mockResolvedValueOnce(json(202, { email: 'ada@example.invalid' })).mockResolvedValueOnce(json(200, { is_new: false })); vi.stubGlobal('fetch', f);
    render(<SignIn next="/watchlist" googleClientId="test.apps.googleusercontent.com" />);
    fireEvent.load(document.querySelector('script[src="https://accounts.google.com/gsi/client"]')!);
    await act(async () => { await callback({ credential: 'signed-test-token' }); });
    expect(f.mock.calls[0]![0]).toBe('/v1/auth/google'); expect(push).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } });
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Verify email' })));
    expect(f.mock.calls[1]![0]).toBe('/v1/auth/google/verify'); expect(push).toHaveBeenCalledWith('/watchlist');
    delete window.google;
  });

  it('signup verification explains wrong and locked codes before the username step', async () => {
    const f = vi.fn().mockResolvedValueOnce(json(204)).mockResolvedValueOnce(json(400, { error: 'invalid_code' })).mockResolvedValueOnce(json(423, { error: 'code_locked' })).mockResolvedValueOnce(json(200, { session: 'x', is_new: true }));
    vi.stubGlobal('fetch', f);
    render(<SignIn next="/" googleClientId={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Lovelace' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'A browser test passphrase' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.invalid' } });
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Send verification code' })));
    expect(screen.getByText(/Check your inbox for a 6-digit code/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '12a3456' } });
    expect((screen.getByLabelText('Code') as HTMLInputElement).value).toBe('123456');
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Verify email' })));
    expect(screen.getByRole('alert').textContent).toContain('not right');
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Verify email' })));
    expect(screen.getByRole('alert').textContent).toContain('Too many wrong attempts');
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Verify email' })));
    expect(push).toHaveBeenCalledWith('/welcome?next=%2F');
    expect((screen.getByRole('button', { name: 'Continue with Google' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('welcome (US-007.1 AC-2, US-007.4 AC-2)', () => {
  it('nothing is pre-ticked; all required items gate the button; reserved names explained', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(422, { error: 'username_reserved' })).mockResolvedValueOnce(json(201, {})));
    render(<Welcome next="/" />);
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.every((b) => !b.checked)).toBe(true);
    const submit = screen.getByRole('button', { name: 'Create account' }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'sebi' } });
    fireEvent.click(boxes[0]!);
    fireEvent.click(boxes[1]!);
    expect(submit.disabled).toBe(true); // privacy consent still unticked
    fireEvent.click(boxes[2]!);
    expect(submit.disabled).toBe(false);
    await act(async () => void fireEvent.click(submit));
    expect(screen.getByRole('alert').textContent).toContain('reserved');
    await act(async () => void fireEvent.click(submit));
    expect(push).toHaveBeenCalledWith('/watchlist?welcome=1');
  });
});

const me: Me = {
  user_id: 'us_1', username: 'asha', email: 'asha@example.invalid', created_at: '2026-09-01T00:00:00Z', email_verified: true, tier: 'paid',
  trial: { used: true, ends_at: null }, subscription: { plan: 'monthly', status: 'active', renews_at: '2026-11-01T00:00:00Z', cancel_at_period_end: false },
  marketing_opt_in: false, sign_in_methods: ['password', 'google'], entitlements: {},
};
const billing = { subscription: { plan: 'monthly', status: 'active', cancel_at_period_end: false, renews_at: '2026-11-01T00:00:00Z', access_until: '2026-11-01T00:00:00Z', pending_plan: null, payment_retrying: false } };

describe('settings (US-007.3, US-007.8)', () => {
  it('cancelling takes one confirmation, like subscribing (C-007.4)', async () => {
    const f = vi.fn().mockResolvedValue(json(200, { subscription: {} }));
    vi.stubGlobal('fetch', f);
    render(<Settings me={me} billing={billing} invoices={[]} savedViews={{ views: [], disabled: false }} billingEnabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel subscription' }));
    expect(screen.getByText(/You keep paid features until/)).toBeTruthy();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel' })));
    expect(f).toHaveBeenCalledWith('/v1/billing/cancel', expect.objectContaining({ method: 'POST' }));
    expect(screen.getByText('Cancelled. You will not be charged again.')).toBeTruthy();
  });
  it('deletion sends the comments choice; default keeps comments as [deleted user]', async () => {
    const f = vi.fn().mockResolvedValue(json(202, { completes_by: '2026-11-02' }));
    vi.stubGlobal('fetch', f);
    render(<Settings me={me} billing={null} invoices={[]} savedViews={{ views: [], disabled: false }} billingEnabled={false} />);
    expect((screen.getByLabelText(/Keep them/) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText('Delete them'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' })));
    expect(f).toHaveBeenCalledWith('/v1/me/delete', expect.objectContaining({ body: '{"comments":"delete"}' }));
    expect(push).toHaveBeenCalledWith('/?deleted=1');
  });
  it('downgraded saved views are kept and shown as disabled (US-007.9 AC-2)', () => {
    render(<Settings me={{ ...me, tier: 'free', subscription: null }} billing={null} invoices={[]} savedViews={{ views: [{ id: '1', name: 'Results only', params: { view: 'latest', event_types: ['results'], filings_only: false } }], disabled: true }} billingEnabled={false} />);
    expect(screen.getByText(/kept, and work again/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Results only' })).toBeNull();
  });
});

describe('plans (US-007.7)', () => {
  it('visitors are sent to sign in; billing closed is explained; Razorpay opens with the subscription', async () => {
    const { unmount } = render(<Plans plans={[{ id: 'monthly', price_inr: 299 }, { id: 'yearly', price_inr: 2999 }]} signedIn={false} tier={null} trialUsed={false} subscribed={false} />);
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Subscribe monthly' })));
    expect(push).toHaveBeenCalledWith('/sign-in?next=/plans');
    unmount();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(503, { error: 'billing_unavailable' })).mockResolvedValueOnce(json(200, { subscription_id: 'sub_1', key_id: 'rzp_test', provider_checkout_url: 'https://rzp.example/x' })));
    const open = vi.fn();
    const ctor = vi.fn(function (this: any) {
      this.open = open;
      this.on = vi.fn();
    });
    (window as any).Razorpay = ctor;
    render(<Plans plans={[{ id: 'yearly', price_inr: 2999 }]} signedIn tier="free" trialUsed subscribed={false} />);
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Subscribe yearly' })));
    expect(screen.getByRole('status').textContent).toContain('not open yet');
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Subscribe yearly' })));
    expect((ctor.mock.calls as unknown as unknown[][])[0]![0]).toMatchObject({ key: 'rzp_test', subscription_id: 'sub_1', name: 'StockPanic' });
    expect(open).toHaveBeenCalled();
    delete (window as any).Razorpay;
  });
});
