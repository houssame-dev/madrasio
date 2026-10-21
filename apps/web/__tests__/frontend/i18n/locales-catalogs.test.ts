import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isSupportedLocale, localeDirection, resolveLocale } from '@school/shared';
import { getCatalog } from '@/i18n/catalogs';
import { copy, roleLabels } from '@/lib/frontend/copy';
import { navigationItems } from '@/lib/frontend/navigation';

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
    expect(englishKeys).toHaveLength(1527);
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


  it('covers exactly nine static shell messages in every locale', () => {
    const shellKeys = [
      'navigation.open', 'navigation.close', 'navigation.collapse', 'navigation.expand',
      'currentSchool', 'roles.superAdmin', 'roles.schoolAdmin', 'roles.teacher', 'roles.parent',
    ].sort();
    for (const locale of SUPPORTED_LOCALES) {
      const messages = getCatalog(locale).shell;
      expect(keys(messages)).toEqual(shellKeys);
      for (const value of [messages.currentSchool, ...Object.values(messages.navigation),
        ...Object.values(messages.roles)]) {
        expect(value.trim()).not.toBe('');
        expect(value).not.toMatch(/[{}]/);
      }
    }
  });

  it('preserves the exact English shell copy without duplicating existing names', () => {
    expect(getCatalog('en').shell).toEqual({
      navigation: {
        open: copy.openNavigation,
        close: copy.closeNavigation,
        collapse: copy.collapseNavigation,
        expand: copy.expandNavigation,
      },
      currentSchool: copy.currentSchool,
      roles: {
        superAdmin: roleLabels.SUPER_ADMIN,
        schoolAdmin: roleLabels.SCHOOL_ADMIN,
        teacher: roleLabels.TEACHER,
        parent: roleLabels.PARENT,
      },
    });
    expect(getCatalog('en').foundation.appName).toBe(copy.productName);
    expect(getCatalog('en').navigation.landmark).toBe(copy.navigation);
  });

  it('covers exactly eight static shared-state messages in every locale', () => {
    const stateKeys = [
      'loading', 'error.title', 'error.description', 'error.retry',
      'accessDenied.title', 'accessDenied.description',
      'noSchool.title', 'noSchool.description',
    ].sort();
    for (const locale of SUPPORTED_LOCALES) {
      const messages = getCatalog(locale).states;
      expect(keys(messages)).toEqual(stateKeys);
      const values = [messages.loading, ...Object.values(messages.error),
        ...Object.values(messages.accessDenied), ...Object.values(messages.noSchool)];
      for (const value of values) {
        expect(value.trim()).not.toBe('');
        expect(value).not.toMatch(/[{}]/);
      }
    }
  });

  it('preserves all eight shared English defaults', () => {
    expect(getCatalog('en').states).toEqual({
      loading: copy.loadingApplication,
      error: {
        title: copy.requestFailed,
        description: copy.requestFailedDescription,
        retry: copy.tryAgain,
      },
      accessDenied: { title: copy.accessDenied, description: copy.accessDeniedDescription },
      noSchool: { title: copy.noSchool, description: copy.noSchoolDescription },
    });
  });

  it('covers exactly the navigation messages without introducing ICU arguments', () => {
    const navigationKeys = [
      'landmark', 'items.finance', 'items.dashboard', 'items.academic', 'items.students',
      'items.myChildren', 'items.teachers', 'items.parents', 'items.grades', 'items.results',
      'items.attendance', 'items.homework', 'items.announcements',
      'items.schoolAnnouncements', 'items.notifications', 'items.platformSchools', 'items.timetable',
    ].sort();
    for (const locale of SUPPORTED_LOCALES) {
      const messages = getCatalog(locale).navigation;
      expect(keys(messages)).toEqual(navigationKeys);
      for (const value of [messages.landmark, ...Object.values(messages.items)]) {
        expect(value.trim()).not.toBe('');
        expect(value).not.toMatch(/[{}]/);
      }
    }
  });

  it('preserves every English configuration label and navigation landmark', () => {
    const messages = getCatalog('en').navigation;
    for (const item of navigationItems) expect(messages.items[item.labelKey]).toBe(item.label);
    expect(messages.landmark).toBe('Main navigation');
    expect(messages.items.platformSchools).toBe('Platform Schools');
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
