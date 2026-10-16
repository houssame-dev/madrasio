'use server';

import { cookies } from 'next/headers';
import { isSupportedLocale } from '@school/shared';
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from './locale-cookie';

/** Next Server Actions enforce same-origin mutations; no Auth or database access. */
export async function setPresentationLocale(value: unknown): Promise<void> {
  if (!isSupportedLocale(value)) throw new Error('Unsupported language.');
  const store = await cookies();
  store.set(LOCALE_COOKIE, value, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: LOCALE_COOKIE_MAX_AGE,
  });
}
