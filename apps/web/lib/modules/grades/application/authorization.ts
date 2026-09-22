/**
 * Authorization helpers for the Results use cases (Task 006D Part U).
 *
 * Every protected Results operation runs the canonical server-side pipeline
 * (PRD.md §15) via `lib/authorization/server`. These helpers just adapt the
 * driver-agnostic `GradesDb` to the `AuthorizationDb` surface (same underlying
 * object — the cast mirrors the pattern already used by the test helpers) and
 * provide an OR-variant for operations that accept more than one valid
 * authorization path (e.g. subject calculation by a scoped Teacher OR by a
 * School Admin).
 */

import { requireOperation, authorizeOperation, type AuthorizeInput, type AuthorizationDb } from '@/lib/authorization/server';
import { denialToError } from '@/lib/authorization/facade';
import type { AuthorizationRequirements } from '@/lib/authorization/requirements';
import { ForbiddenError } from '@/lib/errors';

import type { GradesDb } from '../infrastructure/repositories/result-repository';

/** Single-path requirement guard (equivalent to `requireOperation`). */
export function requireResultOperation(
  db: GradesDb,
  input: AuthorizeInput,
  requirements: AuthorizationRequirements,
): Promise<void> {
  return requireOperation(db as unknown as AuthorizationDb, input, requirements);
}

/**
 * OR-path requirement guard: grants access when ANY of the alternatives
 * passes the pipeline; otherwise throws the mapped denial error (using the
 * first denial for the error mapping so the reason stays deterministic).
 */
export async function requireAnyResultOperation(
  db: GradesDb,
  input: AuthorizeInput,
  alternatives: AuthorizationRequirements[],
): Promise<void> {
  let firstDenial: Extract<Awaited<ReturnType<typeof authorizeOperation>>, { allowed: false }> | null = null;
  for (const requirements of alternatives) {
    const decision = await authorizeOperation(db as unknown as AuthorizationDb, input, requirements);
    if (decision.allowed) {
      return;
    }
    firstDenial ??= decision;
  }
  if (firstDenial) {
    throw denialToError(firstDenial);
  }
  throw new ForbiddenError();
}