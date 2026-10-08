import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), reset: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/config/env', () => ({
  getServerEnv: () => ({
    SUPABASE_URL: 'https://synthetic.example',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-public',
  }),
}));
import { getRecoveryDelivery, recoveryCallbackUrl } from '@/lib/auth/recovery';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockReturnValue({ auth: { resetPasswordForEmail: mocks.reset } });
});
it('uses only supported recovery with the public key and no session storage/Admin rate-limit bypass', async () => {
  mocks.reset.mockResolvedValue({ error: null });
  await getRecoveryDelivery().request(
    'user@example.test',
    recoveryCallbackUrl('https://app.example.test'),
  );
  expect(mocks.createClient).toHaveBeenCalledWith('https://synthetic.example', 'synthetic-public', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  expect(mocks.reset).toHaveBeenCalledWith('user@example.test', {
    redirectTo: 'https://app.example.test/auth/confirm',
  });
  expect(mocks.reset).toHaveBeenCalledOnce();
});
it('bounds provider errors, with no retry', async () => {
  mocks.reset.mockResolvedValue({ error: { status: 429, message: 'private detail' } });
  await expect(
    getRecoveryDelivery().request('user@example.test', 'https://app.example.test/auth/confirm'),
  ).rejects.toThrow('Recovery delivery unavailable.');
  expect(mocks.reset).toHaveBeenCalledOnce();
});
it.each([
  undefined,
  'http://external.example',
  '//evil.example',
  'https://user:password@app.example',
  'https://app.example/path',
  'https://app.example?next=evil',
  'https://app.example#fragment',
])('rejects invalid application origin %s', (origin) => {
  expect(() => recoveryCallbackUrl(origin)).toThrow();
});
it('supports only intentional local HTTP development', () => {
  expect(recoveryCallbackUrl('http://localhost:3000')).toBe('http://localhost:3000/auth/confirm');
});
