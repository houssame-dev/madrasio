import { DeploymentError, parseStagingOrigin, STAGING_PROJECT_REF } from './contracts';

export const STAGING_ORIGIN = 'https://madrasio-staging.vercel.app';
export const RELEASE_POLL_ATTEMPTS = 60;
export const RELEASE_POLL_INTERVAL_MS = 10_000;
export const RELEASE_REQUEST_TIMEOUT_MS = 5_000;

export function parseReleaseConfiguration(env: NodeJS.ProcessEnv): {
  origin: URL;
  expectedSha: string;
} {
  if (
    env.DEPLOY_TARGET_ENV !== 'staging' ||
    env.DEPLOY_EXPECTED_PROJECT_REF !== STAGING_PROJECT_REF
  ) {
    throw new DeploymentError(
      'STAGING_TARGET_NOT_CONFIRMED',
      'Only approved STAGING releases are allowed.',
    );
  }
  const origin = parseStagingOrigin(env.STAGING_APP_ORIGIN);
  const expectedSha = env.DEPLOY_EXPECTED_SHA;
  if (origin.origin !== STAGING_ORIGIN || !expectedSha || !/^[a-f0-9]{40}$/.test(expectedSha)) {
    throw new DeploymentError(
      'INVALID_RELEASE_CONFIG',
      'The stable STAGING origin and exact commit SHA are required.',
    );
  }
  return { origin, expectedSha };
}

export function parseDeployHook(value: string | undefined): URL {
  let url: URL;
  try {
    url = new URL(value ?? '');
  } catch {
    throw new DeploymentError(
      'INVALID_DEPLOY_HOOK',
      'A valid Vercel Deploy Hook secret is required.',
    );
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'api.vercel.com' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !/^\/v1\/integrations\/deploy\/prj_[A-Za-z0-9]+\/[A-Za-z0-9_-]+$/.test(url.pathname)
  ) {
    throw new DeploymentError(
      'INVALID_DEPLOY_HOOK',
      'A valid Vercel Deploy Hook secret is required.',
    );
  }
  return url;
}

/** One POST only: ambiguous network failures require review, not automatic re-triggering. */
export async function triggerDeployHook(
  env: NodeJS.ProcessEnv,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  parseReleaseConfiguration(env);
  const url = parseDeployHook(env.VERCEL_DEPLOY_HOOK_URL);
  try {
    const response = await fetcher(url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    // Neither the URL nor the provider response body may escape this boundary.
    await response.body?.cancel();
    if (!response.ok) throw new Error('Hook was not accepted.');
  } catch {
    throw new DeploymentError(
      'DEPLOY_HOOK_FAILED',
      'The STAGING Deploy Hook was not confirmed; inspect provider state before retrying.',
    );
  }
}

export async function isExpectedDeployment(
  origin: URL,
  expectedSha: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetcher(new URL('/api/health/deployment', origin), {
      redirect: 'manual',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(RELEASE_REQUEST_TIMEOUT_MS),
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return false;
    }
    const body: unknown = await response.json();
    return (
      typeof body === 'object' &&
      body !== null &&
      'status' in body &&
      body.status === 'ok' &&
      'commitSha' in body &&
      body.commitSha === expectedSha
    );
  } catch {
    return false;
  }
}

export async function waitForDeployment(
  env: NodeJS.ProcessEnv,
  fetcher: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<{ commitSha: string; attempts: number }> {
  const { origin, expectedSha } = parseReleaseConfiguration(env);
  for (let attempt = 1; attempt <= RELEASE_POLL_ATTEMPTS; attempt++) {
    if (await isExpectedDeployment(origin, expectedSha, fetcher)) {
      return { commitSha: expectedSha, attempts: attempt };
    }
    if (attempt < RELEASE_POLL_ATTEMPTS) await sleep(RELEASE_POLL_INTERVAL_MS);
  }
  throw new DeploymentError(
    'DEPLOYMENT_SHA_NOT_READY',
    'The stable STAGING origin did not serve the expected commit within the bounded wait.',
  );
}
