/**
 * Authorization pipeline foundation.
 *
 * The pipeline order is fixed by CLAUDE.md §15 and must not be reordered.
 * Concrete policy implementations (school membership lookup, permission
 * evaluation, scope checks, ownership checks, resource state checks) will be
 * added inside each owning module — the foundation file only defines the
 * decision shape and the canonical ordering of steps.
 */

export interface AuthorizationContext {
  userId: string | null;
  isActive: boolean;
  schoolMembership: SchoolMembershipSummary | null;
  schoolContext: SchoolContextSummary | null;
  role: RoleSummary | null;
  permissions: readonly string[];
  scope: ScopeSummary | null;
  ownership: OwnershipSummary | null;
  resourceState: ResourceStateSummary | null;
}

export interface SchoolMembershipSummary {
  schoolId: string;
  isActive: boolean;
}

export interface SchoolContextSummary {
  schoolId: string;
  isValid: boolean;
}

export interface RoleSummary {
  code: 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'TEACHER' | 'PARENT';
}

export interface ScopeSummary {
  teacherAssignments?: readonly { classId: string; subjectId: string }[];
  parentStudents?: readonly { studentId: string }[];
}

export interface OwnershipSummary {
  isOwner: boolean;
  hasRelationship: boolean;
}

export interface ResourceStateSummary {
  state: string;
  allowsRequestedAction: boolean;
}

export type AuthorizationDecision =
  | { allowed: true }
  | { allowed: false; reason: AuthorizationDenialReason };

export type AuthorizationDenialReason =
  | 'NOT_AUTHENTICATED'
  | 'USER_INACTIVE'
  | 'NO_SCHOOL_MEMBERSHIP'
  | 'INVALID_SCHOOL_CONTEXT'
  | 'INSUFFICIENT_ROLE'
  | 'MISSING_PERMISSION'
  | 'OUT_OF_SCOPE'
  | 'NOT_OWNER'
  | 'RESOURCE_STATE_DENIED';

/**
 * Evaluates the authorization pipeline in canonical order.
 * The pipeline is intentionally written to short-circuit on the first
 * failure and never throws — callers map the result to their API surface.
 */
export function evaluateAuthorization(
  context: AuthorizationContext,
  required: { permission?: string },
): AuthorizationDecision {
  if (!context.userId) return deny('NOT_AUTHENTICATED');
  if (!context.isActive) return deny('USER_INACTIVE');
  if (!context.schoolMembership || !context.schoolMembership.isActive)
    return deny('NO_SCHOOL_MEMBERSHIP');
  if (!context.schoolContext || !context.schoolContext.isValid)
    return deny('INVALID_SCHOOL_CONTEXT');
  if (!context.role) return deny('INSUFFICIENT_ROLE');
  if (required.permission && !context.permissions.includes(required.permission))
    return deny('MISSING_PERMISSION');
  if (!context.scope) return deny('OUT_OF_SCOPE');
  if (!context.ownership || (!context.ownership.isOwner && !context.ownership.hasRelationship))
    return deny('NOT_OWNER');
  if (!context.resourceState || !context.resourceState.allowsRequestedAction)
    return deny('RESOURCE_STATE_DENIED');

  return { allowed: true };
}

function deny(reason: AuthorizationDenialReason): AuthorizationDecision {
  return { allowed: false, reason };
}
