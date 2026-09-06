import { NextResponse } from 'next/server';

/**
 * Public health endpoint.
 *
 * Liveness only: proves the application process can answer HTTP. Database
 * readiness is intentionally separate at `/api/health/ready`.
 */
export function GET(): NextResponse {
  return NextResponse.json({
    status: 'ok',
    service: 'school-management-system',
    version: 'v1',
    timestamp: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
