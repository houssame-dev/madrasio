import { SUPPORTED_LOCALES, type SupportedLocale } from '@school/shared';
import { z } from 'zod';

export const updateLanguageSchema = z.object({
  preferredLocale: z.enum(SUPPORTED_LOCALES),
}).strict();

export type UpdateLanguageInput = z.output<typeof updateLanguageSchema>;

export interface UserLanguageRecord {
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  preferredLocale: SupportedLocale | null;
}

export interface LanguagePreferenceDto {
  preferredLocale: SupportedLocale | null;
  effectiveLocale: SupportedLocale;
}

/** Identity is supplied exclusively by the verified server Auth adapter. */
export interface LanguageRepository {
  read(userId: string): Promise<UserLanguageRecord | null>;
  /** Rechecks lifecycle under a row lock; unchanged values do not issue UPDATE. */
  write(userId: string, locale: SupportedLocale): Promise<UserLanguageRecord | null>;
}
