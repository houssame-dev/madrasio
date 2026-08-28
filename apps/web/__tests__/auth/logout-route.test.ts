import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ signOut: vi.fn(), clearSelectedSchoolId: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: async () => ({ auth: { signOut: mocks.signOut } }),
}));
vi.mock('@/lib/auth/current-school', () => ({ clearSelectedSchoolId: mocks.clearSelectedSchoolId }));

import * as logoutRoute from '@/app/api/v1/auth/logout/route';

describe('POST /api/v1/auth/logout', () => {
  beforeEach(() => {
    mocks.signOut.mockReset();
    mocks.clearSelectedSchoolId.mockReset();
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.clearSelectedSchoolId.mockResolvedValue(undefined);
  });

  it('does not expose a state-changing GET handler', () => {
    expect('GET' in logoutRoute).toBe(false);
  });

  it('signs out the current Supabase session and clears the school selector', async () => {
    const response = await logoutRoute.POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { signedOut: true } });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mocks.clearSelectedSchoolId).toHaveBeenCalledOnce();
    expect(mocks.signOut.mock.invocationCallOrder[0]).toBeLessThan(mocks.clearSelectedSchoolId.mock.invocationCallOrder[0]);
  });

  it('is idempotent when Supabase reports an already-absent local session', async () => {
    const response = await logoutRoute.POST();

    expect(response.status).toBe(200);
    expect(mocks.clearSelectedSchoolId).toHaveBeenCalledOnce();
  });

  it('returns a controlled error and does not claim success when sign-out fails', async () => {
    mocks.signOut.mockResolvedValue({ error: new Error('sensitive provider detail') });

    const response = await logoutRoute.POST();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Logout could not be completed.' } });
    expect(mocks.clearSelectedSchoolId).toHaveBeenCalledOnce();
  });
});
