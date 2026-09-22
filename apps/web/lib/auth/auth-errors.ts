/**
 * Authentication / current-context errors (Task 014 §39).
 *
 * Controlled, machine-readable `featureCode`s (PRD.md §28) layered on top of
 * the generic cross-cutting `FORBIDDEN`. These describe AUTHORIZATION-STAGE
 * conditions the server derives — never client-provided values:
 *
 * - `APPLICATION_USER_NOT_FOUND` — Supabase Auth identity exists but no
 *   `public.users` row exists (provisioning state; Task 014 §33). The server
 *   NEVER silently auto-creates application users during protected requests.
 * - `SCHOOL_CONTEXT_REQUIRED` — authenticated, but a current School Context
 *   cannot be resolved (zero ACTIVE memberships, or multiple ACTIVE memberships
 *   with no valid selection) for a school-scoped operation (Task 014 §22).
 * - `INVALID_SCHOOL_CONTEXT` — the explicitly selected/requested School is not
 *   an ACTIVE membership of the user (Task 014 §23). Never reveals whether the
 *   foreign School exists.
 * - `USER_INACTIVE` — the application User exists but its global lifecycle
 *   status is SUSPENDED or DISABLED (Task 014.1 §5). Global User lifecycle
 *   wins BEFORE SchoolMembership lifecycle: this denial is thrown before any
 *   membership/role/permission/scope evaluation. It is NOT `UNAUTHENTICATED`
 *   (the Supabase identity is valid); it is a 403.
 *
 * All four are 403 (the user is authenticated but may not act in that scope),
 * matching the `denialToError` convention for pipeline denials.
 */

import { ForbiddenError } from '@/lib/errors';

export const AUTH_ERROR_CODES = [
  'APPLICATION_USER_NOT_FOUND',
  'SCHOOL_CONTEXT_REQUIRED',
  'INVALID_SCHOOL_CONTEXT',
  'USER_INACTIVE',
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export class AuthError extends ForbiddenError {
  public readonly featureCode: AuthErrorCode;

  constructor(featureCode: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
    this.featureCode = featureCode;
  }
}