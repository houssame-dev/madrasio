import { renderToStaticMarkup } from 'react-dom/server';
import { DocumentPresentation } from '@/components/language/document-presentation';
import { describe, expect, it, vi } from 'vitest';
import { SUPPORTED_LOCALES, type SupportedLocale } from '@school/shared';
import { localeContext } from '@/i18n/locale-context';

const request = vi.hoisted(() => ({ locale: 'en' as SupportedLocale }));
vi.mock('next-intl/server', async () => {
  const { getCatalog } = await import('@/i18n/catalogs');
  return { getLocale: async () => request.locale, getMessages: async () => getCatalog(request.locale) };
});
import RootLayout from '@/app/layout';

describe('prepared document/server/provider locale coherence', () => {
  it.each(SUPPORTED_LOCALES)('derives the actual %s root document and initial provider from the same request locale', async (locale) => {
    request.locale = locale;
    const expected = localeContext(locale);
    const document = await RootLayout({ children: <p>Unchanged child</p> });
    expect(document.type).toBe(DocumentPresentation);
    expect(document.props.initialLocale).toBe(expected.locale);
    const html = renderToStaticMarkup(document);
    expect(html).toContain('lang="' + expected.locale + '"');
    expect(html).toContain('dir="' + expected.document.dir + '"');
  });
  it('never derives a catalog import path from arbitrary locale input', () => {
    for (const value of ['../../secrets', 'de', undefined, 'AR']) {
      expect(localeContext(value)).toEqual(localeContext('en'));
    }
  });
  it.todo('ADMITTED NEXT/AUTH/BROWSER: actual request resolver, server translations, initial provider, hydration and persistent document must agree');
});
