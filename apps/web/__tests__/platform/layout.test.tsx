import { NextIntlClientProvider } from 'next-intl';
import { getCatalog } from '@/i18n/catalogs';
import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ForbiddenError, UnauthenticatedError } from '@/lib/errors';
const mocks = vi.hoisted(() => ({ session: vi.fn(), guard: vi.fn(), redirect: vi.fn(), locale: 'en' as 'en' | 'fr' | 'ar' }));
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  const { getCatalog } = await import('@/i18n/catalogs');
  return { getTranslations: async (namespace?: 'platformUi') => createTranslator({ locale: mocks.locale, messages: getCatalog(mocks.locale), namespace }) };
});
vi.mock('@/lib/auth/server-auth', () => ({ getAuthenticatedUserId: mocks.session }));
vi.mock('@/lib/authorization/server/platform', () => ({ requirePlatformAuthority: mocks.guard }));
vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/components/auth/logout-button', () => ({
  LogoutButton: () => <button>Log out</button>,
}));
import PlatformLayout from '@/app/platform/layout';
import { AuthenticatedAccountLifetimeHost } from '@/components/language/account-lifetime-host';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.locale = 'en';
  mocks.session.mockResolvedValue('session-user');
  mocks.guard.mockResolvedValue({ userId: 'session-user' });
  mocks.redirect.mockImplementation(() => {
    throw new Error('redirect');
  });
});
it('server-protects platform children without any School context', async () => {
  render(<NextIntlClientProvider locale="en" messages={getCatalog('en')} timeZone="UTC">{await PlatformLayout({ children: <p>Platform content</p> })}</NextIntlClientProvider>);
  expect(mocks.guard).toHaveBeenCalledWith({}, 'session-user');
  expect(screen.getByText('Platform content')).toBeInTheDocument();
});

it('binds platform operation ownership to the existing server-authorized identity', async () => {
  const layout = await PlatformLayout({ children: <p>Original child</p> });
  expect(layout.type).toBe(AuthenticatedAccountLifetimeHost);
  expect(layout.props.verifiedUserId).toBe('session-user');
  expect(mocks.guard).toHaveBeenCalledWith({}, 'session-user');
});
it('does not render children after platform denial', async () => {
  mocks.guard.mockRejectedValue(new ForbiddenError());
  render(<NextIntlClientProvider locale="en" messages={getCatalog('en')} timeZone="UTC">{await PlatformLayout({ children: <p>Platform content</p> })}</NextIntlClientProvider>);
  expect(screen.queryByText('Platform content')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Access unavailable' })).toBeInTheDocument();
});
it('redirects unauthenticated users to login', async () => {
  mocks.session.mockRejectedValue(new UnauthenticatedError());
  await expect(PlatformLayout({ children: null })).rejects.toThrow('redirect');
  expect(mocks.redirect).toHaveBeenCalledWith('/login');
});

it.each(['en', 'fr', 'ar'] as const)('localizes %s platform navigation after the server authority guard', async (locale) => {
  mocks.locale = locale;
  render(<NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC">{await PlatformLayout({ children: <p>Original child</p> })}</NextIntlClientProvider>);
  expect(mocks.guard).toHaveBeenCalledWith({}, 'session-user');
  expect(screen.getByRole('navigation', { name: getCatalog(locale).platformUi.navigation })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: getCatalog(locale).navigation.items.platformSchools })).toHaveAttribute('href', '/platform/schools');
  expect(screen.getByRole('link', { name: getCatalog(locale).platformUi.workspace })).toHaveAttribute('href', '/dashboard');
});
