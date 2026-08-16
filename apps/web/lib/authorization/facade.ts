import { ForbiddenError, UnauthenticatedError, type AppError } from '@/lib/errors';

import type { CurrentContext } from './context';
import type { AuthorizationDecision, DenialReason } from './decisions';
import { evaluateAuthorization } from './pipeline';
import type { AuthorizationRequirements } from './requirements';

/**
 * Reusable authorization interface (Task 005 §8).
 *
 * The Application/server layer is authoritative — these are the entry points
 * Use Cases call. UI components never consume them as a security boundary.
 *
 * - `can(context, requirements)` — boolean form.
 * - `authorize(context, requirements)` — throws the mapped AppError on denial,
 *   so Use Cases can call it as a guard and stay declarative.
 */
export function can(context: CurrentContext, requirements: AuthorizationRequirements = {}): boolean {
  return evaluateAuthorization(context, requirements).allowed;
}

export function authorize(context: CurrentContext, requirements: AuthorizationRequirements = {}): void {
  const decision = evaluateAuthorization(context, requirements);
  if (!decision.allowed) {
    throw denialToError(decision);
  }
}

/**
 * Maps an internal denial reason to the application error model.
 *
 * UNAUTHENTICATED → 401. Everything else → 403 by default. Modules that must
 * hide the existence of a resource (e.g. OUT_OF_SCOPE / NOT_OWNER on a
 * specific resource) may map those reasons to NotFoundError instead; the
 * foundation keeps the default conservative (Forbidden) and never leaks the
 * internal reason string to clients.
 */
export function denialToError(decision: Extract<AuthorizationDecision, { allowed: false }>): AppError {
  return denialReasonToError(decision.reason);
}

export function denialReasonToError(reason: DenialReason, message = 'Access denied'): AppError {
  if (reason === 'UNAUTHENTICATED') return new UnauthenticatedError();
  return new ForbiddenError(message);
}