/**
 * HTTP adapter for the Results module (Task 006D Part W).
 *
 * Thin route-handler helpers: request parsing (Zod) and error mapping only.
 * No business logic here — handlers delegate to
 * `modules/grades/application/*` use cases and translate results into DTOs
 * (`lib/api/README.md`, CLAUDE.md §25/§28/§29).
 */

import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';

import { AppError, ValidationError } from '@/lib/errors';
import type { ResultErrorCode } from '@/lib/modules/grades/domain';

/** Parses a JSON body against a Zod schema, throwing ValidationError on failure. */
export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError('Request body must be valid JSON.');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError('Request validation failed.', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

/** Structural detection of a Results feature-scoped error (ResultDomainError). */
function isFeatureScopedError(error: unknown): error is AppError & { featureCode: ResultErrorCode } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'featureCode' in error &&
    'code' in error &&
    typeof (error as { featureCode?: unknown }).featureCode === 'string' &&
    typeof (error as { code?: unknown }).code === 'string'
  );
}

/** Maps any thrown error to a stable machine-readable API error (CLAUDE.md §28). */
export function toResultErrorResponse(error: unknown): NextResponse {
  if (isFeatureScopedError(error)) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          featureCode: error.featureCode,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      },
      { status: error.status },
    );
  }
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    { status: 500 },
  );
}