/**
 * Current-school selector storage (Task 014 §9/§10).
 *
 * The current School Context is a server-managed, HTTP-only cookie containing
 * ONLY the selected `school_id`. The cookie is a SELECTOR, never proof of
 * authorization: every request re-validates it against the authenticated user's
 * ACTIVE SchoolMemberships (Task 014 §18/§32).
 *
 * Security properties:
 * - HTTP-only, SameSite=Lax (same-site application), Secure in production,
 *   path `/`, max-age 0 on clear.
 * - Only the school identifier is stored. Role/permissions/membership status
 *   are NEVER stored in the cookie (Task 014 §9).
 * - Malformed/stale values are normalized to null on read (Task 014 §19) and
 *   are additionally validated against the membership table before use.
 */

import { cookies } from 'next/headers';

export const CURRENT_SCHOOL_COOKIE = 'sms_current_school';

const SCHOOL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normalizes a raw cookie value to a valid UUID school id, or null when it is
 * absent/malformed. Pure helper kept here so the cookie boundary stays thin.
 */
export function normalizeSchoolSelector(value: string | undefined | null): string | null {
  return value && SCHOOL_ID_PATTERN.test(value) ? value : null;
}

function currentSchoolCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

/** Reads the currently selected School id, or null when absent/malformed. */
export async function readSelectedSchoolId(): Promise<string | null> {
  const store = await cookies();
  return normalizeSchoolSelector(store.get(CURRENT_SCHOOL_COOKIE)?.value);
}

/** Persists the selected School id. Callers MUST validate the membership first. */
export async function writeSelectedSchoolId(schoolId: string): Promise<void> {
  const store = await cookies();
  store.set(CURRENT_SCHOOL_COOKIE, schoolId, currentSchoolCookieOptions());
}

/**
 * Clears the current-school selector. The application logout flow must also
 * call this so a stale selector never survives a session change (Task 014 §29).
 */
export async function clearSelectedSchoolId(): Promise<void> {
  const store = await cookies();
  store.set(CURRENT_SCHOOL_COOKIE, '', { ...currentSchoolCookieOptions(), maxAge: 0 });
}