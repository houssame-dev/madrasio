export { cn } from './cn';
export { SchoolTimeError, validateSchoolTimezone, calendarDate, isCalendarDate, schoolDateFromInstant, schoolWallTimeToInstant, formatSchoolInstant } from './school-time';

/**
 * Supported application locales.
 *
 * V1 supports Arabic (ar), French (fr), and English (en). Arabic requires RTL
 * direction handling. This contract is shared by server and client code.
 */
export const SUPPORTED_LOCALES = ['ar', 'fr', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function resolveLocale(value: unknown): SupportedLocale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

export function localeDirection(value: unknown): 'ltr' | 'rtl' {
  return resolveLocale(value) === 'ar' ? 'rtl' : 'ltr';
}
