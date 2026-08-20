/**
 * Current Context — server-side request/school context resolution
 * (Task 005 §2/§16, lib/README).
 *
 * Thin facade over the authorization server resolver and the Task 014 auth
 * layer so pages/use-cases can build the CurrentContext without importing the
 * engine internals:
 *
 * - `requireCurrentContext(db)` — canonical protected-operation entry (session
 *   → user → membership → current school → role).
 * - `resolveUserContext(db, ...)` — pure user/membership/current-school
 *   resolution (injectable session/selector in tests).
 *
 * Scope and resource data are NOT loaded here — they are resolved on demand in
 * `lib/authorization/server`.
 */
export type {
  CurrentContext,
  ParentStudentScope,
  SchoolContextSummary,
  SchoolMembershipContext,
  ScopeSummary,
  TeacherAssignmentScope,
} from '@/lib/authorization/context';
export { resolveCurrentContext } from '@/lib/authorization/server/resolve-context';
export type { ResolveContextInput } from '@/lib/authorization/server/resolve-context';
export {
  CURRENT_SCHOOL_COOKIE,
  clearSelectedSchoolId,
  normalizeSchoolSelector,
  readSelectedSchoolId,
  writeSelectedSchoolId,
} from '@/lib/auth/current-school';
export {
  assertUserActive,
  contextFromResolution,
  resolveUserContext,
  selectCurrentSchool,
  type AuthDb,
  type ResolvedMembership,
  type ResolvedUserContext,
  type UserLifecycleStatus,
} from '@/lib/auth/current-context';
export { requireCurrentContext, type RequireCurrentContextDeps } from '@/lib/auth/require-context';
export { AuthError, AUTH_ERROR_CODES, type AuthErrorCode } from '@/lib/auth/auth-errors';