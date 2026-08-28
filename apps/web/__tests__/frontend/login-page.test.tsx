import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), redirect: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/components/auth/login-form', () => ({ LoginForm: function LoginForm() { return null; } }));

import LoginPage from '@/app/login/page';

describe('/login server entry', () => {
  it('redirects an authenticated Supabase user to the fixed internal dashboard route', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'auth-user' } } });
    mocks.redirect.mockImplementation(() => { throw Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT' }); });

    await expect(LoginPage()).rejects.toMatchObject({ digest: 'NEXT_REDIRECT' });
    expect(mocks.redirect).toHaveBeenCalledWith('/dashboard');
  });

  it('keeps login publicly reachable for an anonymous visitor', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    mocks.redirect.mockReset();

    const result = await LoginPage();
    expect(result.type.name).toBe('LoginForm');
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
