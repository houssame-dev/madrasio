import { expect, test } from '@playwright/test';

test('security headers and invalid invitation redirects are safe over HTTP', async ({ request }) => {
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(health.headers()['x-content-type-options']).toBe('nosniff');
  expect(health.headers()['x-frame-options']).toBe('DENY');
  expect(health.headers()['content-security-policy']).toBe("frame-ancestors 'none'");
  expect(health.headers()['referrer-policy']).toBe('no-referrer');
  expect(health.headers()['cache-control']).toContain('no-store');
  expect(health.headers()['access-control-allow-origin']).toBeUndefined();
  const invalid = await request.get('/auth/confirm?type=unsupported&next=https://example.test', { maxRedirects: 0 });
  expect(invalid.status()).toBe(307);
  expect(invalid.headers()['location']).toContain('/auth/set-password?error=invalid-invite');
  expect(invalid.headers()['location']).not.toContain('example.test');
  expect(invalid.headers()['cache-control']).toContain('no-store');
});
