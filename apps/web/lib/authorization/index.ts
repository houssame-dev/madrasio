/**
 * Authorization foundation public surface (Task 005).
 *
 * Pure, framework-agnostic engine + types. The server-side resolvers
 * (context/membership/scope against Drizzle) live in `./server` and are
 * imported explicitly — they are the only part that touches I/O.
 *
 * UX helpers (`Can`, `roleHasPermission`) are exported from `./can` /
 * `./permissions` and are never a security boundary.
 */

export { ROLES, isRole, type Role } from './roles';
export {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  roleHasPermission,
  type Permission,
} from './permissions';
export type { AuthorizationDecision, DenialReason } from './decisions';
export type {
  CurrentContext,
  ParentStudentScope,
  SchoolContextSummary,
  SchoolMembershipContext,
  ScopeSummary,
  TeacherAssignmentScope,
} from './context';
export type {
  AuthorizationRequirements,
  OwnershipRequirement,
  ResourceStateRequirement,
  ScopeRequirement,
} from './requirements';
export { evaluateAuthorization, scopeSatisfies } from './pipeline';
export { authorize, can, denialReasonToError, denialToError } from './facade';
export { Can, type CanProps } from './can';