import { safeDeploymentError } from './contracts';
import { parseProductionReleaseConfiguration } from './production-release-transport';
import { isExpectedDeployment } from './release-transport';

async function request(origin: URL, path: string, init?: RequestInit): Promise<Response> {
  return fetch(new URL(path, origin), {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
}

async function verifyDataApiUnavailable(): Promise<void> {
  const projectRef = process.env.PRODUCTION_EXPECTED_PROJECT_REF;
  const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (supabaseUrl.hostname !== `${projectRef}.supabase.co` || !key) {
    throw new Error('Production public Supabase smoke configuration is invalid.');
  }
  const response = await fetch(new URL('/rest/v1/schools?select=id&limit=1', supabaseUrl), {
    headers: { apikey: key, authorization: `Bearer ${key}` },
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.text();
  if (/invalid api key/i.test(body)) throw new Error('The Production publishable key is invalid.');
  if (response.ok) throw new Error('Production application tables are queryable through Data API.');
}

async function main(): Promise<void> {
  const { origin, expectedSha } = parseProductionReleaseConfiguration(process.env);
  if (!(await isExpectedDeployment(origin, expectedSha))) {
    throw new Error('The Production origin is not serving the approved release.');
  }
  const liveness = await request(origin, '/api/health');
  if (liveness.status !== 200) throw new Error('Production liveness failed.');
  await liveness.body?.cancel();
  const readiness = await request(origin, '/api/health/ready');
  const readinessBody: unknown = await readiness.json().catch(() => null);
  if (
    readiness.status !== 200 ||
    typeof readinessBody !== 'object' ||
    readinessBody === null ||
    !('status' in readinessBody) ||
    readinessBody.status !== 'ready'
  ) {
    throw new Error('Production database readiness failed.');
  }
  const me = await request(origin, '/api/v1/me');
  if (me.status !== 401) throw new Error('Unauthenticated /me is not denied.');

  for (const path of [
    '/api/internal/jobs/process-outbox',
    '/api/internal/jobs/process-scheduled-announcements',
  ]) {
    const get = await request(origin, path);
    const missing = await request(origin, path, { method: 'POST' });
    const wrong = await request(origin, path, {
      method: 'POST',
      headers: { authorization: 'Bearer intentionally-invalid-production-smoke-credential' },
    });
    if (get.status !== 405 || missing.status !== 401 || wrong.status !== 401) {
      throw new Error(`Machine route safety failed for ${path}.`);
    }
  }
  await verifyDataApiUnavailable();
  if (!(await isExpectedDeployment(origin, expectedSha))) {
    throw new Error('The Production origin changed during smoke verification.');
  }
  console.info(
    JSON.stringify({
      event: 'production_infrastructure_smoke_passed',
      commitSha: expectedSha,
      checks: 12,
    }),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({ event: 'production_smoke_failed', ...safeDeploymentError(error) }),
  );
  process.exitCode = 1;
});
