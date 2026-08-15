import { NextResponse } from 'next/server';

/**
 * Public health endpoint.
 *
 * Used for liveness/readiness checks and as a smoke endpoint for the
 * versioned API foundation. Business endpoints are intentionally not
 * implemented at this stage.
 */
export function GET(): NextResponse {
  return NextResponse.json({
    status: 'ok',
    service: 'school-management-system',
    version: 'v1-foundation',
    timestamp: new Date().toISOString(),
  });
}
