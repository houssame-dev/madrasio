import { NextResponse } from 'next/server';

import { toApiErrorResponse } from '@/lib/api/errors';
import { getDb } from '@/lib/db';
import { jobInvocation, logJobResult, methodNotAllowed, requireInternalJob } from '@/lib/jobs/http';
import { processDueAnnouncementPublicationsBatch } from '@/lib/modules/announcements/application';

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
    const result = await processDueAnnouncementPublicationsBatch(getDb());
    const safe = {
      attempted: result.attempted,
      published: result.published,
      failed: result.failed,
      remaining: result.remaining,
    };
    logJobResult('process-scheduled-announcements', invocation, safe);
    return NextResponse.json({ data: safe });
  } catch (error) {
    return toApiErrorResponse(error, {
      operation: 'process-scheduled-announcements',
      failureCategory: 'background_job_failure',
    });
  }
}
