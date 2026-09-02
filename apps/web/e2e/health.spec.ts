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

test('deployment metadata is minimal and cannot be cached', async ({ request }) => {
  const response = await request.get('/api/health/deployment');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(Object.keys(body).sort()).toEqual(['commitSha', 'status']);
  expect(body.status).toBe('ok');
  expect(body.commitSha === null || /^[a-f0-9]{40}$/.test(body.commitSha)).toBe(true);
  expect(response.headers()['cache-control']).toContain('no-store');
});

test('expired protected bootstrap redirects to the public login without exposing app content', async ({
  page,
}) => {
  await page.route('**/api/v1/me', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' },
      }),
    });
  });
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in');
  await expect(page.getByLabel('Email address')).toHaveAttribute('autocomplete', 'email');
  await expect(page.getByLabel('Password')).toHaveAttribute('autocomplete', 'current-password');
  await expect(page.getByText('Your school workspace')).not.toBeVisible();
});
