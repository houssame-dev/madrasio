import { expect, test, type Page } from '@playwright/test';

const hostedJobs = process.env.RUN_STAGING_JOBS === '1';
const secret = process.env.CRON_SECRET?.trim();

function credential(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Hosted job verification requires ${name}.`);
  return value;
}

async function signIn(page: Page, emailName: string, passwordName: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(credential(emailName));
  await page.getByLabel('Password').fill(credential(passwordName));
  await page.getByLabel('Password').press('Enter');
  await page.waitForURL(/\/dashboard$/);
}

async function json(page: Page, path: string, init?: RequestInit) {
  return page.evaluate(async ({ path, init }) => {
    const response = await fetch(path, init);
    return { status: response.status, body: await response.json() };
  }, { path, init });
}

test.describe('conditional Task 044 hosted background jobs', () => {
  test.skip(!hostedJobs, 'Set RUN_STAGING_JOBS=1 with an ephemeral server-only CRON_SECRET.');

  test('machine routes are protected and completed work is idempotent', async ({ request }) => {
    test.skip(!secret, 'The Task 044 machine-route check requires its ephemeral CRON_SECRET.');
    expect((await request.get('/api/internal/jobs/process-outbox')).status()).toBe(405);
    expect((await request.post('/api/internal/jobs/process-outbox')).status()).toBe(401);
    expect((await request.post('/api/internal/jobs/process-outbox', {
      headers: { authorization: 'Bearer incorrect' },
    })).status()).toBe(401);

    const outbox = await request.post('/api/internal/jobs/process-outbox', {
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(outbox.status()).toBe(200);
    expect(await outbox.json()).toEqual({
      data: { attempted: 0, processed: 0, failed: 0, pending: 0, remaining: 0 },
    });
    const scheduled = await request.post('/api/internal/jobs/process-scheduled-announcements', {
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(scheduled.status()).toBe(200);
    expect(await scheduled.json()).toEqual({
      data: { attempted: 0, published: 0, failed: 0, remaining: 0 },
    });
  });

  test('real Parent inbox exposes the eight persisted historical notifications', async ({ page }) => {
    await signIn(page, 'STAGING_PARENT_EMAIL', 'STAGING_PARENT_PASSWORD');
    const list = await json(page, '/api/v1/notifications?page=1&pageSize=50');
    const unread = await json(page, '/api/v1/notifications/unread-count');
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(8);
    expect(unread.body).toEqual({ data: { count: 0 } });
    expect(list.body.data.filter((item: { notificationType: string }) => item.notificationType === 'ANNOUNCEMENT_PUBLISHED')).toHaveLength(3);
    expect(list.body.data.filter((item: { notificationType: string }) => item.notificationType === 'RESULT_PUBLISHED')).toHaveLength(4);
    expect(list.body.data.filter((item: { notificationType: string }) => item.notificationType === 'RESULT_REVISED')).toHaveLength(1);
    const detail = await json(page, `/api/v1/notifications/${list.body.data[0].id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toEqual(expect.objectContaining({ sourceType: expect.any(String), sourceId: expect.any(String) }));
    expect(JSON.stringify(detail.body)).not.toMatch(/recipientUserId|sourceEventId|payload/i);

    await page.goto('/notifications');
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    await expect(page.getByText('Result revised').first()).toBeVisible();
  });
});
