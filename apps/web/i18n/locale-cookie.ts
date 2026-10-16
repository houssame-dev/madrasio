import { resolveLocale } from '@school/shared';

/** Browser presentation only; never an identity or authorization input. */
export const LOCALE_COOKIE = 'MADRASIO_LOCALE';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const cookieLocale = resolveLocale;
