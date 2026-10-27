import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const output = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../test-results/recovery-redesign',
);
const baseURL = 'http://127.0.0.1:3000';
const backgrounds = {
  light: 'rgb(255, 255, 255)',
  mist: 'rgb(229, 229, 229)',
  midnight: 'rgb(20, 33, 61)',
  dark: 'rgb(0, 0, 0)',
};
const luminance = (color) => {
  const channels = color
    .match(/[\d.]+/g)
    .slice(0, 3)
    .map(Number)
    .map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};
const contrast = (a, b) =>
  (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

mkdirSync(resolve(output, 'screenshots'), { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = { matrix: [], states: [], responsive: [], login: [], failures: [] };
const check = (condition, message) => {
  if (!condition) results.failures.push(message);
};
try {
  for (const locale of ['en', 'fr', 'ar']) {
    for (const device of ['desktop', 'mobile']) {
      const context = await browser.newContext({
        viewport: device === 'desktop' ? { width: 1200, height: 900 } : { width: 390, height: 844 },
        deviceScaleFactor: 1,
      });
      await context.addCookies([{ name: 'MADRASIO_LOCALE', value: locale, url: baseURL }]);
      let calls = 0;
      let responseMode = 'success';
      let release;
      await context.route('**/api/v1/auth/recovery', async (route) => {
        calls++;
        assert.equal(route.request().method(), 'POST');
        assert.deepEqual(route.request().postDataJSON(), { email: 'reset-visual@example.test' });
        if (responseMode === 'loading')
          await new Promise((done) => {
            release = done;
          });
        const status = responseMode === 'rate-limit' ? 429 : responseMode === 'error' ? 503 : 200;
        await route.fulfill({
          status,
          json:
            status === 200
              ? { data: { state: 'REQUESTED' } }
              : { error: { code: 'REQUEST_FAILED', message: 'private-provider-details' } },
        });
      });
      await context.route('**/auth/v1/**', (route) => route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const ready = async () => {
        await page.waitForFunction(
          () =>
            document.querySelectorAll('select').length === 2 &&
            !document.querySelectorAll('select')[1].disabled &&
            !document.querySelector('#recovery-email')?.disabled,
        );
        await page.evaluate(() => document.fonts.ready);
        await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
      };
      const capture = async (suffix) =>
        page.screenshot({
          path: resolve(output, 'screenshots', `${locale}-${device}-${suffix}.png`),
          fullPage: true,
        });
      const feedbackContrasts = [];
      const verifyFeedback = async (selector) => {
        const colors = await page.locator(selector).evaluate((element) => {
          const layers = [];
          for (let parent = element; parent; parent = parent.parentElement) layers.push(getComputedStyle(parent).backgroundColor);
          return { text: getComputedStyle(element).color, layers };
        });
        let rgb = [255, 255, 255];
        for (const layer of colors.layers.reverse()) {
          const channels = layer.match(/[\d.]+/g).map(Number);
          const alpha = channels[3] ?? 1;
          rgb = rgb.map((value, index) => value * (1 - alpha) + channels[index] * alpha);
        }
        const ratio = contrast(colors.text, `rgb(${rgb.join(',')})`);
        check(ratio >= 4.5, `${locale}/${device}/${selector}: feedback contrast ${ratio}`);
        feedbackContrasts.push({ selector, ratio });
      };
      await page.goto(`${baseURL}/auth/recover`, { waitUntil: 'networkidle' });
      await ready();
      for (const theme of Object.keys(backgrounds)) {
        await page.locator('select').last().selectOption(theme);
        await page.reload({ waitUntil: 'networkidle' });
        await ready();
        assert.equal(await page.locator('select').last().inputValue(), theme);
        await capture(theme);
        const metrics = await page.evaluate(() => {
          const selectors = [
            '.auth-mobile-intro',
            '.auth-desktop-intro',
            '.auth-card label',
            '.auth-privacy p',
            '.recovery-back a',
            '.auth-input',
            '.auth-select',
            '.auth-submit',
          ];
          return {
            theme: document.documentElement.dataset.theme,
            locale: document.documentElement.lang,
            direction: document.documentElement.dir,
            background: getComputedStyle(document.querySelector('.auth-page')).backgroundColor,
            overflow: document.documentElement.scrollWidth > innerWidth,
            colors: selectors.flatMap((selector) => {
              const element = document.querySelector(selector);
              if (!element.getBoundingClientRect().width) return [];
              let parent = element,
                background;
              while (parent) {
                background = getComputedStyle(parent).backgroundColor;
                if (background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent') break;
                parent = parent.parentElement;
              }
              const style = getComputedStyle(element);
              return [
                {
                  selector,
                  text: style.color,
                  border: style.borderTopColor,
                  background,
                  placeholder:
                    selector === '.auth-input'
                      ? getComputedStyle(element, '::placeholder').color
                      : undefined,
                },
              ];
            }),
          };
        });
        assert.equal(metrics.background, backgrounds[theme]);
        assert.equal(metrics.locale, locale);
        assert.equal(metrics.theme, theme);
        assert.equal(metrics.direction, locale === 'ar' ? 'rtl' : 'ltr');
        check(!metrics.overflow, `${locale}/${device}/${theme}: overflow`);
        for (const color of metrics.colors) {
          color.contrast = contrast(color.text, color.background);
          check(
            color.contrast >= 4.5,
            `${locale}/${device}/${theme} ${color.selector}: text ${color.contrast}`,
          );
          if (color.placeholder)
            check(
              contrast(color.placeholder, color.background) >= 4.5,
              `${locale}/${device}/${theme}: placeholder`,
            );
          if (['.auth-input', '.auth-select'].includes(color.selector))
            check(
              contrast(color.border, color.background) >= 3,
              `${locale}/${device}/${theme}: border`,
            );
        }
        check(
          metrics.colors.find((color) => color.selector === '.auth-submit').background ===
            'rgb(252, 163, 17)',
          'Approved #FCA311 action color',
        );
        results.matrix.push({ locale, device, theme, ...metrics });
      }
      await page.locator('select').last().selectOption(device === 'desktop' ? 'light' : 'midnight');
      await page.reload({ waitUntil: 'networkidle' });
      await ready();
      await page.locator('select').first().focus();
      for (const target of [
        page.locator('select').last(),
        page.locator('#recovery-email'),
        page.locator('.auth-submit'),
        page.locator('.recovery-back a'),
      ]) {
        await page.keyboard.press('Tab');
        check(
          await target.evaluate((element) => element === document.activeElement),
          `${locale}/${device}: keyboard order`,
        );
        check(
          await target.evaluate(
            (element) =>
              getComputedStyle(element).boxShadow !== 'none' ||
              getComputedStyle(element).outlineStyle !== 'none',
          ),
          `${locale}/${device}: visible focus`,
        );
      }
      await page.locator('.auth-submit').click();
      await page.locator('#recovery-email[aria-invalid="true"]').waitFor();
      assert.equal(calls, 0);
      assert.equal(
        await page.locator('#recovery-email').getAttribute('aria-describedby'),
        'recovery-email-error',
      );
      await capture('validation');
      await verifyFeedback('#recovery-email-error');
      await page.locator('#recovery-email').fill('not-an-email');
      await page.locator('.auth-submit').click();
      assert.equal(calls, 0);
      await page.locator('#recovery-email').fill('reset-visual@example.test');
      responseMode = 'loading';
      await page.locator('.auth-submit').click();
      await page.waitForFunction(() => document.querySelector('.auth-submit').disabled);
      await page.getByRole('status').waitFor();
      await capture('loading');
      await page.locator('#recovery-email').press('Enter');
      assert.equal(calls, 1, 'Pending submission must not send duplicate requests');
      release();
      await page.locator('.recovery-feedback [role="status"]').waitFor();
      assert.equal(await page.locator('.auth-submit').count(), 0);
      assert.ok(
        !(await page
          .getByRole('status')
          .textContent()
          .then((text) => text.includes('reset-visual@example.test'))),
      );
      await capture('success');
      await verifyFeedback('.recovery-feedback [role="status"]');
      for (const mode of ['error', 'rate-limit']) {
        responseMode = mode;
        await page.reload({ waitUntil: 'networkidle' });
        await ready();
        await page.locator('#recovery-email').fill('reset-visual@example.test');
        await page.locator('.auth-submit').click();
        await page.locator('.auth-card [role="alert"]').waitFor();
        assert.ok(
          !(await page
            .locator('.auth-card [role="alert"]')
            .textContent()
            .then((text) => text.includes('private-provider-details'))),
        );
        await page.waitForFunction(() => document.activeElement?.id === 'recovery-email');
        await capture(mode);
        await verifyFeedback('.auth-card [role="alert"]');
      }
      assert.equal(calls, 3, 'Only the three intercepted state requests are allowed');
      results.states.push({
        locale,
        device,
        interceptedCalls: calls,
        validation: true,
        loading: true,
        success: true,
        failure: true,
        rateLimit: true,
        keyboard: true,
        errors,
        feedbackContrasts,
      });
      check(!errors.length, `${locale}/${device}: browser errors ${errors.join(', ')}`);
      await page.reload({ waitUntil: 'networkidle' });
      await ready();
      for (const width of [320, 700, 701, 768, 1024]) {
        await page.setViewportSize({ width, height: 900 });
        const clipping = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          clipped: [...document.querySelectorAll('.auth-welcome h1, .auth-card, .auth-benefits p')]
            .filter(
              (element) =>
                element.getBoundingClientRect().width &&
                element.scrollWidth > element.clientWidth + 1,
            )
            .map((element) => element.tagName),
        }));
        check(
          !clipping.overflow && !clipping.clipped.length,
          `${locale}/${device}/${width}: responsive ${JSON.stringify(clipping)}`,
        );
        results.responsive.push({ locale, device, width, ...clipping });
        if (width === 701) await capture('compact-701');
      }
      if (locale === 'en' && device === 'desktop') {
        await page.locator('select').first().selectOption('fr');
        await page.waitForFunction(() => document.documentElement.lang === 'fr');
        await page.waitForLoadState('networkidle');
        await ready();
        await page.locator('select').first().selectOption('ar');
        await page.waitForFunction(
          () => document.documentElement.lang === 'ar' && document.documentElement.dir === 'rtl',
        );
      }
      await context.close();
    }
  }
  // Capture Login at its approved viewports and compare only the CSS extension
  // scope here; pixel-level baseline comparisons are recorded separately.
  for (const [locale, theme, width, height] of [
    ['en', 'light', 1200, 800],
    ['ar', 'midnight', 390, 844],
  ]) {
    const context = await browser.newContext({ viewport: { width, height } });
    await context.addCookies([{ name: 'MADRASIO_LOCALE', value: locale, url: baseURL }]);
    await context.addInitScript((value) => localStorage.setItem('madrasio-theme', value), theme);
    const page = await context.newPage();
    await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: 'nextjs-portal { display:none!important; }' });
    assert.equal(await page.locator('.auth-recover').count(), 0);
    const name = `${locale}-${width > 700 ? 'desktop' : 'mobile'}-${theme}`;
    await page.screenshot({
      path: resolve(output, 'screenshots', `login-${name}.png`),
      fullPage: true,
    });
    results.login.push({ locale, theme, recoveryVariantAbsent: true });
    await context.close();
  }
  assert.ok(
    readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../app/authentication.css'),
    ).includes(readFileSync(resolve(output, 'authentication-baseline.css'))),
    'Existing authentication CSS must remain byte-for-byte present',
  );
  writeFileSync(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
  assert.deepEqual(results.failures, []);
  console.info(
    `PASS: ${results.matrix.length} theme/locale/device captures; ${results.states.length} complete mocked state flows; ${results.responsive.length} responsive checks; Login preservation captures. No real recovery email was requested.`,
  );
} finally {
  await browser.close();
}
