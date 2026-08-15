import { expect, test } from '@playwright/test';

test('GET /api/health returns ok', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({
    status: 'ok',
    service: 'school-management-system',
  });
});

test('home page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    /School Management System/i,
  );
});
