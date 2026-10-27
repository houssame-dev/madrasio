import { chromium } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { fixtureCookie, fixtureOrigin, fixtureUser } from './password-auth-fixture.mjs';

const output = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../test-results/set-password-redesign',
);
mkdirSync(resolve(output, 'screenshots'), { recursive: true });
const browser = await chromium.launch({ headless: true });
const backgrounds = {
  light: 'rgb(255, 255, 255)',
  mist: 'rgb(229, 229, 229)',
  midnight: 'rgb(20, 33, 61)',
  dark: 'rgb(0, 0, 0)',
};
const results = { matrix: [], states: [], responsive: [], gate: [], failures: [] };
const check = (condition, label) => {
  if (!condition) results.failures.push(label);
};
const contrast = (a, b) => {
  const luminance = (text) => {
    const c = text
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number)
      .map((value) => {
        const v = value / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
    return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  };
  return (
    (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)
  );
};
try {
  for (const locale of ['en', 'fr', 'ar']) {
    for (const device of ['desktop', 'mobile']) {
      for (const authorized of [true, false]) {
        const context = await browser.newContext({
          viewport:
            device === 'desktop' ? { width: 1200, height: 1000 } : { width: 390, height: 844 },
          serviceWorkers: 'block',
        });
        await context.addCookies([
          { name: 'MADRASIO_LOCALE', value: locale, url: 'http://127.0.0.1:3000' },
          fixtureCookie(authorized ? 'valid' : 'expired'),
        ]);
        let mutations = 0,
          mode = 'error',
          release,
          blocked = 0;
        await context.route('**/*', async (route) => {
          const request = route.request(),
            url = new URL(request.url());
          if (!['http://127.0.0.1:3000', fixtureOrigin].includes(url.origin)) {
            blocked++;
            await route.abort();
            return;
          }
          if (url.pathname === '/api/v1/auth/recovery') {
            await route.fulfill({ json: { data: { state: 'REQUESTED' } } });
            return;
          }
          if (
            url.origin === fixtureOrigin &&
            request.method() !== 'GET' &&
            request.method() !== 'OPTIONS'
          ) {
            assert.ok(
              url.pathname === '/auth/v1/user' && request.method() === 'PUT',
              'Only the existing local password update is permitted',
            );
            mutations++;
            const body = request.postDataJSON();
            assert.ok(
              Object.keys(body).every((key) =>
                ['password', 'code_challenge', 'code_challenge_method'].includes(key),
              ) &&
                typeof body.password === 'string' &&
                !body.code_challenge &&
                !body.code_challenge_method,
              'Canonical password-only mutation',
            );
            if (mode === 'loading')
              await new Promise((done) => {
                release = done;
              });
            await route.fulfill({
              status: mode === 'success' ? 200 : 500,
              json:
                mode === 'success' ? fixtureUser : { message: 'private-fixture-provider-detail' },
            });
            return;
          }
          // Keep the successful destination local without fetching real tenant data.
          if (url.pathname === '/dashboard' && request.isNavigationRequest()) {
            await route.fulfill({
              contentType: 'text/html',
              body: '<!doctype html><html><body>Local simulated destination</body></html>',
            });
            return;
          }
          await route.continue();
        });
        const page = await context.newPage();
        const errors = [];
        // Record booleans only: no console/request payloads or entered values.
        let unsafeConsole = false;
        let synthetic;
        page.on('console', (message) => {
          if (synthetic && message.text().includes(synthetic)) unsafeConsole = true;
        });
        page.on('pageerror', () => errors.push('browser-page-error'));
        const ready = async () => {
          await page.waitForFunction(
            () =>
              document.querySelectorAll('select').length === 2 &&
              !document.querySelectorAll('select')[1].disabled,
          );
          await page.evaluate(() => document.fonts.ready);
          await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
        };
        const capture = async (suffix) => {
          const hasValues = await page
            .locator('input')
            .evaluateAll((inputs) => inputs.some((input) => input.value.length > 0));
          await page.screenshot({
            path: resolve(
              output,
              'screenshots',
              `${locale}-${device}-${authorized ? 'authorized' : 'invalid'}-${suffix}.png`,
            ),
            fullPage: true,
            ...(hasValues
              ? {
                  mask: [page.locator('#new-password'), page.locator('#confirm-password')],
                  maskColor: '#526786',
                }
              : {}),
          });
        };
        await page.goto('http://127.0.0.1:3000/auth/set-password', { waitUntil: 'networkidle' });
        await ready();
        assert.equal(
          await page.locator('input').count(),
          authorized ? 2 : 0,
          'Existing verified server gate must control password form visibility',
        );
        for (const theme of Object.keys(backgrounds)) {
          await page.locator('select').last().selectOption(theme);
          await page.reload({ waitUntil: 'networkidle' });
          await ready();
          assert.equal(await page.locator('select').last().inputValue(), theme);
          assert.equal(await page.locator('input').count(), authorized ? 2 : 0);
          await capture(theme);
          const metrics = await page.evaluate(() => ({
            background: getComputedStyle(document.querySelector('.auth-page')).backgroundColor,
            direction: document.documentElement.dir,
            locale: document.documentElement.lang,
            overflow: document.documentElement.scrollWidth > innerWidth,
          }));
          assert.equal(metrics.background, backgrounds[theme]);
          assert.equal(metrics.locale, locale);
          assert.equal(metrics.direction, locale === 'ar' ? 'rtl' : 'ltr');
          check(!metrics.overflow, `${locale}/${device}/${authorized}/${theme}: overflow`);
          const colors = await page.evaluate(() =>
            [
              ...document.querySelectorAll(
                '.auth-mobile-intro,.auth-desktop-intro,.auth-fields label,#confirm-password-hint,.auth-privacy p,.recovery-back a,.auth-input,.auth-select,.password-invalid [role="status"],.password-recover-link,.auth-fields .auth-submit',
              ),
            ]
              .filter((e) => e.getBoundingClientRect().width > 0)
              .map((element) => {
                let parent = element,
                  background;
                while (parent) {
                  background = getComputedStyle(parent).backgroundColor;
                  if (background !== 'rgba(0, 0, 0, 0)') break;
                  parent = parent.parentElement;
                }
                const s = getComputedStyle(element);
                return {
                  selector: element.id || element.className,
                  color: s.color,
                  background,
                  border: s.borderTopColor,
                  input: element.matches('.auth-input,.auth-select'),
                  placeholder: element.matches('.auth-input')
                    ? getComputedStyle(element, '::placeholder').color
                    : undefined,
                };
              }),
          );
          for (const color of colors) {
            color.ratio = contrast(color.color, color.background);
            check(
              color.ratio >= 4.5,
              `${locale}/${device}/${authorized}/${theme}: text ${color.selector}`,
            );
            if (color.input)
              check(
                contrast(color.border, color.background) >= 3,
                `${locale}/${device}/${theme}: border`,
              );
            if (color.placeholder)
              check(
                contrast(color.placeholder, color.background) >= 4.5,
                `${locale}/${device}/${theme}: placeholder`,
              );
          }
          results.matrix.push({ locale, device, authorized, theme, ...metrics, colors });
        }
        await page
          .locator('select')
          .last()
          .selectOption(device === 'desktop' ? 'light' : 'midnight');
        await page.reload({ waitUntil: 'networkidle' });
        await ready();
        await page.locator('select').first().focus();
        const targets = authorized
          ? [
              page.locator('select').last(),
              page.locator('#new-password'),
              page.locator('.auth-reveal').first(),
              page.locator('#confirm-password'),
              page.locator('.auth-reveal').last(),
              page.locator('.auth-fields .auth-submit'),
              page.locator('.recovery-back a'),
            ]
          : [
              page.locator('select').last(),
              page.locator('.password-recover-link'),
              page.locator('.recovery-back a'),
            ];
        for (const target of targets) {
          await page.keyboard.press('Tab');
          check(
            await target.evaluate((e) => e === document.activeElement),
            `${locale}/${device}/${authorized}: keyboard order`,
          );
          check(
            await target.evaluate(
              (e) =>
                getComputedStyle(e).boxShadow !== 'none' ||
                getComputedStyle(e).outlineStyle !== 'none',
            ),
            `${locale}/${device}/${authorized}: focus visibility`,
          );
        }
        if (authorized) {
          await page.locator('.auth-fields .auth-submit').click();
          await page.locator('#new-password[aria-invalid="true"]').waitFor();
          await capture('validation');
          assert.equal(mutations, 0);
          synthetic = randomBytes(24).toString('base64url');
          await page.locator('#new-password').fill(synthetic);
          await page.locator('#confirm-password').fill(`${synthetic}x`);
          await page.locator('.auth-fields .auth-submit').click();
          await page.locator('#confirm-password[aria-invalid="true"]').waitFor();
          await capture('mismatch');
          assert.equal(mutations, 0);
          for (const index of [0, 1]) {
            const input = page.locator('input').nth(index),
              toggle = page.locator('.auth-reveal').nth(index);
            await toggle.click();
            assert.equal(await input.getAttribute('type'), 'text');
            assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
            await toggle.click();
            assert.equal(await input.getAttribute('type'), 'password');
          }
          await page.locator('#confirm-password').fill(synthetic);
          mode = 'loading';
          await page.locator('.auth-fields .auth-submit').click();
          await page.locator('.auth-fields .auth-submit:disabled').waitFor();
          await capture('loading');
          mode = 'error';
          release();
          await page.locator('.auth-card [role="alert"]').waitFor();
          assert.ok(
            !(await page
              .locator('.auth-card [role="alert"]')
              .textContent()
              .then((t) => t.includes('private-fixture-provider-detail'))),
          );
          await page.waitForFunction(() => document.activeElement?.id === 'new-password');
          await capture('safe-failure');
          const noPersistence = await page.evaluate(
            (value) =>
              !JSON.stringify(localStorage).includes(value) &&
              !JSON.stringify(sessionStorage).includes(value),
            synthetic,
          );
          assert.ok(
            noPersistence && !unsafeConsole,
            'Password must not enter storage or console artifacts',
          );
          mode = 'success';
          await page.locator('.auth-fields .auth-submit').click();
          await page.waitForURL('**/dashboard');
          assert.equal(mutations, 2);
          results.states.push({
            locale,
            device,
            validation: true,
            mismatch: true,
            visibility: true,
            pending: true,
            safeFailure: true,
            successNavigation: true,
            noPasswordPersistence: true,
            interceptedMutations: mutations,
          });
          await page.goto('http://127.0.0.1:3000/auth/set-password', { waitUntil: 'networkidle' });
          await ready();
        } else {
          assert.equal(mutations, 0);
          assert.equal(
            await page.locator('.password-recover-link').getAttribute('href'),
            '/auth/recover',
          );
        }
        for (const width of [320, 700, 701, 768, 1024]) {
          await page.setViewportSize({ width, height: 1000 });
          const clipped = await page.evaluate(() =>
            [...document.querySelectorAll('.auth-welcome h1,.auth-card,.auth-benefits p')].some(
              (e) => e.getBoundingClientRect().width && e.scrollWidth > e.clientWidth + 1,
            ),
          );
          check(!clipped, `${locale}/${device}/${authorized}/${width}: clipped content`);
          results.responsive.push({ locale, device, authorized, width, clipped });
          if (width === 701 || width === 320) await capture(width === 320 ? '320' : 'compact-701');
        }
        if (locale === 'en' && device === 'desktop' && authorized) {
          await page.locator('select').first().selectOption('fr');
          await page.waitForFunction(() => document.documentElement.lang === 'fr');
          await page.waitForLoadState('networkidle');
          await ready();
          await page.locator('select').first().selectOption('ar');
          await page.waitForFunction(
            () => document.documentElement.lang === 'ar' && document.documentElement.dir === 'rtl',
          );
        }
        check(
          blocked === 0 && errors.length === 0,
          `${locale}/${device}/${authorized}: external request or browser error`,
        );
        await context.close();
      }
    }
  }
  for (const state of ['absent', 'expired', 'callback-error']) {
    const context = await browser.newContext();
    if (state !== 'absent')
      await context.addCookies([fixtureCookie(state === 'callback-error' ? 'valid' : 'expired')]);
    const page = await context.newPage();
    await page.goto(
      `http://127.0.0.1:3000/auth/set-password${state === 'callback-error' ? '?error=invalid-recovery' : ''}`,
      { waitUntil: 'networkidle' },
    );
    assert.equal(await page.locator('input').count(), 0);
    results.gate.push({ state, formAbsent: true });
    await context.close();
  }
  results.preservedViews = [];
  for (const [route, locale, theme, width, height] of [
    ['login', 'en', 'light', 1200, 800], ['login', 'ar', 'midnight', 390, 844],
    ['auth/recover', 'en', 'light', 1200, 900], ['auth/recover', 'ar', 'midnight', 390, 844],
  ]) {
    const context = await browser.newContext({ viewport: { width, height } });
    await context.addCookies([{ name: 'MADRASIO_LOCALE', value: locale, url: 'http://127.0.0.1:3000' }]);
    await context.addInitScript(value => localStorage.setItem('madrasio-theme', value), theme);
    await context.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:3000' ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:3000/${route}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !document.querySelectorAll('select')[1].disabled);
    await page.evaluate(() => document.fonts.ready);
    const name = `${route === 'login' ? 'login' : 'recover'}-${locale}-${width > 700 ? 'desktop' : 'mobile'}-${theme}`;
    await page.screenshot({ path: resolve(output, 'screenshots', `${name}.png`), fullPage: true });
    results.preservedViews.push({ route, locale, theme, width, height });
    await context.close();
  }
  const counts = await fetch(`${fixtureOrigin}/__fixture/stats`).then((r) => r.json());
  assert.equal(counts.mutationsBlocked, 0, 'Browser must intercept every Auth mutation');
  results.fixture = counts;
  writeFileSync(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
  assert.deepEqual(results.failures, []);
  console.info(
    `PASS: ${results.matrix.length} authorized/invalid captures, ${results.states.length} simulated state flows, ${results.responsive.length} responsive checks. All Auth traffic local; password-bearing state captures masked.`,
  );
} finally {
  await browser.close();
}
