import { getServerSupabase } from '@/lib/supabase/server';

/**
 * Returns the authenticated application User ID for the current request, or
 * null when the request has no valid session.
 *
 * Authentication identity comes from Supabase Auth (ADR-005); the application
 * User ID is the same UUID as `auth.users.id` (ADR-018). No credentials or
 * tokens are handled here — Supabase owns them.
 *
 * This is the first stage of the authorization pipeline ("Authenticated?");
 * authorization decisions (role/scope/ownership) happen in `lib/authorization`.
 */
export async function getSessionUserId(): Promise<string | null> {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}