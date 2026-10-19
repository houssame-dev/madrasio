import { expect, test } from '@playwright/test';
import { timetableEn, timetableFr, timetableAr } from '../i18n/messages/timetable';

// Actual Next route/browser presentation; persistence is synthetic here. Service tests exercise real SQL.
for (const [locale, t] of [['en', timetableEn], ['fr', timetableFr], ['ar', timetableAr]] as const) {
  for (const width of [390, 1440]) test(`Timetable ${locale} at ${width}px: week, rooms and requirements`, async ({ page, context, baseURL }, info) => {
    const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    await page.setViewportSize({ width, height: 900 });
    await context.addCookies([{ name: 'MADRASIO_LOCALE', value: locale, url: baseURL!, httpOnly: true, sameSite: 'Lax' }]);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const writes: { path: string; body: Record<string, unknown> }[] = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(baseURL!).origin) return route.abort();
      if (!url.pathname.startsWith('/api/v1/')) return route.continue();
      let data: unknown;
      if (url.pathname === '/api/v1/me') data = { user: { id: 'admin' }, currentSchool: { id: 'school', role: 'SCHOOL_ADMIN', timezone: 'Africa/Casablanca' }, memberships: [{ schoolId: 'school', schoolName: 'Synthetic School', role: 'SCHOOL_ADMIN', status: 'ACTIVE' }] };
      else if (url.pathname.endsWith('/unread-count')) data = { count: 0 };
      else if (url.pathname === '/api/v1/timetable') data = {
        years: [{ id: id(1), name: '2026/27', status: 'ACTIVE', startDate: '2026-09-01', endDate: '2027-07-01' }], selectedYearId: id(1),
        stages: [{ id: id(2), name: 'Primary', status: 'ACTIVE' }], levels: [{ id: id(3), stageId: id(2), name: 'Level 1', status: 'ACTIVE' }],
        rooms: [], configurations: [], loads: [], classes: [{ id: id(4), name: '1A', levelId: id(3), curriculumVersionId: id(5), status: 'ACTIVE' }],
        subjects: [{ id: id(6), name: 'Math', status: 'ACTIVE' }], curriculumSubjects: [{ subjectId: id(6), curriculumVersionId: id(5), status: 'ACTIVE' }],
        assignments: [{ assignment: { id: id(7), classId: id(4), subjectId: id(6), status: 'ACTIVE', effectiveFrom: '2026-09-01', effectiveUntil: null }, teacherFirstName: 'Amina', teacherName: 'Test', teacherStatus: 'ACTIVE' }], effective: [{ classId: id(4), configurationId: null }],
      };
      else if (url.pathname.startsWith('/api/v1/timetable/') && route.request().method() === 'PUT') { writes.push({ path: url.pathname, body: route.request().postDataJSON() }); data = { id: id(8), revision: 1 }; }
      else throw new Error('Unexpected synthetic timetable API route');
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) });
    });
    await page.goto('/timetable'); await expect(page.getByRole('heading', { name: t.title })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', locale); await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await page.getByLabel(t.scope, { exact: true }).selectOption(`stage:${id(2)}`); await page.getByLabel(t.inherit).uncheck();
    await page.getByLabel(t.saturday, { exact: true }).check(); await page.getByRole('button', { name: t.save, exact: true }).click();
    await expect.poll(() => writes.filter(w => w.path.endsWith('/configurations')).length).toBe(1);
    expect(writes[0].body).toMatchObject({ stageId: id(2), levelId: null, enabled: true, expectedRevision: 0 });
    await expect(page.getByRole('status')).toHaveText(t.saved);
    await expect(page.getByLabel(t.scope, { exact: true })).toHaveValue(`stage:${id(2)}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('teaching-week.png'), fullPage: true });
    await page.getByRole('button', { name: t.rooms, exact: true }).click();
    await page.getByLabel(t.name, { exact: true }).fill('Synthetic lab'); await page.getByLabel(t.kind, { exact: true }).selectOption('LAB');
    await page.getByRole('button', { name: t.addRoom, exact: true }).click();
    await expect.poll(() => writes.filter(w => w.path.endsWith('/rooms')).length).toBe(1);
    await page.getByRole('button', { name: t.loads, exact: true }).click();
    await page.getByLabel(t.subject, { exact: true }).selectOption(id(6)); await page.getByLabel(t.assignment, { exact: true }).selectOption(id(7));
    await page.getByLabel(t.lessons, { exact: true }).fill('4'); await page.getByRole('button', { name: t.addLoad, exact: true }).click();
    await expect.poll(() => writes.filter(w => w.path.endsWith('/loads')).length).toBe(1);
    expect(writes.at(-1)?.body).toMatchObject({ teacherAssignmentId: id(7), lessonsPerWeek: 4, roomId: null });
    await expect(page.getByRole('status')).toHaveText(t.saved); expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('teaching-load.png'), fullPage: true });
  });
}
