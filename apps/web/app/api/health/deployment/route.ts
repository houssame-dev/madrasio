import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Public deployment metadata only; not database health or authorization. */
export function GET(): NextResponse {
  const value = process.env.VERCEL_GIT_COMMIT_SHA;
  const commitSha = value && /^[a-f0-9]{40}$/.test(value) ? value : null;
  return NextResponse.json(
    { status: 'ok', commitSha },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
