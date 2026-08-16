import type { CurrentContext } from '../context';
import type { AuthorizationDecision } from '../decisions';
import { denialToError } from '../facade';
import { evaluateAuthorization } from '../pipeline';
import type { AuthorizationRequirements } from '../requirements';
import type { AuthorizationDb } from './db';
import { resolveParentScope } from './parent-scope';
import { resolveCurrentContext, type ResolveContextInput } from './resolve-context';
import { resolveTeacherScope } from './teacher-scope';

export type AuthorizeInput = ResolveContextInput;

/**
 * End-to-end server-side authorization entry point (Task 005 §8/§9).
 *
 * Resolves the Current Context (identity + membership + school) from the
 * database, resolves scope facts on demand when the operation is
 * scope-checked, then runs the canonical pipeline.
 *
 * - `authorizeOperation` returns the decision (no throw).
 * - `requireOperation` throws the mapped AppError on denial — the idiomatic
 *   guard for Application Use Cases (CLAUDE.md §15).
 *
 * The caller supplies `userId` from the authenticated session
 * (`lib/auth/getSessionUserId`) and `schoolId` from the request — neither is
 * trusted; both are validated here.
 */
export async function authorizeOperation(
  db: AuthorizationDb,
  input: AuthorizeInput,
  requirements: AuthorizationRequirements,
): Promise<AuthorizationDecision> {
  const context = await resolveCurrentContext(db, input);
  await resolveScopeOnDemand(db, context, requirements.scope);
  return evaluateAuthorization(context, requirements);
}

export async function requireOperation(
  db: AuthorizationDb,
  input: AuthorizeInput,
  requirements: AuthorizationRequirements,
): Promise<void> {
  const decision = await authorizeOperation(db, input, requirements);
  if (!decision.allowed) {
    throw denialToError(decision);
  }
}

async function resolveScopeOnDemand(
  db: AuthorizationDb,
  context: CurrentContext,
  scope: AuthorizationRequirements['scope'],
): Promise<void> {
  if (!context.userId || !context.schoolContext) return;

  if (scope?.kind === 'teacher') {
    context.scope.teacherAssignments = await resolveTeacherScope(
      db,
      context.userId,
      context.schoolContext.schoolId,
    );
  } else if (scope?.kind === 'parent') {
    context.scope.parentStudents = await resolveParentScope(
      db,
      context.userId,
      context.schoolContext.schoolId,
    );
  }
}