/**
 * `requireCurrentContext` — the canonical server entry point for protected
 * Route Handlers (Task 014 §24).
 *
 * Resolves the full authoritative Current Context in pipeline order:
 *
 *   Supabase Auth session → authenticated User id
 *     → application User (APPLICATION_USER_NOT_FOUND when missing)
 *     → global User lifecycle (USER_INACTIVE when SUSPENDED/DISABLED)
 *     → current School selector (cookie) validated against ACTIVE membership
 *     → CurrentContext (identity + membership + school + role)
 *
 * This helper is deliberately small and reuses the existing pieces — it owns no
 * role/permission logic (that stays in `lib/authorization`). It throws:
 * - `UnauthenticatedError` (401) — no valid session.
 * - `AuthError('APPLICATION_USER_NOT_FOUND')` (403) — auth identity without an
 *   application User row.
 * - `AuthError('USER_INACTIVE')` (403) — the application User is globally
 *   SUSPENDED/DISABLED. This runs BEFORE membership/role/permission/scope
 *   (Task 014.1 §6) — global User lifecycle wins over membership lifecycle.
 * - `AuthError('SCHOOL_CONTEXT_REQUIRED')` (403) — no current School Context for
 *   a school-scoped operation (multiple ACTIVE memberships with no selection,
 *   or zero ACTIVE memberships).
 *
 * The session resolver / cookie reader are injectable so tests drive real
 * PGlite resolution without a Supabase network dependency. The default session
 * resolver is lazily loaded to keep this module importable in hermetic tests.
 */

import type { CurrentContext } from '@/lib/authorization/context';
import { UnauthenticatedError } from '@/lib/errors';

import { AuthError } from './auth-errors';
import { readSelectedSchoolId } from './current-school';
import {
  assertUserActive,
  contextFromResolution,
  resolveUserContext,
  type AuthDb,
} from './current-context';
import type { SessionResolver } from './server-auth';

async function defaultSessionResolver(): Promise<{ id: string } | null> {
  const { defaultSessionResolver: resolve } = await import('./server-auth');
  return resolve();
}

export interface RequireCurrentContextDeps {
  /** Resolves the authenticated auth User, or null when unauthenticated. */
  sessionResolver?: SessionResolver;
  /** Reads the current-school selector. Defaults to the server cookie. */
  readSelectedSchoolId?: () => Promise<string | null>;
}

export async function requireCurrentContext(
  db: AuthDb,
  deps: RequireCurrentContextDeps = {},
): Promise<CurrentContext> {
  const user = await (deps.sessionResolver ?? defaultSessionResolver)();
  if (!user) {
    throw new UnauthenticatedError();
  }

  const selectedSchoolId = await (deps.readSelectedSchoolId ?? readSelectedSchoolId)();
  const resolution = await resolveUserContext(db, { userId: user.id, selectedSchoolId });

  // Canonical stage order (PRD.md §15): global User lifecycle runs before
  // membership/current-school — an inactive User is denied even with a valid
  // selector and ACTIVE memberships (Task 014.1 §6/§9/§13).
  assertUserActive(resolution);

  if (!resolution.currentSchool) {
    throw new AuthError(
      'SCHOOL_CONTEXT_REQUIRED',
      'A valid current School is required for this operation. Select a school first.',
    );
  }

  return contextFromResolution(resolution);
}