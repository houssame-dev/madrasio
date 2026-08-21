import type { Role } from './roles';

/**
 * Stable permission identifiers.
 *
 * Task 005 establishes the permission MECHANISM, not the final V1 matrix.
 * Only the minimal set needed to demonstrate the foundation is defined here;
 * the full module-by-module matrix is a product decision for later tasks
 * (CLAUDE.md §5, Task 005 §5). The identifiers are kept stable so modules can
 * reference them without literals.
 *
 * Naming convention: `<module>.<action>` with read / enter / manage / publish
 * granularity where the domain needs it.
 */
export const PERMISSIONS = [
  'school.read',
  'academic_structure.read',
  'academic_structure.manage',
  'students.read',
  'students.manage',
  'teachers.read',
  'teachers.manage',
  'grades.read',
  'grades.enter',
  'grades.manage',
  'grades.publish',
  'attendance.read',
  'attendance.manage',
  'homework.read',
  'homework.manage',
  'announcements.read',
  'announcements.create',
  'announcements.publish',
  'notifications.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Centralized, deterministic Role → Permission mapping (CLAUDE.md §6).
 *
 * This is the ONLY place role→permission decisions live; the authorization
 * engine consumes it and React never re-implements it.
 *
 * FOUNDATION NOTES (not the final product matrix):
 * - SUPER_ADMIN maps to the full set as a platform-level placeholder
 *   (Task 005 §12). School-scoped operations still require a valid,
 *   active SchoolMembership + School Context — the pipeline is uniform.
 *   Detailed SUPER_ADMIN platform workflows are deferred.
 * - TEACHER gets `announcements.publish` because BR-ANNOUNCEMENT-007 allows
 *   teacher direct publishing; every teacher action still requires matching
 *   TeacherAssignment scope.
 * - PARENT is read-only across their own children's data; scope comes from
 *   ParentStudent (BR-ROLE-005), never from the permission alone.
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  SUPER_ADMIN: PERMISSIONS,
  SCHOOL_ADMIN: [
    'school.read',
    'academic_structure.read',
    'academic_structure.manage',
    'students.read',
    'students.manage',
    'teachers.read',
    'teachers.manage',
    'grades.read',
    'grades.manage',
    'grades.publish',
    'attendance.read',
    'attendance.manage',
    'homework.read',
    'homework.manage',
    'announcements.read',
    'announcements.create',
    'announcements.publish',
    'notifications.read',
  ],
  TEACHER: [
    'school.read',
    'academic_structure.read',
    'students.read',
    'grades.read',
    'grades.enter',
    'attendance.read',
    'attendance.manage',
    'homework.read',
    'homework.manage',
    'announcements.read',
    'announcements.create',
    'announcements.publish',
    'notifications.read',
  ],
  PARENT: [
    'school.read',
    'students.read',
    'grades.read',
    'attendance.read',
    'homework.read',
    'announcements.read',
    'notifications.read',
  ],
};

/**
 * Pure role→permission lookup shared by the server engine and the UX helpers.
 * Never used as an authorization boundary by itself — the server always runs
 * the full pipeline (CLAUDE.md §16).
 */
export function roleHasPermission(role: Role | null | undefined, permission: Permission): boolean {
  return role != null && ROLE_PERMISSIONS[role].includes(permission);
}
