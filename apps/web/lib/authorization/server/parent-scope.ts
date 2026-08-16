import { and, eq, inArray } from 'drizzle-orm';
import * as schema from '@school/database';

import type { ParentStudentScope } from '../context';
import type { AuthorizationDb } from './db';

/**
 * Resolves a User's Parent scope in a School, from the ONLY authoritative
 * source: ParentStudent (BR-ROLE-005, BR-PARENT-002).
 *
 * A user may hold multiple Parent profiles in one School; relationships are
 * collected across all of them. Only relationships belonging to the School
 * Context are returned (BR-INTEGRITY-002). Both ACTIVE and ENDED rows are
 * returned with their status so the engine can deny access on ended
 * relationships (BR-PARENT-004) while keeping history intact.
 *
 * The "relevant StudentEnrollment / academic context" refinement (e.g. only
 * the child's current academic year) is a module-level policy layered on top
 * of this relationship foundation in later tasks (domain-model §28).
 */
export async function resolveParentScope(
  db: AuthorizationDb,
  userId: string,
  schoolId: string,
): Promise<ParentStudentScope[]> {
  const parentRows = await db
    .select({ id: schema.parents.id })
    .from(schema.parents)
    .where(and(eq(schema.parents.userId, userId), eq(schema.parents.schoolId, schoolId)));

  if (parentRows.length === 0) {
    return [];
  }

  const relationships = await db
    .select({
      studentId: schema.parentStudents.studentId,
      status: schema.parentStudents.status,
    })
    .from(schema.parentStudents)
    .where(
      and(
        inArray(
          schema.parentStudents.parentId,
          parentRows.map((row) => row.id),
        ),
        eq(schema.parentStudents.schoolId, schoolId),
      ),
    );

  return relationships;
}