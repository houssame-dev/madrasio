/**
 * Authorization decision model (Task 005 §7).
 *
 * A decision is either ALLOW or DENY. DENY always carries a machine-readable
 * internal reason so callers can map it to the appropriate API surface
 * (UNAUTHENTICATED → 401, most others → 403, with optional 404 hiding of
 * existence where the module chooses not to leak it — see `denialToError`).
 *
 * Reasons are internal; they must not be exposed verbatim to API clients.
 */
export type AuthorizationDecision = { allowed: true } | { allowed: false; reason: DenialReason };

export type DenialReason =
  | 'UNAUTHENTICATED'
  | 'USER_INACTIVE'
  | 'NO_MEMBERSHIP'
  | 'INACTIVE_MEMBERSHIP'
  | 'INVALID_SCHOOL_CONTEXT'
  | 'INVALID_ROLE'
  | 'MISSING_PERMISSION'
  | 'OUT_OF_SCOPE'
  | 'NOT_OWNER'
  | 'INVALID_RELATIONSHIP'
  | 'INVALID_RESOURCE_STATE';