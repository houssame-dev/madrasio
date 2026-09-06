import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getDb } from '@/lib/db';
import { logServerEvent } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Bounded readiness probe: one read-only query, generic external result. */
export async function GET(): Promise<NextResponse> {
  const startedAt = Date.now();
  try {
    await getDb().execute(sql`select 1 as ready`);
    return NextResponse.json(
      { status: 'ready' },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    logServerEvent('error', 'readiness_check_failed', {
      operation: 'database_readiness',
      category: 'database_unavailable',
      durationMs: Date.now() - startedAt,
      error,
    });
    return NextResponse.json(
      { status: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}
