import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

import { authorizeInternalJob } from './auth';
import { logServerEvent } from '@/lib/observability/logger';

export function requireInternalJob(request: Request): NextResponse | null {
  const authorization = authorizeInternalJob(request);
  if (authorization === 'AUTHORIZED') return null;
  if (authorization === 'NOT_CONFIGURED') {
    return NextResponse.json(
      { error: { code: 'JOB_NOT_CONFIGURED', message: 'Internal job execution is unavailable.' } },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } },
    { status: 401 },
  );
}

export function methodNotAllowed(): NextResponse {
  return NextResponse.json(
    { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } },
    { status: 405, headers: { allow: 'POST' } },
  );
}

export function jobInvocation(): { correlationId: string; startedAt: number } {
  return { correlationId: randomUUID(), startedAt: Date.now() };
}

export function logJobResult(
  job: string,
  invocation: { correlationId: string; startedAt: number },
  result: Record<string, number>,
): void {
  const failed = result.failed ?? 0;
  const attempted = result.attempted ?? 0;
  logServerEvent(failed > 0 ? 'warn' : 'info', 'internal_job_completed', {
    job,
    correlationId: invocation.correlationId,
    durationMs: Date.now() - invocation.startedAt,
    success: failed === 0,
    zeroWork: attempted === 0,
    ...result,
  });
}
