/**
 * POST /api/v1/me/current-school (Task 014 §18/§19).
 *
 * Selects the current School Context. The request carries ONLY `schoolId`
 * (Zod-validated UUID). Role, permission, and membership status are NEVER
 * accepted from the client — the server derives them from the ACTIVE
 * SchoolMembership row for the requested School.
 *
 * Server behavior:
 * 1. resolve authenticated User (Supabase session)
 * 2. enforce global User lifecycle FIRST — a SUSPENDED/DISABLED User is denied
 *    (403 USER_INACTIVE) even when the requested membership is ACTIVE
 *    (Task 014.1 §8)
 * 3. load/verify the SchoolMembership for `schoolId` and require it ACTIVE
 *    (inactive/foreign/nonexistent → 403 INVALID_SCHOOL_CONTEXT)
 * 4. persist the selected `school_id` in the server-managed HTTP-only cookie
 * 5. return the new current context (/me payload)
 *
 * The cookie is only a selector — every subsequent request re-validates it
 * against the membership table (Task 014 §9/§18/§32).
 */

import { z } from 'zod';

import { toApiErrorResponse } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/errors';
import { toMeResponse } from '@/lib/api/me';
import { writeSelectedSchoolId } from '@/lib/auth/current-school';
import { resolveUserContext, selectCurrentSchool } from '@/lib/auth/current-context';
import { getAuthenticatedUserId } from '@/lib/auth/server-auth';
import { getDb } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  schoolId: z.string().uuid(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await parseBody(request, bodySchema);
    const db = getDb();
    const userId = await getAuthenticatedUserId();

    const membership = await selectCurrentSchool(db, { userId, schoolId: body.schoolId });
    await writeSelectedSchoolId(membership.schoolId);

    const resolution = await resolveUserContext(db, { userId, selectedSchoolId: membership.schoolId });
    return Response.json({ data: toMeResponse(resolution) });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}