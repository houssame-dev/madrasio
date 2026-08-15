import { NextResponse } from 'next/server';

/**
 * Versioned API base route.
 *
 * Business endpoints (students, grades, etc.) are intentionally not wired
 * yet. Domain implementations will be added in dedicated follow-up tasks.
 */
export function GET(): NextResponse {
  return NextResponse.json({
    api: 'v1',
    status: 'foundation',
    message: 'Domain endpoints will be implemented in subsequent tasks.',
  });
}
