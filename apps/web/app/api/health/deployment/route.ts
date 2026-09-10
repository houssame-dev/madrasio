import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function vercelDeploymentUrl(request: NextRequest): string | null {
  const header = request.headers.get('x-vercel-deployment-url')?.toLowerCase();
  const environment = process.env.VERCEL_URL?.toLowerCase();
  if (
    !header ||
    !environment ||
    header !== environment ||
    header.length > 253 ||
    !/^[a-z0-9.-]+\.vercel\.app$/.test(header)
  ) {
    return null;
  }
  return header;
}

/** Public deployment metadata only; not database health or authorization. */
export function GET(request: NextRequest): NextResponse {
  const value = process.env.VERCEL_GIT_COMMIT_SHA;
  const commitSha = value && /^[a-f0-9]{40}$/.test(value) ? value : null;
  return NextResponse.json(
    { status: 'ok', commitSha, deploymentUrl: vercelDeploymentUrl(request) },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
