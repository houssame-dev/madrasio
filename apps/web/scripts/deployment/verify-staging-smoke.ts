import { safeDeploymentError } from './contracts';
import { isExpectedDeployment, parseReleaseConfiguration } from './release-transport';

async function request(origin: URL, path: string, init?: RequestInit): Promise<Response> {
  return fetch(new URL(path, origin), {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
}

async function main(): Promise<void> {
  const { origin, expectedSha } = parseReleaseConfiguration(process.env);
  if (!(await isExpectedDeployment(origin, expectedSha))) {
    throw new Error('The stable origin is not serving the expected release.');
  }
  const login = await request(origin, '/login');
  const loginHtml = (await login.text()).toLowerCase();
  if (login.status !== 200 || (!loginHtml.includes('sign in') && !loginHtml.includes('login'))) {
    throw new Error('The deployed login page did not return the expected application surface.');
  }
  const me = await request(origin, '/api/v1/me');
  if (me.status !== 401) throw new Error('The unauthenticated /me contract is not enforced.');

  for (const path of [
    '/api/internal/jobs/process-outbox',
    '/api/internal/jobs/process-scheduled-announcements',
  ]) {
    const get = await request(origin, path);
    if (get.status !== 405) throw new Error(`GET method safety failed for ${path}.`);
    const missing = await request(origin, path, { method: 'POST' });
    const wrong = await request(origin, path, {
      method: 'POST',
      headers: { authorization: 'Bearer intentionally-invalid-deployment-smoke-credential' },
    });
    if (missing.status !== 401 || wrong.status !== 401) {
      throw new Error(`Machine authorization denial failed for ${path}.`);
    }
  }

  if (!(await isExpectedDeployment(origin, expectedSha))) {
    throw new Error('The stable origin changed during smoke verification.');
  }
  console.info(
    JSON.stringify({
      event: 'staging_deployment_smoke_passed',
      origin: origin.origin,
      commitSha: expectedSha,
      checks: 10,
    }),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({ event: 'staging_deployment_smoke_failed', ...safeDeploymentError(error) }),
  );
  process.exitCode = 1;
});
