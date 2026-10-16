import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DocumentPresentation } from '@/components/language/document-presentation';
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
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

import requestConfig from '@/i18n/request';
import RootLayout from '@/app/layout';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';

describe('server request and root layout foundation', () => {
  it('defaults to English without accepting untrusted route locale overrides', async () => {
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
    const document = await RootLayout({ children: child });
    expect(document.type).toBe(DocumentPresentation);
    expect(document.props.initialLocale).toBe('en');
    expect(document.props.children).toBe(child);
    const html = renderToStaticMarkup(document);
    expect(html).toContain('lang="en"');
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('Existing application content');
  });
});
