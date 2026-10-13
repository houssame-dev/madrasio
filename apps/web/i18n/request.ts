import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE } from '@school/shared';
import { getCatalog } from './catalogs';

export default getRequestConfig(async () => ({
  // A1 deliberately ignores cookies, headers and locale overrides. Task 066_04
  // will resolve the authenticated User's authoritative stored preference.
  locale: DEFAULT_LOCALE,
  messages: getCatalog(DEFAULT_LOCALE),
}));
