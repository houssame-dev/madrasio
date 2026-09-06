import { NextResponse } from 'next/server';

import { toApiErrorResponse } from '@/lib/api/errors';
import { getDb } from '@/lib/db';
import { jobInvocation, logJobResult, methodNotAllowed, requireInternalJob } from '@/lib/jobs/http';
import { processRetryableOutboxEvents } from '@/lib/modules/notifications/application';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  return methodNotAllowed();
}

export async function POST(request: Request): Promise<NextResponse> {
  const denied = requireInternalJob(request);
  if (denied) return denied;
  const invocation = jobInvocation();
  try {
    const result = await processRetryableOutboxEvents(getDb());
    const safe = {
      attempted: result.attempted,
      processed: result.processed,
      failed: result.failed,
      pending: result.pending,
      remaining: result.remaining,
    };
    logJobResult('process-outbox', invocation, safe);
    return NextResponse.json({ data: safe });
  } catch (error) {
    return toApiErrorResponse(error, {
      operation: 'process-outbox',
      failureCategory: 'background_job_failure',
    });
  }
}
