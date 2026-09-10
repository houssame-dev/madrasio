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
  expect(Object.keys(body).sort()).toEqual(['commitSha', 'deploymentUrl', 'status']);
  expect(body.status).toBe('ok');
  expect(body.commitSha === null || /^[a-f0-9]{40}$/.test(body.commitSha)).toBe(true);
  expect(
    body.deploymentUrl === null || /^[a-z0-9.-]+\.vercel\.app$/.test(body.deploymentUrl),
  ).toBe(true);
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

test('server-rendered login cannot submit credentials before hydration', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const dummyEmail = 'pre-hydration@example.invalid';
  const dummyPassword = 'dummy-pre-hydration-password';
  const credentialBearingRequests: string[] = [];

  page.on('request', (request) => {
    const body = request.postData() ?? '';
    if (
      request.url().includes(dummyEmail)
      || request.url().includes(dummyPassword)
      || body.includes(dummyEmail)
      || body.includes(dummyPassword)
    ) {
      credentialBearingRequests.push(request.method());
    }
  });

  try {
    await page.goto('/login');

    await expect(page.locator('form')).toHaveAttribute('method', 'post');
    await expect(page.getByLabel('Email address')).toBeDisabled();
    await expect(page.getByLabel('Password')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled();

    await page.getByLabel('Email address').evaluate((element, value) => {
      (element as HTMLInputElement).value = value;
    }, dummyEmail);
    await page.getByLabel('Password').evaluate((element, value) => {
      (element as HTMLInputElement).value = value;
    }, dummyPassword);
    await page.getByRole('button', { name: 'Sign in' }).click({ force: true });
    await page.waitForTimeout(100);

    expect(page.url()).not.toContain(dummyEmail);
    expect(page.url()).not.toContain(dummyPassword);
    expect(credentialBearingRequests).toEqual([]);
  } finally {
    await context.close();
  }
});
