import { builderFixture } from '../__tests__/timetable/builder-fixture';
import { expect, test, type BrowserContext } from '@playwright/test';
import { schoolHolidaysEn, schoolHolidaysFr, schoolHolidaysAr } from '../i18n/messages/school-holidays';
import { createHolidaySchema, updateHolidaySchema, removeHolidaySchema, type HolidayView } from '../lib/modules/school-holidays/contracts';
import { publishedFixture } from '../__tests__/timetable/publication-fixture';
import { writeFile } from 'node:fs/promises';
import type { Page as BrowserPage } from '@playwright/test';

// Composite inherited transparent backgrounds before assessing the rendered text.
async function contrast(page: BrowserPage, selector: string) {
  return page.locator(selector).evaluate(root => {
    type Color = number[];
    const color = (value: string): Color => (value.match(/[\d.]+/g) ?? []).map(Number);
    const over = (a: Color, b: Color): Color => { const alpha = a[3] ?? 1; return [0, 1, 2].map(i => a[i] * alpha + b[i] * (1 - alpha)); };
    const bg = (e: Element | null): Color => e ? over(color(getComputedStyle(e).backgroundColor), bg(e.parentElement)) : [255, 255, 255];
    const lum = (v: Color) => v.map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((s, x, i) => s + x * [.2126, .7152, .0722][i], 0);
    return Array.from(root.querySelectorAll('*')).filter(e => e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden' && !(e as HTMLInputElement).disabled && Array.from(e.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())).map(e => {
      const css = getComputedStyle(e), back = bg(e), fore = over(color(css.color), back), a = lum(fore), b = lum(back);
      const large = parseFloat(css.fontSize) >= 24 || (parseFloat(css.fontSize) >= 18.66 && Number(css.fontWeight) >= 700);
      return { text: e.textContent?.trim().slice(0, 90), ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), required: large ? 3 : 4.5, color: css.color, background: back };
    });
  });
}
async function nonTextContrast(page: BrowserPage, selector: string) {
  return page.locator(selector).evaluate(root => {
    const color = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
    const over = (a: number[], b: number[]) => [0, 1, 2].map(i => a[i] * (a[3] ?? 1) + b[i] * (1 - (a[3] ?? 1)));
    const bg = (e: Element | null): number[] => e ? over(color(getComputedStyle(e).backgroundColor), bg(e.parentElement)) : [255, 255, 255];
    const lum = (v: number[]) => v.map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((s, x, i) => s + x * [.2126, .7152, .0722][i], 0);
    const ratio = (a: number[], b: number[]) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
    const probe = document.createElement('span'); probe.style.color = 'hsl(var(--ring))'; root.appendChild(probe);
    const ring = color(getComputedStyle(probe).color); probe.remove();
    return Array.from(root.querySelectorAll('input:not([type=radio]),textarea,select,svg')).filter(e => e.getBoundingClientRect().width > 0 && !(e as HTMLInputElement).disabled).map(e => {
      const css = getComputedStyle(e), back = bg(e), field = e.tagName.toLowerCase() !== 'svg';
      return { element: e.id || e.getAttribute('class'), kind: field ? 'field-boundary' : 'icon', ratio: ratio(over(color(field ? css.borderTopColor : css.color), back), back), focusRatio: field ? ratio(ring, back) : null };
    });
  });
}
const id = (n: number) => `07000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const original: HolidayView[] = [
  { id: id(1), name: 'Winter Break', type: 'SCHOOL_HOLIDAY', startDate: '2026-12-21', endDate: '2027-01-03', description: 'End-of-term break', revision: 1 },
  { id: id(2), name: 'Independence Day', type: 'PUBLIC_HOLIDAY', startDate: '2026-11-18', endDate: '2026-11-18', description: 'National observance', revision: 1 },
  { id: id(3), name: 'Spring Break', type: 'SCHOOL_HOLIDAY', startDate: '2027-04-05', endDate: '2027-04-11', description: null, revision: 1 },
  { id: id(4), name: 'Foundation Day', type: 'SCHOOL_HOLIDAY', startDate: '2027-05-07', endDate: '2027-05-07', description: 'School anniversary', revision: 1 },
];
async function fixture(context: BrowserContext, baseURL: string, role: 'SCHOOL_ADMIN' | 'TEACHER' | 'PARENT' = 'SCHOOL_ADMIN') {
  const rows = structuredClone(original), calls: { path: string; method: string; body: unknown }[] = [];
  let conflict = false, fail = false, pending: Promise<void> | undefined;
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== new URL(baseURL).origin) return route.abort();
    if (!url.pathname.startsWith('/api/v1/')) return route.continue();
    const body = request.postData() ? request.postDataJSON() : undefined;
    calls.push({ path: url.pathname, method: request.method(), body });
    let response: unknown;
    if (url.pathname === '/api/v1/me') response = { data: { user: { id: id(10) }, currentSchool: { id: id(11), role, timezone: 'Africa/Casablanca' }, memberships: [{ schoolId: id(11), schoolName: 'Local School', role, status: 'ACTIVE' }] } };
    else if (url.pathname === '/api/v1/dashboard/context') response = { data: { date: '2026-11-18', timezone: 'Africa/Casablanca', academicYear: { id: id(20), name: '2026/2027' } } };
    else if (url.pathname === '/api/v1/notifications/unread-count') response = { data: { count: 0 } };
    else if (url.pathname === '/api/v1/academic-years') response = { data: [{ id: id(20), name: '2026/2027', startDate: '2026-09-01', endDate: '2027-06-30', status: 'ACTIVE' }], meta: { page: 1, pageSize: 100, total: 1 } };
    else if (url.pathname === '/api/v1/school-holidays' && request.method() === 'GET') {
      await pending;
      if (fail) return route.fulfill({ status: 503, json: { error: { code: 'INTERNAL_ERROR', message: 'Synthetic unavailable' } } });
      const filtered = rows.filter(r => (!url.searchParams.get('search') || r.name.toLowerCase().includes(url.searchParams.get('search')!.toLowerCase())) && (!url.searchParams.get('type') || r.type === url.searchParams.get('type')));
      const page = Number(url.searchParams.get('page') ?? 1);
      response = { data: filtered.slice((page - 1) * 20, page * 20), meta: { page, pageSize: 20, total: filtered.length } };
    } else if (url.pathname.startsWith('/api/v1/school-holidays')) {
      expect(role).toBe('SCHOOL_ADMIN');
      const old = rows.find(r => r.id === url.pathname.split('/').at(-1));
      if (request.method() === 'DELETE') {
        expect(removeHolidaySchema.parse(body)).toEqual({ expectedRevision: old!.revision, confirmed: true });
        rows.splice(rows.indexOf(old!), 1); response = { data: old };
      } else {
        const fields = request.method() === 'POST' ? createHolidaySchema.parse(body) : updateHolidaySchema.parse(body);
        if (request.method() === 'PATCH') expect(body.expectedRevision).toBe(old!.revision);
        if (conflict) return route.fulfill({ status: 409, json: { error: { code: 'CONFLICT', featureCode: 'HOLIDAY_ATTENDANCE_CONFLICT', message: 'Attendance already exists.' } } });
        const row = { ...fields, id: old?.id ?? id(100 + rows.length), revision: (old?.revision ?? 0) + 1, description: fields.description ?? null };
        if (old) rows.splice(rows.indexOf(old), 1, row); else rows.push(row);
        response = { data: row };
      }
    } else if (url.pathname === '/api/v1/timetable/published') response = { data: { ...publishedFixture(role), date: '2026-11-18', today: '2026-11-18', holidays: [original[1]], schedules: [], history: [] } };
    else if (url.pathname === '/api/v1/classes') response = { data: [], meta: { page: 1, pageSize: 100, total: 0 } };
    else if (url.pathname === '/api/v1/timetable') response = { data: builderFixture().state };
    else if (url.pathname === '/api/v1/attendance/sessions') response = { data: { date: '2026-11-18', holidays: [original[1]], sessions: [] } };
    else throw Error('Unexpected School Holidays synthetic API: ' + url.pathname);
    await route.fulfill({ json: response });
  });
  return { rows, calls, conflict: (v: boolean) => { conflict = v; }, fail: (v: boolean) => { fail = v; }, hold: () => { let release!: () => void; pending = new Promise<void>(resolve => { release = resolve; }); return release; } };
}
for (const [locale, t] of [['en', schoolHolidaysEn], ['fr', schoolHolidaysFr], ['ar', schoolHolidaysAr]] as const) {
  for (const width of [390, 1440]) test(`School calendar ${locale} ${width}: four themes, filters and complete mutations`, async ({ page, context, baseURL }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await context.addCookies([{ name: 'MADRASIO_LOCALE', value: locale, url: baseURL! }]);
    const f = await fixture(context, baseURL!), errors: string[] = [];
    const release = f.hold();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/academic?section=years&view=calendar');
    await expect(page.getByRole('heading', { name: t.title, exact: true })).toBeVisible();
    await expect(page.locator('.school-calendar').getByRole('status')).toHaveText(t.loading);
    await page.screenshot({ path: info.outputPath('loading.png'), fullPage: true });
    release(); await expect(page.locator('.holiday-table tbody tr')).toHaveCount(4);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    for (const theme of ['light', 'mist', 'midnight', 'dark']) {
      await page.evaluate(theme => { localStorage.setItem('madrasio-theme', theme); window.dispatchEvent(new StorageEvent('storage', { key: 'madrasio-theme', newValue: theme })); }, theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.waitForTimeout(350); // Let the existing theme-color transition finish before measuring pixels.
      const measured = await contrast(page, '.school-calendar');
      await writeFile(info.outputPath(`contrast-${theme}.json`), JSON.stringify(measured, null, 2));
      expect(measured.filter(v => v.ratio + .01 < v.required)).toEqual([]);
      const nonText = await nonTextContrast(page, '.school-calendar');
      await writeFile(info.outputPath(`contrast-controls-${theme}.json`), JSON.stringify(nonText, null, 2));
      expect(nonText.filter(v => v.ratio < 3 || (v.focusRatio !== null && v.focusRatio < 3))).toEqual([]);
      await page.screenshot({ path: info.outputPath(`calendar-${theme}.png`), fullPage: true });
    }
    await page.evaluate(theme => { localStorage.setItem('madrasio-theme', theme); window.dispatchEvent(new StorageEvent('storage', { key: 'madrasio-theme', newValue: theme })); }, locale === 'ar' ? 'midnight' : 'light');
    await page.getByLabel(t.search, { exact: true }).fill('Winter'); await expect(page.locator('.holiday-table tbody tr')).toHaveCount(1);
    await page.getByLabel(t.search, { exact: true }).fill(''); await page.getByLabel(t.type, { exact: true }).selectOption('PUBLIC_HOLIDAY'); await expect(page.locator('.holiday-table tbody tr')).toHaveCount(1);
    await page.getByLabel(t.type, { exact: true }).selectOption(''); await page.getByLabel(t.year, { exact: true }).selectOption(id(20));
    await page.getByRole('button', { name: t.add, exact: true }).click();
    const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
    await expect(dialog.locator(':focus')).toHaveCount(1);
    for (const theme of ['light', 'mist', 'midnight', 'dark']) {
      await page.evaluate(theme => { localStorage.setItem('madrasio-theme', theme); window.dispatchEvent(new StorageEvent('storage', { key: 'madrasio-theme', newValue: theme })); }, theme);
      await page.waitForTimeout(350);
      const formContrast = await contrast(page, '[role="dialog"]');
      await writeFile(info.outputPath(`contrast-form-${theme}.json`), JSON.stringify(formContrast, null, 2));
      expect(formContrast.filter(v => v.ratio + .01 < v.required)).toEqual([]);
      const nonText = await nonTextContrast(page, '[role="dialog"]');
      await writeFile(info.outputPath(`contrast-form-controls-${theme}.json`), JSON.stringify(nonText, null, 2));
      expect(nonText.filter(v => v.ratio < 3 || (v.focusRatio !== null && v.focusRatio < 3))).toEqual([]);
    }
    await page.evaluate(theme => { localStorage.setItem('madrasio-theme', theme); window.dispatchEvent(new StorageEvent('storage', { key: 'madrasio-theme', newValue: theme })); }, locale === 'ar' ? 'midnight' : 'light');
    await page.waitForTimeout(350);
    await page.screenshot({ path: info.outputPath('add.png'), fullPage: true });
    await dialog.getByLabel(t.name, { exact: true }).fill('Unsaved draft');
    await page.setViewportSize({ width: 320, height: 1000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await page.screenshot({ path: info.outputPath('narrow-form.png'), fullPage: true });
    await page.setViewportSize({ width, height: 1000 });
    page.once('dialog', d => d.dismiss()); await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
    await dialog.getByLabel(t.name, { exact: true }).fill('');
    await dialog.getByRole('button', { name: t.save, exact: true }).click(); await expect(dialog.getByRole('alert')).toHaveText(t.invalid);
    await dialog.getByLabel(t.name, { exact: true }).fill('New Holiday — عطلة');
    await dialog.getByLabel(t.start, { exact: true }).fill('2027-05-07'); await dialog.getByLabel(t.end, { exact: true }).fill('2027-05-08');
    await dialog.getByLabel(t.description, { exact: true }).fill('User-entered description');
    f.conflict(true); await dialog.getByRole('button', { name: t.save, exact: true }).click(); await expect(dialog.getByRole('alert')).toHaveText(t.conflict);
    await page.screenshot({ path: info.outputPath('conflict.png'), fullPage: true });
    f.conflict(false); await dialog.getByRole('button', { name: t.save, exact: true }).click(); await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText(t.saved);
    await page.getByRole('button', { name: `${t.edit} New Holiday — عطلة`, exact: true }).click();
    await page.screenshot({ path: info.outputPath('edit.png'), fullPage: true });
    await dialog.getByLabel(t.name, { exact: true }).fill('Edited Holiday'); await dialog.getByRole('button', { name: t.saveChanges, exact: true }).click();
    await expect(page.getByText('Edited Holiday', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: `${t.remove} Edited Holiday`, exact: true }).click();
    await page.screenshot({ path: info.outputPath('delete.png'), fullPage: true });
    await dialog.getByRole('button', { name: t.remove, exact: true }).click(); await expect(page.getByText('Edited Holiday', { exact: true })).toHaveCount(0);
    expect(f.calls.filter(c => c.method === 'DELETE')).toHaveLength(1);
    await page.getByLabel(t.search, { exact: true }).fill('no match'); await expect(page.getByText(t.empty, { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('empty.png'), fullPage: true });
    f.fail(true); await page.getByLabel(t.search, { exact: true }).fill('unavailable'); await expect(page.locator('.school-calendar').getByRole('alert')).toContainText(t.error);
    await page.screenshot({ path: info.outputPath('error.png'), fullPage: true });
    f.fail(false); await page.getByRole('button', { name: t.retry, exact: true }).click(); await expect(page.getByText(t.empty, { exact: true })).toBeVisible();
    f.rows.push(...Array.from({length:21}, (_, n) => ({...original[0], id:id(200+n), name:'Paged closure '+n})));
    await page.getByLabel(t.search, { exact: true }).fill('Paged closure'); await expect(page.locator('.holiday-table tbody tr')).toHaveCount(20);
    await page.getByRole('button', { name:t.next, exact:true }).click(); await expect(page.locator('.holiday-table tbody tr')).toHaveCount(1);
    await expect(page.getByRole('button', { name:t.next, exact:true })).toBeDisabled();
    for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 1000 }); await expect.poll(() => page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth })), { message: `No overflow after responsive shell settles at ${width}px` }).toEqual({ viewport: width, scroll: width }); }
    expect(errors).toEqual([]);
  });
  for (const role of ['SCHOOL_ADMIN', 'TEACHER', 'PARENT'] as const) test(`Read-only dated holiday ${locale} ${role}`, async ({ page, context, baseURL }, info) => {
    await context.addCookies([{ name: 'MADRASIO_LOCALE', value: locale, url: baseURL! }]);
    const f = await fixture(context, baseURL!, role);
    await page.clock.setFixedTime(new Date('2026-11-18T12:00:00Z'));
    await page.setViewportSize({ width: locale === 'ar' ? 390 : 1440, height: 1000 });
    await page.addInitScript(theme => localStorage.setItem('madrasio-theme', theme), locale === 'ar' ? 'midnight' : 'light');
    if (role !== 'SCHOOL_ADMIN') { await page.goto('/timetable'); await expect(page.getByRole('heading', { name: t.noClasses, exact: true })).toBeVisible(); }
    else { await page.goto('/attendance'); await expect(page.getByRole('heading', { name: t.noAttendance, exact: true })).toBeVisible(); }
    await expect(page.getByText('Independence Day', { exact: true })).toBeVisible();
    for (const theme of ['light', 'mist', 'midnight', 'dark']) {
      await page.evaluate(theme => { localStorage.setItem('madrasio-theme', theme); window.dispatchEvent(new StorageEvent('storage', { key: 'madrasio-theme', newValue: theme })); }, theme);
      await page.waitForTimeout(350);
      const measured = await contrast(page, '.holiday-closure');
      await writeFile(info.outputPath(`contrast-closed-${theme}.json`), JSON.stringify(measured, null, 2));
      expect(measured.filter(v => v.ratio + .01 < v.required)).toEqual([]);
      await page.screenshot({ path: info.outputPath(`closed-${theme}.png`), fullPage: true });
    }
    await page.evaluate(theme => { localStorage.setItem('madrasio-theme', theme); window.dispatchEvent(new StorageEvent('storage', { key: 'madrasio-theme', newValue: theme })); }, locale === 'ar' ? 'midnight' : 'light');
    await page.waitForTimeout(350);
    await page.screenshot({ path: info.outputPath('closed.png'), fullPage: true });
    if (role === 'SCHOOL_ADMIN') { await page.goto('/timetable'); await page.locator('[data-tt-tab=published]').click(); await expect(page.getByRole('heading', { name: t.noClasses, exact: true })).toBeVisible(); await page.screenshot({ path: info.outputPath('timetable-closed.png'), fullPage: true }); }
    expect(f.calls.some(c => c.method !== 'GET')).toBe(false);
    expect(f.calls.some(c => c.path.startsWith('/api/v1/school-holidays'))).toBe(false);
  });
}
