import { expect, test } from '@playwright/test';
import { publicationEn, publicationFr, publicationAr } from '../i18n/messages/timetable-publication';
import { builderEn, builderFr, builderAr } from '../i18n/messages/timetable-builder';
import { publishedFixture } from '../__tests__/timetable/publication-fixture';
import { builderFixture, savedFixture, tid } from '../__tests__/timetable/builder-fixture';
import { publishSchema } from '../lib/modules/timetable/domain/publication';
for (const [locale, t, b] of [['en', publicationEn, builderEn], ['fr', publicationFr, builderFr], ['ar', publicationAr, builderAr]] as const) {
  for (const role of ['SCHOOL_ADMIN', 'TEACHER', 'PARENT'] as const) for (const width of [390, 1440]) test(`${locale} ${role} published timetable at ${width}px`, async ({ page, context, baseURL }, info) => {
    let published = publishedFixture(role); const fixture = builderFixture(), errors: string[] = [], calls: string[] = [];
    if (role === 'SCHOOL_ADMIN') {
      fixture.draft = savedFixture(fixture.draft, { academicYearId: tid(2), academicPeriodId: tid(3), classId: tid(4), configurationId: tid(12), curriculumVersionId: tid(7), startDate: '2025-09-01', endDate: '2025-12-20', expectedRevision: 0, requestKey: tid(60), lessons: published.schedules[0].lessons.map(({ lessonKey, weekday, start, end, subjectId, teacherAssignmentId, roomId }) => ({ lessonKey, weekday, start, end, subjectId, teacherAssignmentId, roomId })) });
      published = { ...published, latestSequence: 0, latestEffectiveFrom: null, schedules: [], history: [] };
    }
    page.on('pageerror', e => errors.push(e.message)); await page.setViewportSize({ width, height: 900 });
    await context.addCookies([{ name: 'MADRASIO_LOCALE', value: locale, url: baseURL!, httpOnly: true, sameSite: 'Lax' }]);
    await context.route('**/*', async route => {
      const url = new URL(route.request().url()); if (url.origin !== new URL(baseURL!).origin) return route.abort(); if (!url.pathname.startsWith('/api/v1/')) return route.continue();
      calls.push(url.pathname); let data: unknown;
      if (url.pathname === '/api/v1/me') data = { user: { id: tid(14) }, currentSchool: { id: tid(1), role, timezone: 'Africa/Casablanca' }, memberships: [{ schoolId: tid(1), schoolName: 'Synthetic School', role, status: 'ACTIVE' }] };
      else if (url.pathname.endsWith('/unread-count')) data = { count: 0 };
      else if (url.pathname === '/api/v1/timetable/published') {
        if (route.request().method() === 'POST') { expect(publishSchema.parse(route.request().postDataJSON())).toMatchObject({ confirm: true, expectedRevision: 1, expectedSequence: 0 }); published = publishedFixture(role); data = { id: tid(80), sequence: 1 }; }
        else data = url.searchParams.get('studentId') === tid(38) ? { ...published, selectedStudentId: tid(38), schedules: [] } : { ...published, history: url.searchParams.has('classId') ? published.history : [] };
      } else if (role === 'SCHOOL_ADMIN' && url.pathname === '/api/v1/timetable') data = fixture.state;
      else if (role === 'SCHOOL_ADMIN' && url.pathname === '/api/v1/timetable/draft') data = fixture.draft;
      else throw Error('Unexpected synthetic timetable route');
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) });
    });
    await page.goto('/timetable');
    if (role === 'SCHOOL_ADMIN') {
      await page.getByRole('button', { name: b.title, exact: true }).click(); await page.getByRole('button', { name: t.publish, exact: true }).click();
      await expect(page.getByRole('dialog').getByText(t.warnings)).toBeVisible(); await page.getByRole('dialog').getByRole('button', { name: t.confirm, exact: true }).click(); await expect(page.getByText(t.saved, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: t.title, exact: true }).click(); await page.getByLabel(t.class, { exact: true }).selectOption(tid(4)); await expect(page.getByRole('region', { name: t.history })).toBeVisible();
      await page.getByLabel(t.view, { exact: true }).selectOption('TEACHER'); await page.getByLabel(t.teacher, { exact: true }).selectOption(tid(9));
    } else await expect(page.getByRole('heading', { name: role === 'TEACHER' ? t.myTitle : t.childrenTitle, exact: true })).toBeVisible();
    await expect(page.getByText('Math', { exact: true }).first()).toBeVisible(); await expect(page.locator('html')).toHaveAttribute('lang', locale); await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('published-week.png'), fullPage: true });
    if (role === 'PARENT') { await page.getByLabel(t.child, { exact: true }).selectOption(tid(38)); await expect(page.getByText(t.empty, { exact: true })).toBeVisible(); await expect(page.getByText('Math', { exact: true })).toHaveCount(0); }
    if (role !== 'SCHOOL_ADMIN') expect(calls.some(p => p === '/api/v1/timetable' || p.endsWith('/draft'))).toBe(false);
    expect(errors).toEqual([]);
  });
}
