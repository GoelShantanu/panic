/// <reference lib="dom" />
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

const password = 'A unique browser testing passphrase!';
async function browserRead(page: Page, path: string) {
  return page.evaluate(async path => {
    const response = await fetch(path, { credentials: 'same-origin' });
    return { status: response.status, body: await response.json() };
  }, path);
}
async function signIn(page: Page, name = 'reader') {
  await page.goto('/sign-in?next=/watchlist');
  await page.getByLabel('Email', { exact: true }).fill(`${name}@example.invalid`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3102/watchlist');
  await expect(page.getByRole('heading', { name: 'Watchlist', exact: true })).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function accessible(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(scan.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
}

test('password sign-in, mobile watchlist mutations, CSV and persisted alert settings', async ({ page }, info) => {
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Add companies' })).toBeVisible();
  await page.getByLabel('Find a company to add').fill('Asterion');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByLabel('Select ASTERION')).toBeVisible();
  await page.getByLabel('Find a company to add').fill('');
  await page.getByLabel('Import from a broker CSV').setInputFiles({ name: 'fixture.csv', mimeType: 'text/csv', buffer: Buffer.from('Symbol,Qty\nKESTREL,10\n') });
  await page.getByRole('button', { name: 'Add 1 company', exact: true }).click();
  await expect(page.getByLabel('Select KESTREL')).toBeVisible();
  await noOverflow(page);
  if (info.project.name === 'mobile') {
    const bounds = await page.getByRole('button', { name: 'Remove ASTERION' }).boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await page.setViewportSize({ width: 360, height: 800 });
    await noOverflow(page);
  }
  await page.screenshot({ path: info.outputPath('watchlist.png'), fullPage: true });
  await accessible(page);
  await page.getByLabel('Select all', { exact: true }).check();
  await page.getByRole('button', { name: 'Remove selected (2)' }).click();
  await expect(page.getByRole('heading', { name: 'Your watchlist is empty' })).toBeVisible();
  await page.goto('/settings/alerts');
  const email = page.getByLabel('Email', { exact: true });
  const wasChecked = await email.isChecked();
  await email.setChecked(!wasChecked);
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  await page.reload();
  expect(await email.isChecked()).toBe(!wasChecked);
  await noOverflow(page);
  await accessible(page);
  await page.screenshot({ path: info.outputPath('alerts.png'), fullPage: true });
});

test('reader navigation and browser Back preserve the stream', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.locator('.row').first().locator('.opinion-badge.comment')).toHaveText('99');
  const first = page.locator('.row-headline').first();
  const text = await first.innerText();
  await first.click();
  await expect(page).toHaveURL(/\/s\/st_/);
  await expect(page.locator('.story-headline')).toContainText(text);
  if (info.project.name === 'desktop') await expect(page.locator('.rows')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL('http://127.0.0.1:3102/');
  await expect(page.locator('.row-headline').first()).toContainText(text);
});

test('SSE disconnect shows status and reconnect resumes after the last event', async ({ page, request }) => {
  await request.post('/__test/live?down=0');
  await page.goto('/');
  await expect(page.locator('.row').first().locator('.opinion-badge.comment')).toHaveText('99');
  await expect.poll(async () => (await (await request.get('/__test/live')).json()).connections.length).toBeGreaterThan(0);
  const first = await page.locator('.row-headline').first().innerText();
  await request.post('/__test/live?down=1');
  await expect(page.getByRole('status').filter({ hasText: 'Reconnecting…' })).toBeVisible({ timeout: 15_000 });
  await request.post('/__test/live?down=0');
  await expect(page.getByRole('status').filter({ hasText: 'Reconnecting…' })).toBeHidden({ timeout: 15_000 });
  await expect.poll(async () => (await (await request.get('/__test/live')).json()).connections.at(-1)).toContain('last_event_id=browser-1');
  await expect(page.locator('.row-headline').first()).toContainText(first);
});

test('fake checkout waits for a signed payment webhook before granting paid access', async ({ page }, info) => {
  await signIn(page, `payer${info.project.name}`);
  await page.addInitScript(() => {
    (window as unknown as { Razorpay: unknown }).Razorpay = class {
      options: Record<string, unknown>;
      constructor(options: Record<string, unknown>) { this.options = options; }
      on() {}
      open() { (window as unknown as { fixtureCheckout: Record<string, unknown> }).fixtureCheckout = this.options; (this.options.handler as () => void)(); }
    };
  });
  await page.goto('/plans');
  await page.getByRole('button', { name: 'Subscribe monthly' }).click();
  await expect(page.locator('.plans').getByRole('status')).toContainText('Confirming your payment');
  expect((await browserRead(page, '/v1/billing')).body.tier).toBe('free');
  const id = await page.evaluate(() => (window as unknown as { fixtureCheckout: { subscription_id: string } }).fixtureCheckout.subscription_id);
  expect((await page.request.post(`/__test/payment?id=${encodeURIComponent(id)}`)).ok()).toBe(true);
  await expect(page.locator('.plans').getByRole('status')).toContainText('You are on the paid plan');
  expect((await browserRead(page, '/v1/billing')).body.tier).toBe('paid');
});

test('password recovery resets credentials without logging in', async ({ page, request }, info) => {
  const email = `recovery${info.project.name}@example.invalid`;
  const replacement = 'A replacement browser testing passphrase!';
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send password reset code' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  const { code } = await (await request.get(`/__test/mail?email=${encodeURIComponent(email)}`)).json();
  await page.getByLabel('Code', { exact: true }).fill(code);
  await page.getByLabel('New password', { exact: true }).fill(replacement);
  await page.getByLabel('Confirm new password', { exact: true }).fill(replacement);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  expect((await browserRead(page, '/v1/me')).status).toBe(401);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(replacement);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3102/');
});

test('render reads are deduplicated without sharing identities across requests', async ({ page, browser, request }, info) => {
  await signIn(page);
  await request.delete('/__test/metrics');
  const start = Date.now();
  await page.goto('/watchlist');
  await expect(page.getByRole('heading', { name: 'Watchlist', exact: true })).toBeVisible();
  await info.attach('render-time', { body: JSON.stringify({ route: '/watchlist', navigationToHeadingMs: Date.now() - start }), contentType: 'application/json' });
  const metrics = await (await request.get('/__test/metrics')).json();
  expect(metrics['/v1/me']).toBe(1);
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const started = Date.now();
    await page.goto('/watchlist');
    await expect(page.getByRole('heading', { name: 'Watchlist', exact: true })).toBeVisible();
    samples.push(await page.evaluate(elapsed => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return { navigationToHeadingMs: elapsed, ttfbMs: navigation.responseStart, domContentLoadedMs: navigation.domContentLoadedEventEnd };
    }, Date.now() - started));
  }
  await info.attach('page-performance', { body: JSON.stringify({ route: '/watchlist', samples }), contentType: 'application/json' });
  const other = await browser.newPage();
  try {
    await signIn(other, 'other');
    expect((await browserRead(page, '/v1/me')).body.username).toBe('reader');
    expect((await browserRead(other, '/v1/me')).body.username).toBe('other');
  } finally { await other.close(); }
});

