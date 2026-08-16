import { and, eq } from 'drizzle-orm';
import * as schema from '@school/database';

import type { CurrentContext } from '../context';
import type { AuthorizationDb } from './db';

export interface ResolveContextInput {
  /** Authenticated User ID (Supabase Auth session, ADR-018 shared UUID). */
  userId: string | null;
  /** The School the request asks to operate in — never trusted alone. */
  schoolId: string | null;
}

/**
 * Resolves the server-side Current Context (Task 005 §2/§3/§16).
 *
 * A School Context is valid only when the user is authenticated AND holds a
 * SchoolMembership for that School. A client-provided `schoolId` alone is
 * never sufficient (BR-GLOBAL-006, BR-AUTHZ-009). A user with membership in
 * School A who asks for School B gets no membership → the pipeline denies.
 *
 * The membership row carries role + status; inactive memberships are kept in
 * the context so the pipeline reports INACTIVE_MEMBERSHIP (historical rows
 * are never deleted — BR-SCHOOL/BR-AUTH-005). Scope facts are intentionally
 * NOT loaded here; they are resolved on demand (`resolveTeacherScope` /
 * `resolveParentScope`) only when an operation needs a scope check.
 */
export async function resolveCurrentContext(
  db: AuthorizationDb,
  input: ResolveContextInput,
): Promise<CurrentContext> {
  const empty = emptyContext();

  if (!input.userId || !input.schoolId) {
    return empty;
  }

  const [membership] = await db
    .select({
      schoolId: schema.schoolMemberships.schoolId,
      status: schema.schoolMemberships.status,
      role: schema.schoolMemberships.role,
    })
    .from(schema.schoolMemberships)
    .where(
      and(
        eq(schema.schoolMemberships.userId, input.userId),
        eq(schema.schoolMemberships.schoolId, input.schoolId),
      ),
    )
    .limit(1);

  if (!membership) {
    // The user is authenticated (session identity) but holds no membership for
    // the requested School. Keep the identity so the pipeline reports
    // NO_MEMBERSHIP instead of UNAUTHENTICATED; the school context stays
    // invalid (BR-AUTHZ-009).
    return {
      userId: input.userId,
      userActive: true,
      membership: null,
      schoolContext: null,
      role: null,
      scope: { teacherAssignments: [], parentStudents: [] },
    };
  }

  return {
    userId: input.userId,
    // The membership FK (and its existence) proves the application User row
    // exists. The current schema has no User-level status source, so an
    // existing user is treated as active; the USER_INACTIVE stage is still
    // supported by the engine for contexts built with an inactive flag.
    userActive: true,
    membership: { schoolId: membership.schoolId, status: membership.status },
    schoolContext: { schoolId: membership.schoolId, isValid: true },
    role: membership.role,
    scope: { teacherAssignments: [], parentStudents: [] },
  };
}

function emptyContext(): CurrentContext {
  return {
    userId: null,
    userActive: false,
    membership: null,
    schoolContext: null,
    role: null,
    scope: { teacherAssignments: [], parentStudents: [] },
  };
}