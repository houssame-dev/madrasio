import { DEFAULT_LOCALE, isSupportedLocale, localeDirection, resolveLocale } from '@school/shared';
import { getCatalog } from './catalogs';

/** One immutable presentation snapshot; not an authorization decision or preference authority. */
export function localeContext(value: unknown) {
  const locale = resolveLocale(value);
  return { locale, messages: getCatalog(locale), document: { lang: locale, dir: localeDirection(locale) } };
}

export function authenticatedLocaleContext(userId: string, stored: unknown) {
  return {
    ...localeContext(stored),
    userId,
    preferredLocale: stored === null ? null : isSupportedLocale(stored) ? stored : undefined,
    preferenceState: stored === null ? 'unset' as const : isSupportedLocale(stored) ? 'explicit' as const : 'unsupported' as const,
  };
}

export function anonymousLocaleContext() {
  return { ...localeContext(DEFAULT_LOCALE), userId: null, preferredLocale: null, preferenceState: 'anonymous' as const };
}
