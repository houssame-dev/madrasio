/* Local-only visual and interaction verification. Run against the production server. */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const backgrounds = { light: 'rgb(255, 255, 255)', mist: 'rgb(229, 229, 229)', midnight: 'rgb(20, 33, 61)', dark: 'rgb(0, 0, 0)' };

function contrast(a, b) {
  const luminance = color => {
    const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

(async () => {
  const output = resolve(scriptDirectory, '../../../test-results/authentication-validation/screenshots');
  mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const failures = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  try {
    for (const locale of ['en', 'fr', 'ar']) {
      for (const device of ['desktop', 'mobile']) {
        const context = await browser.newContext({ viewport: device === 'desktop' ? { width: 1200, height: 800 } : { width: 390, height: 844 }, deviceScaleFactor: 1 });
        await context.addCookies([{ name: 'MADRASIO_LOCALE', value: locale, url: 'http://127.0.0.1:3000' }]);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'networkidle' });
        await page.locator('select').last().waitFor({ state: 'visible' });
        await page.waitForFunction(() => !document.querySelectorAll('select')[1].disabled);
        await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
        await page.evaluate(() => document.fonts.ready);
        for (const theme of ['light', 'mist', 'midnight', 'dark']) {
          await page.locator('select').last().selectOption(theme);
          await page.waitForFunction(value => document.documentElement.dataset.theme === value, theme);
          await page.reload({ waitUntil: 'networkidle' });
          await page.waitForFunction(value => document.documentElement.dataset.theme === value && !document.querySelectorAll('select')[1].disabled, theme);
          assert.equal(await page.locator('select').last().inputValue(), theme, 'Theme preference must survive refresh');
          await page.evaluate(() => document.fonts.ready);
          await page.screenshot({ path: resolve(output, `${locale}-${device}-${theme}.png`), fullPage: true });
          const metrics = await page.evaluate(() => ({
            direction: document.documentElement.dir,
            locale: document.documentElement.lang,
            overflow: document.documentElement.scrollWidth > innerWidth,
            background: getComputedStyle(document.querySelector('.auth-page')).backgroundColor,
            theme: localStorage.getItem('madrasio-theme'),
          }));
          if (metrics.overflow || metrics.direction !== (locale === 'ar' ? 'rtl' : 'ltr') || metrics.locale !== locale) throw new Error(JSON.stringify(metrics));
          assert.equal(metrics.background, backgrounds[theme], 'Exact approved theme background');
          const colors = await page.evaluate(() => {
            const selectors = ['.auth-welcome h1', '.auth-card label', '.auth-privacy p', '.auth-recovery a', '.auth-input', '.auth-select'];
            return selectors.map(selector => {
              const element = document.querySelector(selector);
              let parent = element;
              let background;
              while (parent) {
                background = getComputedStyle(parent).backgroundColor;
                if (background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent') break;
                parent = parent.parentElement;
              }
              const style = getComputedStyle(element);
              return { selector, text: style.color, border: style.borderTopColor, background, placeholder: selector === '.auth-input' ? getComputedStyle(element, '::placeholder').color : undefined };
            });
          });
          metrics.contrast = colors.map(color => {
            const ratio = contrast(color.text, color.background);
            check(ratio >= 4.5, `${locale}/${device}/${theme} ${color.selector} text contrast ${ratio}`);
            if (color.placeholder) check(contrast(color.placeholder, color.background) >= 4.5, `${locale}/${device}/${theme}: placeholder contrast`);
            if (color.selector === '.auth-input' || color.selector === '.auth-select') check(contrast(color.border, color.background) >= 3, `${locale}/${device}/${theme}: control boundary contrast`);
            return { ...color, ratio };
          });
          results.push({ locale, device, theme, ...metrics, errors });
        }
        await page.locator('select').first().focus();
        for (const selector of ['select:last-of-type', '#login-email', '#login-password', '.auth-reveal', '.auth-recovery a', '.auth-submit']) {
          await page.keyboard.press('Tab');
          const target = selector === 'select:last-of-type' ? page.locator('select').last() : page.locator(selector);
          assert.ok(await target.evaluate(element => element === document.activeElement), `${locale}/${device}: keyboard order at ${selector}`);
          assert.ok(await target.evaluate(element => getComputedStyle(element).boxShadow !== 'none' || getComputedStyle(element).outlineStyle !== 'none'), `${locale}/${device}: visible focus at ${selector}`);
        }
        await page.locator('#login-password').fill('visual-test-only');
        await page.locator('.auth-reveal').click();
        if (await page.locator('#login-password').getAttribute('type') !== 'text') throw new Error('Password reveal failed');
        await page.locator('.auth-reveal').click();
        await page.locator('#login-password').fill('');
        await page.locator('.auth-submit').click();
        await page.locator('#login-email[aria-invalid="true"]').waitFor();
        await page.screenshot({ path: resolve(output, `${locale}-${device}-validation.png`), fullPage: true });
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
        if (await page.locator('.auth-recovery a').getAttribute('href') !== '/auth/recover') throw new Error('Recovery destination changed');
        if (locale === 'en' && device === 'desktop') {
          await page.locator('#login-email').focus();
          await page.keyboard.press('Tab');
          if (!await page.locator('#login-password').evaluate(element => element === document.activeElement)) throw new Error('Keyboard tab order failed');
          await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
          await page.screenshot({ path: resolve(output, 'en-desktop-keyboard-focus.png'), fullPage: true });
          let finishRequest;
          const pendingRequest = new Promise(done => { finishRequest = done; });
          await page.route('**/auth/v1/token**', async route => {
            await pendingRequest;
            await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }) });
          });
          await page.locator('#login-email').fill('visual-test@example.com');
          await page.locator('#login-password').fill('visual-test-only');
          await page.locator('.auth-submit').click();
          await page.locator('.auth-submit:disabled').waitFor();
          await page.screenshot({ path: resolve(output, 'en-desktop-loading.png'), fullPage: true });
          finishRequest();
          await page.getByRole('alert').waitFor();
          await page.screenshot({ path: resolve(output, 'en-desktop-credentials-error.png'), fullPage: true });
          await page.locator('select').first().selectOption('fr');
          await page.waitForFunction(() => document.documentElement.lang === 'fr');
          await page.waitForLoadState('networkidle');
          await page.waitForFunction(() => !document.querySelectorAll('select')[1].disabled);
          await page.locator('select').first().selectOption('ar');
          await page.waitForFunction(() => document.documentElement.lang === 'ar' && document.documentElement.dir === 'rtl');
        }
        if (errors.length) throw new Error(errors.join('\n'));
        await context.close();
      }
    }
    const responsive = [];
    for (const locale of ['en', 'fr', 'ar']) {
      const context = await browser.newContext();
      await context.addCookies([{ name: 'MADRASIO_LOCALE', value: locale, url: 'http://127.0.0.1:3000' }]);
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'networkidle' });
      for (const width of [320, 700, 701, 768, 1000, 1024]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of Object.keys(backgrounds)) {
          await page.locator('select').last().selectOption(theme);
          const bounds = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth > innerWidth,
            clipped: [...document.querySelectorAll('.auth-welcome h1, .auth-card, .auth-benefits p')].filter(element => {
              const rect = element.getBoundingClientRect();
              return rect.width > 0 && (element.scrollWidth > element.clientWidth + 1 || rect.left < -1 || rect.right > innerWidth + 1);
            }).map(element => element.className || element.tagName),
          }));
          check(!bounds.overflow && !bounds.clipped.length, `${locale}/${width}/${theme} responsive clipping: ${JSON.stringify(bounds)}`);
          responsive.push({ locale, width, theme, ...bounds });
        }
      }
      await context.close();
    }

    // Browser-only fixtures exercise the real compiled shell and CSS. They do
    // not prove authentication and never replace or alter server authorization.
    const shell = [];
    for (const locale of ['en', 'fr', 'ar']) {
      for (const device of ['desktop', 'mobile']) {
        for (const theme of Object.keys(backgrounds)) {
          const context = await browser.newContext({ viewport: device === 'desktop' ? { width: 1200, height: 800 } : { width: 390, height: 844 } });
          await context.addCookies([{ name: 'MADRASIO_LOCALE', value: locale, url: 'http://127.0.0.1:3000' }]);
          await context.addInitScript(value => localStorage.setItem('madrasio-theme', value), theme);
          const page = await context.newPage();
          await page.route('**/api/v1/**', async route => {
            const path = new URL(route.request().url()).pathname;
            assert.equal(route.request().method(), 'GET', 'Shell check must not write data');
            if (path === '/api/v1/me') return route.fulfill({ json: { data: {
              user: { id: '11111111-1111-4111-8111-111111111111' },
              currentSchool: { id: '22222222-2222-4222-8222-222222222222', role: 'SCHOOL_ADMIN', timezone: 'UTC' },
              memberships: [{ schoolId: '22222222-2222-4222-8222-222222222222', schoolName: 'Local layout fixture', role: 'SCHOOL_ADMIN', status: 'ACTIVE' }],
            } } });
            if (path === '/api/v1/notifications/unread-count') return route.fulfill({ json: { data: { count: 0 } } });
            throw new Error(`Unexpected shell request: ${path}`);
          });
          await page.goto('http://127.0.0.1:3000/dashboard', { waitUntil: 'networkidle' });
          await page.getByTestId('desktop-sidebar').waitFor({ state: 'attached' });
          await page.waitForFunction(() => !document.querySelector('select').disabled);
          const dark = theme === 'dark' || theme === 'midnight';
          const tokens = await page.evaluate(() => {
            const sidebar = document.querySelector('[data-testid="desktop-sidebar"]');
            return {
              page: getComputedStyle(document.body).backgroundColor,
              chrome: getComputedStyle(sidebar).backgroundColor,
              sidebarWidth: sidebar.getBoundingClientRect().width,
              overflow: document.documentElement.scrollWidth > innerWidth,
              authToken: getComputedStyle(document.body).getPropertyValue('--auth-surface'),
            };
          });
          assert.equal(tokens.page, dark ? backgrounds.midnight : backgrounds.light, 'Existing application background tokens must remain unchanged');
          assert.equal(tokens.chrome, dark ? backgrounds.dark : backgrounds.mist, 'Existing sidebar tokens must remain unchanged');
          assert.equal(tokens.authToken, '', 'Authentication tokens must not leak into the application');
          assert.ok(!tokens.overflow, 'Application must not overflow');
          if (device === 'desktop') {
            assert.equal(tokens.sidebarWidth, 256);
            await page.getByTestId('desktop-sidebar').getByRole('button').last().click();
            await page.waitForFunction(() => document.querySelector('[data-testid="desktop-sidebar"]').getBoundingClientRect().width === 72);
            await page.getByTestId('desktop-sidebar').getByRole('button').last().click();
            await page.waitForFunction(() => document.querySelector('[data-testid="desktop-sidebar"]').getBoundingClientRect().width === 256);
          } else {
            await page.getByTestId('mobile-navigation-trigger').click();
            const dialog = page.getByRole('dialog');
            await dialog.waitFor();
            assert.ok(await dialog.evaluate(element => element.contains(document.activeElement)), 'Drawer must receive keyboard focus');
            assert.ok(await dialog.evaluate(element => element.getBoundingClientRect().width <= innerWidth * .85 + 1));
            await page.keyboard.press('Shift+Tab');
            assert.ok(await dialog.evaluate(element => element.contains(document.activeElement)), 'Drawer focus must remain trapped');
            await page.screenshot({ path: resolve(output, `${locale}-${device}-${theme}-sidebar.png`), fullPage: true });
            await page.keyboard.press('Escape');
            await dialog.waitFor({ state: 'detached' });
            assert.ok(await page.getByTestId('mobile-navigation-trigger').evaluate(element => element === document.activeElement));
          }
          if (device === 'desktop') await page.screenshot({ path: resolve(output, `${locale}-${device}-${theme}-sidebar.png`), fullPage: true });
          shell.push({ locale, device, theme, ...tokens });
          await context.close();
        }
      }
    }
    const anonymous = await browser.newContext();
    const identityResponse = await anonymous.request.get('http://127.0.0.1:3000/api/v1/me');
    assert.equal(identityResponse.status(), 401, 'Real unauthenticated API request must remain denied');
    const publicPage = await anonymous.newPage();
    await publicPage.goto('http://127.0.0.1:3000/dashboard');
    await publicPage.waitForURL('**/login');
    await publicPage.locator('.auth-recovery a').click();
    await publicPage.waitForURL('**/auth/recover');
    await publicPage.locator('input[type="email"]').waitFor();
    const passwordResponse = await publicPage.goto('http://127.0.0.1:3000/auth/set-password', { waitUntil: 'networkidle' });
    assert.equal(passwordResponse.status(), 200, 'Invalid-session password route must remain safely reachable');
    assert.equal(await publicPage.locator('input[type="password"]').count(), 0, 'No password update form without a valid recovery session');
    await anonymous.close();
    writeFileSync(resolve(output, 'results.json'), JSON.stringify({ authentication: results, responsive, shell, anonymous: { identityStatus: 401, dashboardRedirect: '/login', recoveryReachable: true, invalidPasswordSessionBlocked: true }, failures }, null, 2));
    assert.deepEqual(failures, [], 'All contrast and responsive checks must pass');
    console.info(`PASS: ${results.length} theme/locale/viewport screenshots, 6 validation captures; no overflow or browser errors. Password visibility, validation, all-theme refresh persistence, exact backgrounds, contrast and recovery link verified.`);
    console.info(`PASS: ${responsive.length} extra responsive cases and ${shell.length} application/sidebar cases; existing global tokens, collapse/expand and mobile focus behavior preserved.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
