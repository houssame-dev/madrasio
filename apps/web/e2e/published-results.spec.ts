import { workspaceContext } from './fixtures/workspace';
import { expect, test } from '@playwright/test';

/** Actual pages, hermetic authenticated boundary. Real scoped repositories are covered in PGlite tests. */
test('ordinary Parent navigation reaches all 55 publications and their history', async ({ page, baseURL }) => {
  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw new Error('Local fixture only');
  const id = (n: number) => `06100000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const school = id(1), child = id(2), year = id(3), user = id(4);
  const rows = Array.from({ length: 55 }, (_, i) => ({ publicationId: id(100 + i), resultId: id(200 + i), resultType: 'SUBJECT', value: '14.00', publicationVersion: 1, publishedAt: '2026-01-01T12:00:00.000Z', academicYear: { id: year, name: 'Original year' }, academicPeriod: { id: id(5), name: 'Original term' }, class: { id: id(6), name: 'Historical class label not recorded' }, subject: { id: id(300 + i), name: `Published subject ${i + 1}`, code: null } }));
  const requests: number[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin) { await route.abort(); return; }
    if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
    let body: unknown;
    if (url.pathname === '/api/v1/me') body = { data: { user: { id: user }, currentSchool: { id: school, role: 'PARENT', timezone: 'UTC' }, memberships: [{ schoolId: school, schoolName: 'Local school', role: 'PARENT', status: 'ACTIVE' }] } };
    else if (url.pathname === '/api/v1/dashboard/context') body = { data: workspaceContext };
    else if (url.pathname === '/api/v1/me/parent-profiles') body = { data: [{ parent: { id: id(7), firstName: 'Local', lastName: 'Parent', status: 'ACTIVE' }, children: [{ relationshipId: id(8), student: { id: child, firstName: 'Local', lastName: 'Child', studentCode: 'LOCAL' } }] }] };
    else if (url.pathname === '/api/v1/notifications/unread-count') body = { data: { count: 0 } };
    else if (url.pathname === `/api/v1/parent/children/${child}/academic-years`) body = { data: [{ id: year, name: 'Original year', status: 'ACTIVE', startDate: '2025-09-01', endDate: '2026-07-01' }] };
    else if (url.pathname === `/api/v1/parent/children/${child}/tuition`) body = { data: { currency: 'MAD', today: workspaceContext.date, studentId: child, summary: { netCents: 0, paidCents: 0, outstandingCents: 0 }, charges: [], payments: [], total: 0, page: 1 } };
    else if (url.pathname === `/api/v1/parent/children/${child}/attendance` || url.pathname === `/api/v1/parent/children/${child}/homeworks`) body = { data: [], meta: { page: 1, pageSize: 50, total: 0 } };
    else if (url.pathname === `/api/v1/parent/children/${child}/placement`) body = { data: null };
    else if (url.pathname === `/api/v1/parent/children/${child}/results`) {
      const p = Number(url.searchParams.get('page')); const subject = url.searchParams.get('resultType') === 'SUBJECT';
      if (subject) requests.push(p);
      body = { data: subject ? rows.slice((p - 1) * 50, p * 50) : [], meta: { page: p, pageSize: 50, total: subject ? 55 : 0 } };
    } else if (url.pathname === `/api/v1/parent/children/${child}/publications/${rows[54].publicationId}`) {
      const selected = { ...rows[54], academicYearId: year, state: 'PUBLISHED', gradingConfigurationVersionId: id(9), displayContext: { schemaVersion: 1, studentName: 'Local Child', academicYearName: 'Original year', academicPeriodName: 'Original term', subjectName: 'Published subject 55' } };
      body = { selected, data: [selected], meta: { page: 1, pageSize: 20, total: 1 } };
    } else throw new Error(`Unexpected local API path: ${url.pathname}`);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/children');
  await page.getByRole('link', { name: 'View Local Child', exact: true }).click();
  const section = page.getByRole('region', { name: 'Subject results', exact: true });
  await expect(section.locator('li')).toHaveCount(50);
  for (let i = 1; i <= 50; i++) await expect(section.getByText(`Published subject ${i}`, { exact: true })).toBeAttached();
  await section.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(section.locator('li')).toHaveCount(5);
  for (let i = 51; i <= 55; i++) await expect(section.getByText(`Published subject ${i}`, { exact: true })).toBeVisible();
  await expect(section.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  expect(requests).toContain(1); expect(requests).toContain(2);
  await section.locator('li').last().getByRole('link', { name: 'View publication and history' }).click();
  await expect(page.getByRole('heading', { name: 'Publication history', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Selected publication' })).toContainText('Published subject 55');
  await page.goto(`/children/${id(999)}`);
  await expect(page.getByRole('heading', { name: 'Child unavailable', exact: true })).toBeVisible();
});
