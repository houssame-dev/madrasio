import { and, eq, inArray } from 'drizzle-orm';
import * as schema from '@school/database';

import type { TeacherAssignmentScope } from '../context';
import type { AuthorizationDb } from './db';

/**
 * Resolves a User's Teacher scope in a School, from the ONLY authoritative
 * source: TeacherAssignment (ADR-009, BR-ROLE-004, BR-TEACHER-002).
 *
 * A user may hold multiple Teacher profiles in one School (no universal
 * profile discriminator); the user's assignments are collected across all of
 * them. Only assignments belonging to the School Context are returned
 * (BR-INTEGRITY-002). Both ACTIVE and ENDED rows are returned with their
 * status so the engine can deny scope on ended assignments (BR-TEACHER-005)
 * while keeping history intact.
 */
export async function resolveTeacherScope(
  db: AuthorizationDb,
  userId: string,
  schoolId: string,
): Promise<TeacherAssignmentScope[]> {
  const teacherRows = await db
    .select({ id: schema.teachers.id })
    .from(schema.teachers)
    .where(and(eq(schema.teachers.userId, userId), eq(schema.teachers.schoolId, schoolId)));

  if (teacherRows.length === 0) {
    return [];
  }

  const assignments = await db
    .select({
      classId: schema.teacherAssignments.classId,
      subjectId: schema.teacherAssignments.subjectId,
      academicYearId: schema.teacherAssignments.academicYearId,
      status: schema.teacherAssignments.status,
    })
    .from(schema.teacherAssignments)
    .where(
      and(
        inArray(
          schema.teacherAssignments.teacherId,
          teacherRows.map((row) => row.id),
        ),
        eq(schema.teacherAssignments.schoolId, schoolId),
      ),
    );

  return assignments;
}