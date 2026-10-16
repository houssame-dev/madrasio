// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPresentationLocale } from '@/i18n/actions';
import requestConfig from '@/i18n/request';
import { cookieLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from '@/i18n/locale-cookie';
import { getCatalog } from '@/i18n/catalogs';

// Vitest does not set React's server condition. Use the installed RSC entry,
// as the existing server-layout suite does, rather than its client-only stub.
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  cache: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock('next-intl/server', () =>
  vi.importActual<typeof import('next-intl/server')>(
    '../../../node_modules/next-intl/dist/esm/development/server.react-server.js',
  ),
);

const store = vi.hoisted(() => ({ value: undefined as string | undefined, set: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => store.value === undefined ? undefined : { value: store.value }, set: store.set }) }));
afterEach(() => { store.value = undefined; store.set.mockReset(); vi.unstubAllEnvs(); });
describe('validated presentation cookie', () => {
  it.each([undefined, '', 'es', 'EN', '../ar', '<script>'])('falls back to English for %s', (value) => expect(cookieLocale(value)).toBe('en'));
  it.each(['en', 'fr', 'ar'] as const)('uses %s for request locale and matching messages', async (locale) => {
    store.value = locale;
    const config = await requestConfig({ requestLocale: Promise.resolve(undefined) });
    expect(config).toMatchObject({ locale, messages: getCatalog(locale), timeZone: 'UTC' });
  });
  it.each(['es', '', null, {}, 'fr; Path=/'])('rejects unsupported writes %s without setting a cookie', async (value) => {
    await expect(setPresentationLocale(value)).rejects.toThrow('Unsupported language'); expect(store.set).not.toHaveBeenCalled();
  });
  it('sets a persistent HttpOnly host-only secure production cookie', async () => {
    vi.stubEnv('NODE_ENV', 'production'); await setPresentationLocale('ar');
    expect(store.set).toHaveBeenCalledWith(LOCALE_COOKIE, 'ar', { path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: LOCALE_COOKIE_MAX_AGE });
  });
  it('permits local HTTP development without weakening the production cookie', async () => {
    vi.stubEnv('NODE_ENV', 'development'); await setPresentationLocale('fr');
    expect(store.set).toHaveBeenCalledWith(LOCALE_COOKIE, 'fr', expect.objectContaining({ secure: false, httpOnly: true }));
  });
});
