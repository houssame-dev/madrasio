import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ browser: vi.fn(() => ({})) }));
vi.mock('@supabase/ssr', () => ({ createBrowserClient: mocks.browser }));

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); mocks.browser.mockClear(); });

describe('actual Supabase client environment selection', () => {
  it('builds the browser client and resolves server Auth Admin config with modern keys only', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.co');
    vi.stubEnv('SUPABASE_URL', 'https://fixture.supabase.co');
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable-fixture');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'elevated-fixture');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const { getBrowserSupabase } = await import('@/lib/supabase/browser');
    getBrowserSupabase();
    expect(mocks.browser).toHaveBeenCalledWith('https://fixture.supabase.co', 'publishable-fixture');
    const { getServerEnv } = await import('@/lib/config/env');
    expect(getServerEnv().SUPABASE_ANON_KEY).toBe('publishable-fixture');
    expect(getServerEnv().SUPABASE_SERVICE_ROLE_KEY).toBe('elevated-fixture');
    expect(JSON.stringify(mocks.browser.mock.calls)).not.toContain('elevated-fixture');
  });
});
