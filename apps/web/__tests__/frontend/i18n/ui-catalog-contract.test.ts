import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { getCatalog } from '@/i18n/catalogs';
import { SUPPORTED_LOCALES } from '@school/shared';

function leaves(value: object, prefix = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === 'string' ? [[path, child]] : Object.entries(leaves(child, path));
  }));
}

// Argument names only: branch wording is free to differ, including Arabic plural categories.
function argumentsIn(message: string): string[] {
  return [...new Set([...message.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\s*(?:,|\})/g)].map((match) => match[1]))].sort();
}

describe('additive public/workspace and domain UI catalogs', () => {
  it('keeps all 2020 keys and ICU argument names aligned in EN/FR/AR', () => {
    const reference = leaves(getCatalog('en'));
    expect(Object.keys(reference)).toHaveLength(2020);
    for (const locale of SUPPORTED_LOCALES) {
      const translated = leaves(getCatalog(locale));
      expect(Object.keys(translated).sort()).toEqual(Object.keys(reference).sort());
      for (const [key, message] of Object.entries(translated)) {
        expect(message.trim(), key).not.toBe('');
        expect(argumentsIn(message), key).toEqual(argumentsIn(reference[key]));
      }
    }
  });

  it.each(SUPPORTED_LOCALES)('formats %s pagination and unread plurals through next-intl', (locale) => {
    const collection = createTranslator({ locale, messages: getCatalog(locale), namespace: 'collection' });
    const badge = createTranslator({ locale, messages: getCatalog(locale), namespace: 'notificationBadge' });
    expect(collection('pageSummary', { page: 2, pages: 4, total: 35 })).not.toMatch(/[{}]/);
    for (const count of [0, 1, 2, 3, 11, 100]) {
      const result = badge('unread', { count });
      expect(result).not.toMatch(/[{}]/);
      expect(result).not.toBe('notificationBadge.unread');
    }
  });

  it.each(SUPPORTED_LOCALES)('formats %s domain interpolation without losing identifiers or decimal text', (locale) => {
    const t = createTranslator({ locale, messages: getCatalog(locale) });
    expect(t('academic.periodsFor', { name: '2026/2027' })).toContain('2026/2027');
    expect(t('grades.scoreAboveMaximum', { maximum: '20.00' })).toContain('20.00');
    expect(t('domainCalculation.missingSubjects', { subjects: 'subject-123' })).toContain('subject-123');
    expect(t('domainUi.handInHint', { timezone: 'Africa/Casablanca' })).toContain('Africa/Casablanca');
    expect(t('domainUi.version', { version: 2 })).not.toMatch(/[{}]/);
    expect(t('teachingDashboard.gradeAction', { subjectName: 'Math', className: '1A' })).toContain('Math');
    for (const count of [0, 1, 2, 3, 11, 100]) {
      expect(t('parentPortal.unreadDescription', { count })).not.toMatch(/[{}]/);
      expect(t('peopleUi.profileCount', { count })).not.toMatch(/[{}]/);
    }
  });
});
