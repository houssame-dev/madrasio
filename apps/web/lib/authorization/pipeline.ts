import type { CurrentContext } from './context';
import type { AuthorizationDecision, DenialReason } from './decisions';
import { roleHasPermission } from './permissions';
import { isRole } from './roles';
import type { AuthorizationRequirements, ScopeRequirement } from './requirements';

/**
 * The canonical authorization pipeline (PRD.md §15, overview.md §16).
 *
 * Order is fixed and must not be reordered:
 *
 *   Authenticated User
 *     ↓ Active User
 *     ↓ Valid School Membership
 *     ↓ Current School Context
 *     ↓ Role
 *     ↓ Permission
 *     ↓ Academic Scope
 *     ↓ Ownership / Relationship
 *     ↓ Resource State
 *     ↓ ALLOW / DENY
 *
 * Identity/membership/school-context stages are always evaluated. Permission,
 * scope, ownership and resource-state stages are evaluated ONLY when the
 * operation requests them (`AuthorizationRequirements`), so the same engine
 * supports both school-scoped reads and deeply-scoped teacher/parent
 * operations without forcing every stage on every request.
 *
 * The function is pure, never throws, and short-circuits on the first denial.
 */
export function evaluateAuthorization(
  context: CurrentContext,
  requirements: AuthorizationRequirements,
): AuthorizationDecision {
  // 1. Authenticated
  if (!context.userId) return deny('UNAUTHENTICATED');
  // 2. Active User
  if (!context.userActive) return deny('USER_INACTIVE');
  // 3. Valid School Membership
  if (!context.membership) return deny('NO_MEMBERSHIP');
  if (context.membership.status !== 'ACTIVE') return deny('INACTIVE_MEMBERSHIP');
  // 4. Current School Context
  if (!context.schoolContext || !context.schoolContext.isValid) return deny('INVALID_SCHOOL_CONTEXT');
  if (context.schoolContext.schoolId !== context.membership.schoolId) return deny('INVALID_SCHOOL_CONTEXT');
  // 5. Role
  if (!context.role || !isRole(context.role)) return deny('INVALID_ROLE');
  // 6. Permission (only if the operation requests one)
  if (requirements.permission && !roleHasPermission(context.role, requirements.permission)) {
    return deny('MISSING_PERMISSION');
  }
  // 7. Academic Scope (only if the operation is scope-checked)
  if (requirements.scope && !scopeSatisfies(context, requirements.scope)) {
    return deny('OUT_OF_SCOPE');
  }
  // 8. Ownership / Relationship (only if requested)
  if (requirements.ownership) {
    if (requirements.ownership.isOwner === false) return deny('NOT_OWNER');
    if (requirements.ownership.hasRelationship === false) return deny('INVALID_RELATIONSHIP');
  }
  // 9. Resource State (only if requested)
  if (requirements.resourceState && !requirements.resourceState.allows) {
    return deny('INVALID_RESOURCE_STATE');
  }

  // 10. ALLOW
  return { allowed: true };
}

function deny(reason: DenialReason): AuthorizationDecision {
  return { allowed: false, reason };
}

/**
 * Evaluates a scope requirement against the resolved scope facts.
 * Teacher scope requires an ACTIVE TeacherAssignment matching Class + Subject
 * + AcademicYear (ADR-009); Parent scope requires an ACTIVE ParentStudent
 * relationship (BR-PARENT-002/004). Ended rows never grant current scope.
 */
export function scopeSatisfies(context: CurrentContext, requirement: ScopeRequirement): boolean {
  switch (requirement.kind) {
    case 'school':
      // School-scoped operations are already gated by the School Context stage.
      return true;
    case 'teacher':
      return context.scope.teacherAssignments.some(
        (a) =>
          a.status === 'ACTIVE' &&
          a.classId === requirement.classId &&
          a.subjectId === requirement.subjectId &&
          a.academicYearId === requirement.academicYearId,
      );
    case 'teacherClass':
      return context.scope.teacherAssignments.some(
        (a) =>
          a.status === 'ACTIVE' &&
          a.classId === requirement.classId &&
          a.academicYearId === requirement.academicYearId,
      );
    case 'parent':
      return context.scope.parentStudents.some(
        (p) => p.status === 'ACTIVE' && p.studentId === requirement.studentId,
      );
  }
}
