import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
  getServerSupabase: vi.fn(),
  verifyOtp: vi.fn(),
}));
vi.mock('@/lib/config/env', () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock('@/lib/supabase/server', () => ({ getServerSupabase: mocks.getServerSupabase }));

import { GET } from '@/app/auth/confirm/route';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getServerEnv.mockReturnValue({ APP_URL: undefined });
  mocks.getServerSupabase.mockResolvedValue({ auth: { verifyOtp: mocks.verifyOtp } });
});

it.each(['unsupported', 'signup', '', null])(
  'rejects unsupported type %s before configuration or provider access',
  async (type) => {
    const url = new URL('https://app.example.test/auth/confirm?next=https://example.test');
    if (type !== null) url.searchParams.set('type', type);
    const response = await GET(new Request(url));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('/auth/set-password?error=invalid-invite');
    expect(response.headers.get('location')).not.toContain('example.test');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(mocks.getServerSupabase).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  },
);

it.each(['https://evil.example', '//evil.example', '%2F%2Fevil.example'])(
  'ignores redirect input and untrusted headers for unsupported types (%s)',
  async (next) => {
    const response = await GET(new Request(
      `https://untrusted.example/auth/confirm?type=unsupported&token_hash=synthetic-only&next=${next}&redirectTo=${next}`,
      { headers: { host: 'evil.example', 'x-forwarded-host': 'evil.example' } },
    ));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('/auth/set-password?error=invalid-invite');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(mocks.getServerSupabase).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  },
);

it.each(['invite', 'recovery'])(
  'keeps canonical origin mandatory for supported type %s',
  async (type) => {
    await expect(GET(new Request(
      `https://untrusted.example/auth/confirm?type=${type}&token_hash=synthetic-only&next=https://evil.example`,
    ))).rejects.toThrow('Recovery origin is not configured.');
    expect(mocks.getServerEnv).toHaveBeenCalledOnce();
    expect(mocks.getServerSupabase).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  },
);