test('signup requires mailbox verification and explicit onboarding before activation', async ({ page, request }, info) => {
  const name = `new_${info.project.name}_${Date.now().toString().slice(-6)}`;
  const email = `${name}@example.invalid`;
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('First name').fill('Fictional');
  await page.getByLabel('Last name').fill('Reader');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Send verification code' }).click();
  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
  expect((await browserRead(page, '/v1/me')).status).toBe(401);
  const { code } = await (await request.get(`/__test/mail?email=${encodeURIComponent(email)}`)).json();
  await page.getByLabel('Code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose your username' })).toBeVisible();
  expect((await browserRead(page, '/v1/me')).status).toBe(401);
  await page.getByLabel('Username', { exact: true }).fill(name);
  // Consents belong to this disposable fictional fixture account, never a real user.
  await page.getByLabel('I am 18 or older.').check();
  await page.getByLabel('I accept the Terms of Use.').check();
  await page.getByLabel('I agree to StockPanic processing my data', { exact: false }).check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/watchlist\?welcome=1$/);
  expect((await browserRead(page, '/v1/me')).body).toMatchObject({ username: name, first_name: 'Fictional', email_verified: true });
});

test('reading density persists, and sign-in remains accessible in both themes', async ({ page }, info) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('button', { name: 'Reading density: compact' })).toBeVisible();
  await page.getByRole('button', { name: 'Reading density: compact' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Reading density: comfortable' })).toHaveAttribute('aria-pressed', 'true');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { localStorage.setItem('sp-theme', theme); document.documentElement.dataset.theme = theme; }, theme);
    await noOverflow(page);
    await accessible(page);
    await page.screenshot({ path: info.outputPath(`sign-in-${theme}.png`), fullPage: true });
  }
});
