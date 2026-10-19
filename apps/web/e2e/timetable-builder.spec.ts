import { expect, test } from '@playwright/test';
import { builderEn, builderFr, builderAr } from '../i18n/messages/timetable-builder';
import { builderFixture, savedFixture, tid } from '../__tests__/timetable/builder-fixture';
import { draftSchema } from '../lib/modules/timetable/domain/builder';

// Browser/Next presentation with typed synthetic API contracts. SQL/locking have separate native proof.
for (const [locale, t] of [['en', builderEn], ['fr', builderFr], ['ar', builderAr]] as const) {
  for (const width of [390, 768, 1440]) test(`Weekly builder ${locale} at ${width}px: add, reload, move and remove`, async ({ page, context, baseURL }, info) => {
    const fixture = builderFixture(), errors: string[] = []; const revisions: typeof fixture.draft[] = [];
    page.on('pageerror', error => errors.push(error.message)); await page.setViewportSize({ width, height: 900 });
    await context.addCookies([{ name: 'MADRASIO_LOCALE', value: locale, url: baseURL!, httpOnly: true, sameSite: 'Lax' }]);
    await context.route('**/*', async route => {
      const url = new URL(route.request().url()); if (url.origin !== new URL(baseURL!).origin) return route.abort();
      if (!url.pathname.startsWith('/api/v1/')) return route.continue();
      let data: unknown;
      if (url.pathname === '/api/v1/me') data = { user: { id: tid(14) }, currentSchool: { id: tid(1), role: 'SCHOOL_ADMIN', timezone: 'Africa/Casablanca' }, memberships: [{ schoolId: tid(1), schoolName: 'Synthetic School', role: 'SCHOOL_ADMIN', status: 'ACTIVE' }] };
      else if (url.pathname.endsWith('/unread-count')) data = { count: 0 };
      else if (url.pathname === '/api/v1/timetable/published') data = { date: '2025-09-01', today: '2025-09-01', latestSequence: 0, latestEffectiveFrom: null, schedules: [], history: [], classes: [], teachers: [], children: [] };
      else if (url.pathname === '/api/v1/timetable') data = fixture.state;
      else if (url.pathname === '/api/v1/timetable/draft') {
        if (route.request().method() === 'PUT') { const body = draftSchema.parse(route.request().postDataJSON()); expect(body.expectedRevision).toBe(fixture.draft.draft?.revision ?? 0); fixture.draft = savedFixture(fixture.draft, body); revisions.push(structuredClone(fixture.draft)); }
        data = fixture.draft;
      } else throw new Error('Unexpected synthetic builder API route');
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) });
    });
    await page.goto('/timetable'); await page.getByRole('button', { name: t.title, exact: true }).click();
    await expect(page.getByRole('region', { name: t.grid, exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', locale); await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await page.getByRole('button', { name: new RegExp(t.add) }).first().click(); const modal = page.getByRole('dialog');
    await modal.getByLabel(t.subject, { exact: true }).selectOption(tid(8)); await modal.getByLabel(t.assignment, { exact: true }).selectOption(tid(10)); await modal.getByLabel(t.room, { exact: true }).selectOption(tid(11));
    await modal.getByRole('button', { name: t.apply, exact: true }).click();
    await expect(page.getByText(t.INCOMPLETE, { exact: true })).toBeVisible(); await page.getByRole('button', { name: t.save, exact: true }).click(); await expect(page.getByText(t.saved, { exact: true })).toBeVisible();
    const key = fixture.draft.lessons[0].lessonKey;
    expect(await page.getByRole('article').evaluateAll(cards => cards.every(card => [...card.querySelectorAll('button')].every(button => {
      const bounds = button.getBoundingClientRect(), parent = card.getBoundingClientRect();
      return bounds.left >= parent.left && bounds.right <= parent.right;
    })))).toBe(true);
    await page.screenshot({ path: info.outputPath('saved-week.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.reload(); await page.getByRole('button', { name: t.title, exact: true }).click();
    await expect(page.getByRole('region', { name: t.grid, exact: true }).getByText('Math', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: new RegExp(t.edit) }).click(); await modal.getByLabel(t.slot, { exact: true }).selectOption('2|08:00|09:00'); await modal.getByRole('button', { name: t.apply, exact: true }).click();
    await page.getByRole('button', { name: t.save, exact: true }).click(); await expect(page.getByText(t.saved, { exact: true })).toBeVisible();
    expect(fixture.draft.lessons[0]).toMatchObject({ lessonKey: key, weekday: 2 }); expect(revisions[0].lessons[0].weekday).toBe(1);
    await page.getByRole('button', { name: new RegExp(t.remove) }).click(); await page.getByRole('button', { name: t.save, exact: true }).click(); await expect(page.getByText(t.saved, { exact: true })).toBeVisible();
    expect(fixture.draft.lessons).toEqual([]); expect(fixture.draft.draft?.revision).toBe(3);
    expect(errors).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
