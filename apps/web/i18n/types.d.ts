import type { SupportedLocale } from '@school/shared';
import type { CatalogMessages } from './catalogs';

declare module 'next-intl' {
  interface AppConfig {
    Locale: SupportedLocale;
    Messages: CatalogMessages;
  }
}
