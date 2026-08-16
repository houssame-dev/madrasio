/**
 * Current Context — server-side request/school context resolution
 * (Task 005 §2/§16, lib/README).
 *
 * Thin facade over the authorization server resolver so pages/use-cases can
 * build the CurrentContext without importing the engine internals. Scope and
 * resource data are NOT loaded here — they are resolved on demand in
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