export { cn } from './cn';

/**
 * Supported application locales.
 *
 * V1 supports Arabic (ar), French (fr), and English (en). Arabic requires RTL
 * direction handling — see `lib/authorization/` notes for context.
 */
export const SUPPORTED_LOCALES = ['ar', 'fr', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
