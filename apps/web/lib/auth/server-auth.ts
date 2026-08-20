/**
 * Server-side Supabase Auth session resolution (Task 014 §2/§3).
 *
 * Supabase Auth is the authoritative identity provider (ADR-005). The server
 * resolves the authenticated auth User from the request session — the client is
 * NEVER trusted to supply userId/role/permissions/membership status.
 *
 * `public.users.id` is the SAME UUID as `auth.users.id` (ADR-018). No identity
 * mapping table exists. The application User resolution (`resolveUserContext`
 * in `current-context.ts`) loads `public.users` by that id and returns a
 * controlled `APPLICATION_USER_NOT_FOUND` when the row is missing — the server
 * never auto-creates application users during protected requests (§33).
 *
 * This file owns only IDENTITY. Authorization (role/membership/school/scope)
 * happens in `lib/authorization` and `lib/auth/current-context`.
 */

import { getServerSupabase } from '@/lib/supabase/server';
import { UnauthenticatedError } from '@/lib/errors';

/** Resolves the authenticated auth User, or null when there is no valid session. */
export type SessionResolver = () => Promise<{ id: string } | null>;

/**
 * The default resolver: verifies the Supabase server session via
 * `auth.getUser()` (the authoritative server-side operation — no custom JWT
 * decoding). Returns the auth User id, which is the application User id
 * (ADR-018).
 */
export const defaultSessionResolver: SessionResolver = async () => {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user ? { id: data.user.id } : null;
};

/**
 * Returns the authenticated auth User, or throws `UnauthenticatedError` (401)
 * when no valid session exists. `resolver` is injectable for tests.
 */
export async function getAuthenticatedUser(
  resolver: SessionResolver = defaultSessionResolver,
): Promise<{ id: string }> {
  const user = await resolver();
  if (!user) {
    throw new UnauthenticatedError();
  }
  return user;
}

/** Convenience: the authenticated application User id (throws 401 when absent). */
export async function getAuthenticatedUserId(
  resolver: SessionResolver = defaultSessionResolver,
): Promise<string> {
  return (await getAuthenticatedUser(resolver)).id;
}