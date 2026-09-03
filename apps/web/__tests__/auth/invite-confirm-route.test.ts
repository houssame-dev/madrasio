import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ verifyOtp: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: async () => ({ auth: { verifyOtp: mocks.verifyOtp } }),
}));

import { GET } from '@/app/auth/confirm/route';

describe('invite confirmation route', () => {
  beforeEach(() => { mocks.verifyOtp.mockReset(); });

  it('verifies only an invite token hash and removes it from the redirect URL', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: {} }, error: null });
    const response = await GET(new Request('http://localhost:3000/auth/confirm?token_hash=secret-hash&type=invite&next=https://evil.example'));
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: 'secret-hash', type: 'invite' });
    expect(response.headers.get('location')).toBe('http://localhost:3000/auth/set-password');
    expect(response.headers.get('location')).not.toContain('secret-hash');
    expect(response.headers.get('location')).not.toContain('evil.example');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it.each([
    'http://localhost:3000/auth/confirm?type=invite',
    'http://localhost:3000/auth/confirm?token_hash=value&type=signup',
  ])('rejects malformed or unsupported confirmation input', async (url) => {
    const response = await GET(new Request(url));
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe('http://localhost:3000/auth/set-password?error=invalid-invite');
  });

  it('maps provider rejection to a generic invalid-invite state', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: new Error('provider token detail') });
    const response = await GET(new Request('http://localhost:3000/auth/confirm?token_hash=expired&type=invite'));
    expect(response.headers.get('location')).toBe('http://localhost:3000/auth/set-password?error=invalid-invite');
    expect(response.headers.get('location')).not.toContain('provider');
  });

  it('maps thrown transport failures without exposing internals or caching the token redirect', async () => {
    mocks.verifyOtp.mockRejectedValue(new Error('internal transport detail'));
    const response = await GET(new Request('http://localhost:3000/auth/confirm?token_hash=test-only&type=invite'));
    expect(response.headers.get('location')).toBe('http://localhost:3000/auth/set-password?error=invalid-invite');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});
