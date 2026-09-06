import { describe, expect, it, vi } from 'vitest';

import { ForbiddenError, UnauthenticatedError, ValidationError } from '@/lib/errors';
import {
  classifyOperationalError,
  logServerEvent,
  sanitizeLogMetadata,
} from '@/lib/observability/logger';

describe('server observability logger', () => {
  it('redacts secret and personal fields while retaining bounded safe aggregates', () => {
    const safe = sanitizeLogMetadata({
      operation: 'process-outbox',
      count: 3,
      authorization: 'Bearer secret',
      nested: { email: 'person@example.test', status: 'FAILED' },
      body: 'private notification content',
    });
    expect(safe).toEqual({
      operation: 'process-outbox',
      count: 3,
      authorization: '[REDACTED]',
      nested: { email: '[REDACTED]', status: 'FAILED' },
      body: '[REDACTED]',
    });
    expect(JSON.stringify(safe)).not.toContain('person@example.test');
    expect(JSON.stringify(safe)).not.toContain('Bearer secret');
  });

  it('emits one JSON log without serializing Error messages or stacks', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    logServerEvent('info', 'operation_completed', {
      count: 1,
      level: 'error',
      event: 'caller_override',
      error: new Error('database password must never be logged'),
    });
    const line = String(info.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toMatchObject({
      level: 'info',
      event: 'operation_completed',
      count: 1,
      error: { name: 'Error' },
    });
    expect(line).not.toContain('database password');
    info.mockRestore();
  });

  it('normalizes expected operational failure categories', () => {
    expect(classifyOperationalError(new UnauthenticatedError())).toBe('authentication_failure');
    expect(classifyOperationalError(new ForbiddenError())).toBe('authorization_denial');
    expect(classifyOperationalError(new ValidationError('bad'))).toBe('validation_failure');
    expect(classifyOperationalError({ code: 'ECONNREFUSED' })).toBe('database_unavailable');
    expect(classifyOperationalError(new Error('job'), 'background_job_failure')).toBe(
      'background_job_failure',
    );
  });
});
