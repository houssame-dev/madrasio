export { getSessionUserId } from './session';
export {
  defaultSessionResolver,
  getAuthenticatedUser,
  getAuthenticatedUserId,
  type SessionResolver,
} from './server-auth';
export {
  AUTH_ERROR_CODES,
  AuthError,
  type AuthErrorCode,
} from './auth-errors';
export {
  CURRENT_SCHOOL_COOKIE,
  clearSelectedSchoolId,
  normalizeSchoolSelector,
  readSelectedSchoolId,
  writeSelectedSchoolId,
} from './current-school';
export {
  assertUserActive,
  contextFromResolution,
  resolveUserContext,
  selectCurrentSchool,
  type AuthDb,
  type ResolvedMembership,
  type ResolvedUserContext,
  type ResolveUserContextInput,
  type UserLifecycleStatus,
} from './current-context';
export { requireCurrentContext, type RequireCurrentContextDeps } from './require-context';