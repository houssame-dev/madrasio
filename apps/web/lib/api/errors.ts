/**
 * Shared HTTP adapter helpers (CLAUDE.md §28/§29).
 *
 * Request parsing (Zod) and error mapping only — no business logic here. Route
 * Handlers delegate to `modules/<domain>/application/*` use cases and
 * translate the results into DTOs (`lib/api/README.md`).
 */

import { NextResponse } from 'next/server';
import type { output, ZodTypeAny } from 'zod';

import { AppError, ValidationError } from '@/lib/errors';
import {
  classifyOperationalError,
  logServerEvent,
  type OperationalErrorCategory,
} from '@/lib/observability/logger';

/** Parses a JSON body against a Zod schema, throwing ValidationError on failure. */
export async function parseBody<S extends ZodTypeAny>(request: Request, schema: S): Promise<output<S>> {
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
  return parsed.data as output<S>;
}

/** Structural detection of a module feature-scoped error (e.g. ResultDomainError). */
function isFeatureScopedError(error: unknown): error is AppError & { featureCode: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'featureCode' in error &&
    'code' in error &&
    typeof (error as { featureCode?: unknown }).featureCode === 'string' &&
    typeof (error as { code?: unknown }).code === 'string'
  );
}

/**
 * Maps any thrown error to a stable machine-readable API error (CLAUDE.md §28).
 * Feature-scoped errors surface both the generic `code` and the module
 * `featureCode`; unexpected errors never leak internals.
 */
export interface ApiErrorContext {
  operation?: string;
  failureCategory?: OperationalErrorCategory;
}

export function toApiErrorResponse(error: unknown, context: ApiErrorContext = {}): NextResponse {
  const status = error instanceof AppError ? error.status : 500;
  const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
  const featureCode = isFeatureScopedError(error) ? error.featureCode : undefined;
  logServerEvent(status >= 500 ? 'error' : 'warn', 'api_request_failed', {
    operation: context.operation ?? 'api_request',
    category: classifyOperationalError(error, context.failureCategory),
    status,
    code,
    ...(featureCode ? { featureCode } : {}),
    error,
  });

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
