import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ verifyOtp: vi.fn() }));
vi.mock('@/lib/config/env', () => ({
  getServerEnv: () => ({ APP_URL: 'https://app.example.test' }),
}));
vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: async () => ({ auth: { verifyOtp: mocks.verifyOtp } }),
}));
import { GET } from '@/app/auth/confirm/route';
beforeEach(() => {
  mocks.verifyOtp.mockReset().mockResolvedValue({ data: { session: {} }, error: null });
});
it.each(['https://evil.example', '//evil.example', '%2F%2Fevil.example'])(
  'ignores untrusted origin/next/redirectTo (%s)',
  async (next) => {
    const response = await GET(
      new Request(
        `https://untrusted.example/auth/confirm?type=recovery&token_hash=synthetic-only&next=${next}&redirectTo=${next}`,
      ),
    );
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      type: 'recovery',
      token_hash: 'synthetic-only',
    });
    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
    expect(response.headers.get('location')).toBe('https://app.example.test/auth/set-password');
    expect(response.headers.get('cache-control')).toContain('no-store');
  },
);
it.each([
  'type=recovery',
  'token_hash=synthetic-only',
  'token_hash=synthetic-only&type=signup',
  `type=recovery&token_hash=${'x'.repeat(2049)}`,
])('rejects missing or malformed recovery context', async (query) => {
  const response = await GET(new Request(`https://app.example.test/auth/confirm?${query}`));
  expect(mocks.verifyOtp).not.toHaveBeenCalled();
  expect(response.headers.get('location')).toBe(
    new URLSearchParams(query).get('type') === 'recovery'
      ? 'https://app.example.test/auth/set-password?error=invalid-recovery'
      : '/auth/set-password?error=invalid-invite',
  );
});
it.each(['expired', 'transport', 'missing-session'])(
  'fails closed for %s, without token/error disclosure',
  async (state) => {
    if (state === 'transport')
      mocks.verifyOtp.mockRejectedValue(new Error('private-provider-detail'));
    else
      mocks.verifyOtp.mockResolvedValue({
        data: { session: null },
        error: state === 'expired' ? new Error('private-provider-detail') : null,
      });
    const response = await GET(
      new Request('https://app.example.test/auth/confirm?type=recovery&token_hash=synthetic-only'),
    );
    expect(response.headers.get('location')).toBe(
      'https://app.example.test/auth/set-password?error=invalid-recovery',
    );
  },
);
