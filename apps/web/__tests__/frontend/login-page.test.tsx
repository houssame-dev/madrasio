import { describe, expect, it, vi } from 'vitest';
import { Children, Fragment, isValidElement } from 'react';
import { LanguageSelector } from '@/components/language/language-selector';
import { LoginForm } from '@/components/auth/login-form';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), redirect: vi.fn() }));

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  const { getCatalog } = await import('@/i18n/catalogs');
  return { getTranslations: async () => createTranslator({ locale: 'en', messages: getCatalog('en'), namespace: 'auth' }) };
});

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/components/auth/login-form', () => ({ LoginForm: function LoginForm() { return null; } }));

import LoginPage, { metadata } from '@/app/login/page';

describe('/login server entry', () => {
  it('keeps metadata locale-neutral across document snapshots', () => {
    expect(metadata).toEqual({ title: { absolute: 'Madrasio' } });
  });
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
    expect(result.type).toBe(Fragment);
    const children = Children.toArray(result.props.children);
    expect(children.some((child) => isValidElement(child) && child.type === LoginForm)).toBe(true);
    const selectorContainer = children.find((child) => isValidElement(child) && child.type === 'div');
    expect(isValidElement<{ children: React.ReactNode }>(selectorContainer) &&
      Children.toArray(selectorContainer.props.children).some((child) => isValidElement(child) && child.type === LanguageSelector)).toBe(true);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
