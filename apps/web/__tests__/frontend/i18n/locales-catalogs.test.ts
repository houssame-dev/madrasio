import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isSupportedLocale, localeDirection, resolveLocale } from '@school/shared';
import { getCatalog } from '@/i18n/catalogs';

function keys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === 'string' ? [path] : keys(child, path);
  }).sort();
}

describe('shared locale and catalog contract', () => {
  it('supports exactly the three approved locales and defaults to English', () => {
    expect([...SUPPORTED_LOCALES].sort()).toEqual(['ar', 'en', 'fr']);
    expect(DEFAULT_LOCALE).toBe('en');
    for (const locale of SUPPORTED_LOCALES) expect(isSupportedLocale(locale)).toBe(true);
  });

  it.each(['de', 'en-US', 'EN', '../../secrets', '__proto__', '', null, undefined, 12, {}])(
    'falls back safely for unsupported input %j', (value) => {
      expect(isSupportedLocale(value)).toBe(false);
      expect(resolveLocale(value)).toBe('en');
      expect(getCatalog(value)).toEqual(getCatalog('en'));
      expect(localeDirection(value)).toBe('ltr');
    },
  );

  it.each([['en', 'ltr'], ['fr', 'ltr'], ['ar', 'rtl']] as const)(
    'maps %s to %s', (locale, direction) => expect(localeDirection(locale)).toBe(direction),
  );

  it('has identical, non-empty keys in all catalogs', () => {
    const englishKeys = keys(getCatalog('en'));
    expect(englishKeys).toHaveLength(6);
    for (const locale of SUPPORTED_LOCALES) {
      expect(keys(getCatalog(locale))).toEqual(englishKeys);
      const t = createTranslator({ locale, messages: getCatalog(locale), namespace: 'foundation' });
      expect(t.has('appName')).toBe(true);
      expect(t.has('greeting')).toBe(true);
      for (const key of ['save', 'cancel', 'close', 'retry'] as const) {
        expect(t(`actions.${key}`).trim()).not.toBe('');
      }
    }
  });

  it.each([
    ['en', 'Save', 'Hello, Sam!'],
    ['fr', 'Enregistrer', 'Bonjour, Sam !'],
    ['ar', 'حفظ', 'مرحبًا، Sam!'],
  ] as const)('looks up and interpolates real %s messages', (locale, save, greeting) => {
    const t = createTranslator({ locale, messages: getCatalog(locale), namespace: 'foundation' });
    expect(t('appName')).toBe('Madrasio');
    expect(t('actions.save')).toBe(save);
    expect(t('greeting', { name: 'Sam' })).toBe(greeting);
    expect(t('greeting', { name: '{actions.save}' })).toContain('{actions.save}');
  });

  it('supports future ICU plural catalogs without another runtime', () => {
    const t = createTranslator({ locale: 'en', messages: {
      items: '{count, plural, =0 {No items} one {# item} other {# items}}',
    } });
    expect(t('items', { count: 0 })).toBe('No items');
    expect(t('items', { count: 1 })).toBe('1 item');
    expect(t('items', { count: 3 })).toBe('3 items');
  });
});
