import type { Permission } from './permissions';

/**
 * What an operation asks the authorization pipeline for (Task 005 §9).
 *
 * Every stage except authentication/identity is OPTIONAL: an operation only
 * specifies the stages it needs, and the pipeline evaluates only those.
 * Examples:
 * - school-scoped read: `{ permission: 'students.read' }`
 * - teacher grade entry: `{ permission: 'grades.enter', scope: { kind: 'teacher', ... } }`
 * - parent read of one child: `{ permission: 'grades.read', scope: { kind: 'parent', ... } }`
 * - publish result: `{ permission: 'grades.publish', ownership: {...}, resourceState: {...} }`
 */
export interface AuthorizationRequirements {
  permission?: Permission;
  scope?: ScopeRequirement;
  ownership?: OwnershipRequirement;
  resourceState?: ResourceStateRequirement;
}

/**
 * Academic scope requirement (Task 005 §10/§11).
 *
 * - `teacher` — Teacher scope over (Class, Subject, AcademicYear), granted
 *   exclusively by an ACTIVE TeacherAssignment.
 * - `teacherClass` — Teacher scope over (Class, AcademicYear), granted when at
 *   least one ACTIVE TeacherAssignment covers that Class/year. This is used by
 *   subject-independent domains such as daily Attendance.
 * - `parent`  — Parent scope over a Student, granted exclusively by an ACTIVE
 *   ParentStudent relationship.
 * - `school`  — the operation is School-scoped; a valid School Context is
 *   enough (already validated earlier in the pipeline).
 */
export type ScopeRequirement =
  | { kind: 'teacher'; classId: string; subjectId: string; academicYearId: string }
  | { kind: 'teacherClass'; classId: string; academicYearId: string }
  | { kind: 'parent'; studentId: string }
  | { kind: 'school' };

/**
 * Ownership / relationship facts for a specific resource (Task 005 §13).
 * The module resolves these against its own data and passes the resolved
 * facts in — the engine enforces them in canonical order without hard-coding
 * every future entity (explicit, composable policies).
 */
export interface OwnershipRequirement {
  /** Whether the current user is the owner of the resource. */
  isOwner?: boolean;
  /** Whether the current user holds the required relationship to the resource. */
  hasRelationship?: boolean;
}

/**
 * Resource-state gate (Task 005 §14, BR-AUTHZ-006).
 * `allows` is resolved by the owning module's policy (e.g. Gradebook OPEN
 * allows `grades.enter`; CLOSED does not). The foundation only enforces it.
 */
export interface ResourceStateRequirement {
  allows: boolean;
}
