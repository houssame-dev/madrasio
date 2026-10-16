import { z } from 'zod';
import { SUPPORTED_LOCALES, resolveLocale, type SupportedLocale } from '@school/shared';
import { apiRequest } from '@/lib/frontend/api-client';
import type { LanguagePreferenceDto } from '@/lib/modules/user-language/domain/contracts';

const preference = z.object({
  preferredLocale: z.enum(SUPPORTED_LOCALES).nullable(),
  effectiveLocale: z.enum(SUPPORTED_LOCALES),
}).strict().refine((value) => value.effectiveLocale === resolveLocale(value.preferredLocale));

function decode(value: unknown): LanguagePreferenceDto {
  const parsed = preference.safeParse(value);
  if (!parsed.success) throw new Error('Invalid language response.');
  return parsed.data;
}

export interface LanguageTransport {
  read(signal: AbortSignal): Promise<LanguagePreferenceDto>;
  write(locale: SupportedLocale, signal: AbortSignal): Promise<LanguagePreferenceDto>;
}

/** Same-origin authenticated API only. No userId/schoolId parameters, cache or automatic retry. */
export const languageApi: LanguageTransport = {
  async read(signal) {
    const result = await apiRequest<{ data: unknown }>('/api/v1/me/language', { signal, cache: 'no-store' });
    return decode(result.data);
  },
  async write(preferredLocale, signal) {
    const result = await apiRequest<{ data: unknown }>('/api/v1/me/language', {
      method: 'PATCH', body: JSON.stringify({ preferredLocale }), signal, cache: 'no-store',
    });
    return decode(result.data);
  },
};
