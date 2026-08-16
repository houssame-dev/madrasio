import type { Role } from './roles';

/**
 * The server-side context object that carries the identity, membership,
 * school and role facts needed during authorization (Task 005 §16).
 *
 * It deliberately stays small — `userId`, `schoolId` (via membership +
 * schoolContext), `membership`, `role`. Large domain objects must NOT be
 * placed inside a global request context; scope/resource data is resolved
 * on demand (see `server/` resolvers) and filled into `scope` when a scope
 * check is requested.
 *
 * - `userId: null` ⇒ the request is unauthenticated.
 * - `membership: null` ⇒ the user has no SchoolMembership for the requested
 *   School Context.
 * - `schoolContext.isValid` is true only when a membership row was resolved
 *   for the requested School.
 * - `role` mirrors the membership role (SUPER_ADMIN / SCHOOL_ADMIN / TEACHER /
 *   PARENT). It is NOT sufficient alone (BR-ROLE-002).
 */
export interface CurrentContext {
  userId: string | null;
  userActive: boolean;
  membership: SchoolMembershipContext | null;
  schoolContext: SchoolContextSummary | null;
  role: Role | null;
  scope: ScopeSummary;
}

export interface SchoolMembershipContext {
  schoolId: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface SchoolContextSummary {
  schoolId: string;
  isValid: boolean;
}

/**
 * Scope facts resolved on demand from the authoritative sources only:
 * - Teacher scope: TeacherAssignment (ADR-009, BR-ROLE-004)
 * - Parent scope: ParentStudent (BR-ROLE-005)
 *
 * Rows carry their lifecycle status so the engine can enforce "ended
 * assignment / ended relationship no longer grants current scope"
 * (BR-TEACHER-005, BR-PARENT-004).
 */
export interface ScopeSummary {
  teacherAssignments: readonly TeacherAssignmentScope[];
  parentStudents: readonly ParentStudentScope[];
}

export interface TeacherAssignmentScope {
  classId: string;
  subjectId: string;
  academicYearId: string;
  status: 'ACTIVE' | 'ENDED';
}

export interface ParentStudentScope {
  studentId: string;
  status: 'ACTIVE' | 'ENDED';
}