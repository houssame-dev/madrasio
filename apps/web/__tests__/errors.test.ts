import { describe, expect, it } from 'vitest';

import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from '@/lib/errors';

describe('AppError foundation', () => {
  it('maps each error code to the correct HTTP status', () => {
    expect(new ValidationError('bad input').status).toBe(400);
    expect(new UnauthenticatedError().status).toBe(401);
    expect(new ForbiddenError().status).toBe(403);
    expect(new NotFoundError().status).toBe(404);
    expect(new ConflictError('conflict').status).toBe(409);
    expect(new AppError('INTERNAL_ERROR', 'x').status).toBe(500);
  });
});
