/**
 * Authorization helpers for the Announcements publish use case (Task 011).
 *
 * Every protected Announcement operation runs the canonical server-side
 * pipeline (PRD.md §15) via `lib/authorization/server`. This helper adapts
 * the driver-agnostic `AnnouncementsDb` to the `AuthorizationDb` surface (the
 * same cast pattern used by the grades/notifications test helpers and the
 * grades `requireResultOperation`).
 *
 * PUBLISH GATE (BR-ANNOUNCEMENT-006/007): the base gate requires the
 * `announcements.publish` permission with a SCHOOL-scoped operation — a valid
 * ACTIVE SchoolMembership + School Context is mandatory. The resolved context
 * is returned so the use case can enforce the second part of
 * BR-ANNOUNCEMENT-006 (appropriate academic scope) AFTER loading the Version's
 * targets:
 *
 * - A TEACHER may only publish CLASS targets whose Class belongs to one of
 *   their CURRENT ACTIVE TeacherAssignments (ADR-009 / BR-TEACHER-002) for the
 *   target's AcademicYear, and may never publish a SCHOOL-wide target (a
 *   School-wide audience is beyond a Teacher's academic scope — the permission
 *   alone never grants it, BR-ROLE-002).
 * - A SCHOOL_ADMIN / SUPER_ADMIN acts with School-wide scope and is not
 *   subject to the Class-level restriction.
 */

import type { CurrentContext } from '@/lib/authorization/context';
import { denialToError } from '@/lib/authorization/facade';
import { evaluateAuthorization } from '@/lib/authorization/pipeline';
import type { Permission } from '@/lib/authorization/permissions';
import { resolveCurrentContext, resolveTeacherScope, type AuthorizeInput, type AuthorizationDb } from '@/lib/authorization/server';
import { ForbiddenError } from '@/lib/errors';

import type { AnnouncementTargetRow } from '../infrastructure/repositories/announcement-repository';
import type { AnnouncementsDb } from '../infrastructure/repositories/announcement-repository';

/** The authorization facts the publish use case needs after the gate. */
export interface AnnouncementPublishAuthorization {
  role: CurrentContext['role'];
  /** CURRENT ACTIVE TeacherAssignments, resolved only for a TEACHER publisher. */
  teacherAssignments: Awaited<ReturnType<typeof resolveTeacherScope>>;
}

export async function requireAnnouncementOperation(
  db: AnnouncementsDb,
  input: AuthorizeInput,
  permission: Permission,
): Promise<AnnouncementPublishAuthorization> {
  const context = await resolveCurrentContext(db as unknown as AuthorizationDb, input);
  const decision = evaluateAuthorization(context, { permission });
  if (!decision.allowed) throw denialToError(decision);
  const teacherAssignments = context.role === 'TEACHER' && context.userId && context.schoolContext
    ? await resolveTeacherScope(db as unknown as AuthorizationDb, context.userId, context.schoolContext.schoolId)
    : [];
  return { role: context.role, teacherAssignments };
}

/**
 * Runs the school-scoped publish gate and returns the authorization facts.
 * Throws the mapped denial error (401/403) on denial.
 */
export async function requireAnnouncementPublishOperation(
  db: AnnouncementsDb,
  input: AuthorizeInput,
  permission: Permission = 'announcements.publish',
): Promise<AnnouncementPublishAuthorization> {
  return requireAnnouncementOperation(db, input, permission);
}

/**
 * Enforces the academic-scope half of BR-ANNOUNCEMENT-006 against the
 * Version's targets once they are loaded. Only relevant for a TEACHER
 * publisher: every CLASS target must be covered by a CURRENT ACTIVE
 * TeacherAssignment for the target's AcademicYear, and SCHOOL-wide targets are
 * out of a Teacher's scope. Throws ForbiddenError (403) on violation.
 */
export function assertTeacherPublicationScope(
  auth: AnnouncementPublishAuthorization,
  targets: AnnouncementTargetRow[],
): void {
  if (auth.role !== 'TEACHER') {
    return;
  }
  for (const target of targets) {
    if (target.targetType === 'SCHOOL') {
      throw new ForbiddenError('Teachers may only publish to classes they are currently assigned to.');
    }
    if (target.classId === null) {
      continue;
    }
    const covered = auth.teacherAssignments.some(
      (assignment) =>
        assignment.status === 'ACTIVE' &&
        assignment.classId === target.classId &&
        assignment.academicYearId === target.academicYearId,
    );
    if (!covered) {
      throw new ForbiddenError('Teachers may only publish to classes they are currently assigned to.');
    }
  }
}
