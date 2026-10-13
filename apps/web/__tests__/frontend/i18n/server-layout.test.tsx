import { isValidElement } from 'react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { Providers } from '@/app/providers';
import { getCatalog } from '@/i18n/catalogs';

// Vitest runs outside RSC. Load the real pinned server implementation and supply
// React's request-cache boundary locally; do not mock translation results.
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  cache: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock('next-intl/server', () =>
  vi.importActual<typeof import('next-intl/server')>(
    '../../../node_modules/next-intl/dist/esm/development/server.react-server.js',
  ),
);
// The Next plugin supplies this alias in production. Resolve it lazily here
// to avoid a cycle while request.ts imports getRequestConfig.
vi.mock('next-intl/config', () => ({
  default: async (params: Parameters<typeof import('@/i18n/request').default>[0]) =>
    (await import('@/i18n/request')).default(params),
}));
vi.mock('next/headers', () => ({ headers: vi.fn(() => { throw new Error('A1 must not read locale headers'); }) }));

import requestConfig from '@/i18n/request';
import RootLayout from '@/app/layout';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';

describe('server request and root layout foundation', () => {
  it('keeps English authoritative without reading untrusted request locale', async () => {
    const configuration = await requestConfig({
      locale: 'ar',
      get requestLocale(): Promise<string> { throw new Error('Untrusted locale was read'); },
    });
    expect(configuration.locale).toBe('en');
    expect(configuration.messages).toEqual(getCatalog('en'));
  });

  it('provides real server translations and interpolation from request config', async () => {
    expect(await getLocale()).toBe('en');
    expect(await getMessages()).toEqual(getCatalog('en'));
    const t = await getTranslations('foundation');
    expect(t('actions.cancel')).toBe('Cancel');
    expect(t('greeting', { name: 'Sam' })).toBe('Hello, Sam!');
  });

  it('composes a single intl provider with Query and matching initial HTML', async () => {
    const child = <p>Existing application content</p>;
    const html = await RootLayout({ children: child });
    expect(html.type).toBe('html');
    expect(html.props).toMatchObject({ lang: 'en', dir: 'ltr' });
    const body = html.props.children;
    const intl = body.props.children;
    expect(intl.type).toBe(NextIntlClientProvider);
    expect(intl.props.locale).toBe('en');
    expect(intl.props.messages).toEqual(await getMessages());
    expect(isValidElement(intl)).toBe(true);
    const query = intl.props.children as ReactElement<{ children: ReactElement }>;
    expect(query.type).toBe(Providers);
    expect(query.props.children).toBe(child);
  });
});
