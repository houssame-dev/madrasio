import { resolveLocale, type SupportedLocale } from '@school/shared';
import en from './messages/en';
import fr from './messages/fr';
import ar from './messages/ar';

type MessageShape<T> = {
  [Key in keyof T]: T[Key] extends string ? string : MessageShape<T[Key]>;
};

/** English defines the key schema; every supported catalog must match it. */
export type Messages = MessageShape<typeof en>;

const catalogs = { en, fr, ar } satisfies Record<SupportedLocale, Messages>;

/** Runtime catalogs retain their ICU literals, including required arguments.
 * The union accepts every approved translation, not just English wording.
 */
export type CatalogMessages = (typeof catalogs)[SupportedLocale];

/** Static allowlist: unsupported input never becomes an import path. */
export function getCatalog(value: unknown): CatalogMessages {
  return catalogs[resolveLocale(value)];
}
