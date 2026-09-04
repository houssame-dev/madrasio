import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ browser: vi.fn(() => ({})) }));
vi.mock('@supabase/ssr', () => ({ createBrowserClient: mocks.browser }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  mocks.browser.mockClear();
});

describe('actual Supabase client environment selection', () => {
  it('builds the browser client and resolves server Auth Admin config with modern keys only', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.co');
    vi.stubEnv('SUPABASE_URL', 'https://fixture.supabase.co');
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable-fixture');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'elevated-fixture');
    const { getBrowserSupabase } = await import('@/lib/supabase/browser');
    getBrowserSupabase();
    expect(mocks.browser).toHaveBeenCalledWith('https://fixture.supabase.co', 'publishable-fixture');
    const { getServerEnv } = await import('@/lib/config/env');
    expect(getServerEnv().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe('publishable-fixture');
    expect(getServerEnv().SUPABASE_SECRET_KEY).toBe('elevated-fixture');
    expect(JSON.stringify(mocks.browser.mock.calls)).not.toContain('elevated-fixture');
  });

  it('fails deterministically when the modern browser publishable key is absent', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    await expect(import('@/lib/supabase/browser')).rejects.toThrow();
  });

  it('does not accept a retired browser key alias as configuration', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'retired-public-fixture');
    await expect(import('@/lib/supabase/browser')).rejects.toThrow();
  });

  it('does not accept a retired elevated-key alias when the modern secret is absent', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable-fixture');
    vi.stubEnv('SUPABASE_URL', 'https://fixture.supabase.co');
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/test');
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'retired-elevated-fixture');
    const { getServerEnv } = await import('@/lib/config/env');
    expect(getServerEnv().SUPABASE_SECRET_KEY).toBeUndefined();
  });
});
