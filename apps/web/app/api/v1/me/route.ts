/**
 * GET /api/v1/me (Task 014 §16).
 *
 * Thin authenticated endpoint returning the safe current-user payload: identity
 * (auth-derived), the resolved current School Context, and the ACTIVE
 * memberships usable as a V1 school selector.
 *
 * The route only resolves identity + context; authorization decisions are never
 * made here. The client is never trusted for userId/role/status — everything is
 * derived server-side from the Supabase session and `public.users` +
 * `school_memberships` (Task 014 §1/§3/§8).
 *
 * Behavior:
 * - No valid session → 401 UNAUTHENTICATED.
 * - Auth identity without an application User row → 403
 *   APPLICATION_USER_NOT_FOUND (provisioning state; never auto-created).
 * - Application User globally SUSPENDED/DISABLED → 403 USER_INACTIVE (never an
 *   operational School Context, even with ACTIVE memberships — Task 014.1 §7).
 * - Authenticated with zero ACTIVE memberships → `currentSchool: null`,
 *   `memberships: []` — NOT unauthenticated (Task 014 §21).
 * - Multiple ACTIVE memberships with no valid selection → `currentSchool: null`
 *   (selection required) — the endpoint itself never throws
 *   SCHOOL_CONTEXT_REQUIRED; that is reserved for school-scoped operations.
 */

import { toApiErrorResponse } from '@/lib/api/errors';
import { resolveMeContext, toMeResponse } from '@/lib/api/me';
import { readSelectedSchoolId } from '@/lib/auth/current-school';
import { getAuthenticatedUserId } from '@/lib/auth/server-auth';
import { getDb } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const db = getDb();
    const userId = await getAuthenticatedUserId();
    const selectedSchoolId = await readSelectedSchoolId();
    const resolution = await resolveMeContext(db, userId, selectedSchoolId);
    return Response.json({ data: toMeResponse(resolution) });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}