import { DeploymentError } from './contracts';
import {
  assertProductionMigrationTarget,
  parseProductionOrigin,
  PRODUCTION_CONFIRMATION,
} from './production-contracts';
import { isExpectedDeployment, parseDeployHook } from './release-transport';

export const PRODUCTION_RELEASE_POLL_ATTEMPTS = 60;
export const PRODUCTION_RELEASE_POLL_INTERVAL_MS = 10_000;

export function parseProductionReleaseConfiguration(env: NodeJS.ProcessEnv): {
  origin: URL;
  expectedSha: string;
} {
  assertProductionMigrationTarget(env);
  if (env.PRODUCTION_DEPLOY_CONFIRMATION !== PRODUCTION_CONFIRMATION) {
    throw new DeploymentError(
      'PRODUCTION_CONFIRMATION_REQUIRED',
      `Production release requires the exact ${PRODUCTION_CONFIRMATION} confirmation.`,
    );
  }
  const origin = parseProductionOrigin(env.PRODUCTION_APP_ORIGIN);
  const expectedSha = env.DEPLOY_EXPECTED_SHA;
  if (!expectedSha || !/^[a-f0-9]{40}$/.test(expectedSha)) {
    throw new DeploymentError(
      'INVALID_RELEASE_CONFIG',
      'An exact lowercase commit SHA is required.',
    );
  }
  return { origin, expectedSha };
}

export async function triggerProductionDeployHook(
  env: NodeJS.ProcessEnv,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  parseProductionReleaseConfiguration(env);
  const url = parseDeployHook(env.VERCEL_DEPLOY_HOOK_URL);
  try {
    const response = await fetcher(url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error('Hook was not accepted.');
  } catch {
    throw new DeploymentError(
      'DEPLOY_HOOK_FAILED',
      'The Production Deploy Hook was not confirmed; inspect provider state before retrying.',
    );
  }
}

export async function waitForProductionDeployment(
  env: NodeJS.ProcessEnv,
  fetcher: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<{ commitSha: string; attempts: number }> {
  const { origin, expectedSha } = parseProductionReleaseConfiguration(env);
  for (let attempt = 1; attempt <= PRODUCTION_RELEASE_POLL_ATTEMPTS; attempt++) {
    if (await isExpectedDeployment(origin, expectedSha, fetcher)) {
      return { commitSha: expectedSha, attempts: attempt };
    }
    if (attempt < PRODUCTION_RELEASE_POLL_ATTEMPTS)
      await sleep(PRODUCTION_RELEASE_POLL_INTERVAL_MS);
  }
  throw new DeploymentError(
    'DEPLOYMENT_SHA_NOT_READY',
    'The Production origin did not serve the approved commit within the bounded wait.',
  );
}
