import { defaultSessionResolver } from './server-auth';

/**
 * Returns the authenticated application User ID for the current request, or
 * null when the request has no valid session.
 *
 * This is the null-tolerant variant used by existing routes (Task 014 §2/§3).
 * Authentication identity comes from Supabase Auth (ADR-005); the application
 * User ID is the same UUID as `auth.users.id` (ADR-018). The throwing variants
 * and the full Current Context resolution live in `./server-auth` and
 * `./current-context` / `./require-context`.
 */
export async function getSessionUserId(): Promise<string | null> {
  const user = await defaultSessionResolver();
  return user?.id ?? null;
}