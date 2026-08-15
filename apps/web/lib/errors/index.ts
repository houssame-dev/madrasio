/**
 * Application error foundation.
 *
 * Domain-specific error codes (e.g. GRADEBOOK_CLOSED, STUDENT_NOT_ENROLLED)
 * will be added when the relevant modules are implemented. For now we only
 * ship the generic, cross-cutting error categories documented in CLAUDE.md.
 */

export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE_VIOLATION'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: AppErrorCode,
    message: string,
    options: { status?: number; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? AppError.defaultStatus(code);
    this.details = options.details;
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }

  static defaultStatus(code: AppErrorCode): number {
    switch (code) {
      case 'VALIDATION_ERROR':
        return 400;
      case 'UNAUTHENTICATED':
        return 401;
      case 'FORBIDDEN':
        return 403;
      case 'NOT_FOUND':
        return 404;
      case 'CONFLICT':
        return 409;
      case 'BUSINESS_RULE_VIOLATION':
        return 422;
      case 'RATE_LIMITED':
        return 429;
      case 'INTERNAL_ERROR':
      default:
        return 500;
    }
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, { details });
    this.name = 'ValidationError';
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHENTICATED', message);
    this.name = 'UnauthenticatedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super('FORBIDDEN', message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super('NOT_FOUND', message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFLICT', message, { details });
    this.name = 'ConflictError';
  }
}

export class BusinessRuleViolationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('BUSINESS_RULE_VIOLATION', message, { details });
    this.name = 'BusinessRuleViolationError';
  }
}

export class InternalError extends AppError {
  constructor(message = 'Internal error', cause?: unknown) {
    super('INTERNAL_ERROR', message, { cause });
    this.name = 'InternalError';
  }
}
