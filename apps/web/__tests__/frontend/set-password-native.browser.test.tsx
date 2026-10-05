// @vitest-environment node
// Opt in with RUN_AUTH_NATIVE_BROWSER_TESTS=1; requires an installed Playwright
// browser (or PLAYWRIGHT_CHANNEL, e.g. msedge). No Next server or Auth credentials.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { chromium, expect as browserExpect, type Browser } from '@playwright/test';
import { renderToString } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { SetPasswordForm } from '@/components/auth/set-password-form';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/supabase/browser', () => ({
  getBrowserSupabase: () => { throw new Error('Auth must not be called by the native form test'); },
}));

it('renders inert native controls and POST semantics before effects/hydration', () => {
  const queryClient = new QueryClient();
  const html = renderToString(<QueryClientProvider client={queryClient}><SetPasswordForm /></QueryClientProvider>);
  expect(html).toMatch(/<form\b[^>]*method="post"/);
  expect(html).toMatch(/<fieldset\b[^>]*disabled=""/);
  expect(html.match(/autoComplete="new-password"/g)).toHaveLength(2);
  expect(html).toContain('JavaScript is required to set your password safely.');
  queryClient.clear();
});

describe.runIf(process.env.RUN_AUTH_NATIVE_BROWSER_TESTS === '1')('password setup native browser safety', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL });
  });
  afterAll(async () => { await browser?.close(); });

  it.each([false, true])('fails safe with JavaScript enabled=%s but no hydration', async (javaScriptEnabled) => {
    const queryClient = new QueryClient();
    const html = renderToString(<QueryClientProvider client={queryClient}><SetPasswordForm /></QueryClientProvider>);
    queryClient.clear();
    const context = await browser.newContext({ javaScriptEnabled, serviceWorkers: 'block' });
    const page = await context.newPage();
    const origin = 'http://127.0.0.1:32199/auth/set-password';
    const synthetic = ['synthetic-native-password-123', 'synthetic-native-confirmation-456'];
    const unsafe = (text: string) => synthetic.some((value) => text.includes(value)) || /[?&](password|confirmation)=/i.test(text);
    const requests: { method: string; unsafe: boolean; bodyEmpty: boolean; local: boolean }[] = [];
    let unsafeConsole = false;
    page.on('console', (message) => { unsafeConsole ||= unsafe(message.text()); });
    // Every request is intercepted: no external or loopback server is contacted.
    await context.route('**/*', async (route) => {
      const request = route.request();
      requests.push({ method: request.method(), unsafe: unsafe(request.url()) || unsafe(request.postData() ?? ''),
        bodyEmpty: !request.postData(), local: request.url() === origin });
      await route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><body>${html}</body></html>` });
    });
    try {
      await page.goto(origin);
      await browserExpect(page.locator('form')).toHaveAttribute('method', 'post');
      await browserExpect(page.getByLabel('New password')).toBeDisabled();
      await browserExpect(page.getByLabel('Confirm password')).toBeDisabled();
      await browserExpect(page.getByRole('button', { name: 'Set password' })).toBeDisabled();
      // Model values present through autofill: disabled controls must never serialize.
      await page.locator('input[type="password"]').evaluateAll((inputs, values) => {
        inputs.forEach((input, index) => { (input as HTMLInputElement).value = values[index]; });
      }, synthetic);
      await page.getByRole('button', { name: 'Set password' }).click({ force: true });
      await page.keyboard.press('Enter');
      expect(page.url() === origin).toBe(true);
      expect(requests).toHaveLength(1);
      // Bypass event handlers entirely: even forced native submission is POST
      // with no successful credential controls, not a credential-bearing request.
      await Promise.all([
        page.waitForResponse((response) => response.request().method() === 'POST'),
        page.locator('form').evaluate((form) => (form as HTMLFormElement).submit()),
      ]);
      expect(requests).toEqual([
        { method: 'GET', unsafe: false, bodyEmpty: true, local: true },
        { method: 'POST', unsafe: false, bodyEmpty: true, local: true },
      ]);
      expect(unsafe(page.url())).toBe(false);
      expect(unsafeConsole).toBe(false);
    } finally {
      await context.close();
    }
  });
});
