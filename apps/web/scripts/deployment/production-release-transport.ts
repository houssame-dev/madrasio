import { readFile, writeFile } from 'node:fs/promises';

import { DeploymentError } from './contracts';
import {
  assertProductionMigrationTarget,
  parseProductionOrigin,
  PRODUCTION_CONFIRMATION,
} from './production-contracts';
import { parseDeployHook } from './release-transport';

export const PRODUCTION_RELEASE_POLL_ATTEMPTS = 60;
export const PRODUCTION_RELEASE_POLL_INTERVAL_MS = 10_000;
const PRODUCTION_RELEASE_REQUEST_TIMEOUT_MS = 5_000;

export type ProductionReleaseMarker = {
  version: 1;
  previousDeploymentUrl: string | null;
  previousCommitSha: string;
  hookJobId: string;
  hookCreatedAt: number;
  activatedDeploymentUrl?: string;
};

export type ProductionDeploymentObservation = {
  deploymentUrl: string | null;
  commitSha: string;
};

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

function parseDeploymentUrl(value: string | null): string | null {
  if (!value || value.length > 253 || !/^[a-z0-9.-]+$/i.test(value)) return null;
  try {
    const url = new URL(`https://${value}`);
    if (
      url.hostname !== value.toLowerCase() ||
      !url.hostname.endsWith('.vercel.app') ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.hostname;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseHookJob(value: unknown): { id: string; createdAt: number } | null {
  if (!isRecord(value) || !isRecord(value.job)) return null;
  const { id, state, createdAt } = value.job;
  if (
    typeof id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(id) ||
    state !== 'PENDING' ||
    typeof createdAt !== 'number' ||
    !Number.isSafeInteger(createdAt) ||
    createdAt <= 0
  ) {
    return null;
  }
  return { id, createdAt };
}

export function parseProductionReleaseMarker(value: unknown): ProductionReleaseMarker {
  if (!isRecord(value)) {
    throw new DeploymentError('RELEASE_MARKER_INVALID', 'Production release marker is invalid.');
  }
  const previousDeploymentUrl =
    value.previousDeploymentUrl === null
      ? null
      : parseDeploymentUrl(
          typeof value.previousDeploymentUrl === 'string' ? value.previousDeploymentUrl : null,
        );
  const activatedDeploymentUrl =
    value.activatedDeploymentUrl === undefined
      ? undefined
      : parseDeploymentUrl(
          typeof value.activatedDeploymentUrl === 'string' ? value.activatedDeploymentUrl : null,
        );
  if (
    value.version !== 1 ||
    (value.previousDeploymentUrl !== null && !previousDeploymentUrl) ||
    typeof value.previousCommitSha !== 'string' ||
    !/^[a-f0-9]{40}$/.test(value.previousCommitSha) ||
    typeof value.hookJobId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(value.hookJobId) ||
    typeof value.hookCreatedAt !== 'number' ||
    !Number.isSafeInteger(value.hookCreatedAt) ||
    value.hookCreatedAt <= 0 ||
    (value.activatedDeploymentUrl !== undefined && !activatedDeploymentUrl) ||
    activatedDeploymentUrl === previousDeploymentUrl
  ) {
    throw new DeploymentError('RELEASE_MARKER_INVALID', 'Production release marker is invalid.');
  }
  return {
    version: 1,
    previousDeploymentUrl,
    previousCommitSha: value.previousCommitSha,
    hookJobId: value.hookJobId,
    hookCreatedAt: value.hookCreatedAt,
    ...(activatedDeploymentUrl ? { activatedDeploymentUrl } : {}),
  };
}

function releaseMarkerPath(env: NodeJS.ProcessEnv): string {
  const path = env.PRODUCTION_RELEASE_MARKER_FILE?.trim();
  if (!path || path.length > 1_024) {
    throw new DeploymentError(
      'RELEASE_MARKER_UNAVAILABLE',
      'A runner-local Production release marker file is required.',
    );
  }
  return path;
}

export async function loadProductionReleaseMarker(
  env: NodeJS.ProcessEnv,
): Promise<ProductionReleaseMarker> {
  try {
    const value: unknown = JSON.parse(await readFile(releaseMarkerPath(env), 'utf8'));
    return parseProductionReleaseMarker(value);
  } catch (error) {
    if (error instanceof DeploymentError) throw error;
    throw new DeploymentError(
      'RELEASE_MARKER_UNAVAILABLE',
      'The runner-local Production release marker is unavailable.',
    );
  }
}

export async function saveProductionReleaseMarker(
  env: NodeJS.ProcessEnv,
  marker: ProductionReleaseMarker,
): Promise<void> {
  const parsed = parseProductionReleaseMarker(marker);
  try {
    await writeFile(releaseMarkerPath(env), JSON.stringify(parsed), {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch {
    throw new DeploymentError(
      'RELEASE_MARKER_PERSISTENCE_FAILED',
      'The accepted Production release marker could not be persisted; inspect provider state before retrying.',
    );
  }
}

export async function observeProductionDeployment(
  origin: URL,
  fetcher: typeof fetch = fetch,
  allowLegacyMetadata = false,
): Promise<ProductionDeploymentObservation | null> {
  try {
    const response = await fetcher(new URL('/api/health/deployment', origin), {
      redirect: 'manual',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(PRODUCTION_RELEASE_REQUEST_TIMEOUT_MS),
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return null;
    }
    const body: unknown = await response.json();
    if (
      !isRecord(body) ||
      body.status !== 'ok' ||
      typeof body.commitSha !== 'string' ||
      !/^[a-f0-9]{40}$/.test(body.commitSha) ||
      (!('deploymentUrl' in body) && !allowLegacyMetadata)
    ) {
      return null;
    }
    const deploymentUrl =
      'deploymentUrl' in body
        ? parseDeploymentUrl(typeof body.deploymentUrl === 'string' ? body.deploymentUrl : null)
        : null;
    if ('deploymentUrl' in body && !deploymentUrl) return null;
    return { deploymentUrl, commitSha: body.commitSha };
  } catch {
    return null;
  }
}

/** One POST only: ambiguous responses require provider inspection, never an automatic re-trigger. */
export async function triggerProductionDeployHook(
  env: NodeJS.ProcessEnv,
  fetcher: typeof fetch = fetch,
): Promise<ProductionReleaseMarker> {
  const { origin } = parseProductionReleaseConfiguration(env);
  const baseline = await observeProductionDeployment(origin, fetcher, true);
  if (!baseline) {
    throw new DeploymentError(
      'DEPLOYMENT_BASELINE_UNAVAILABLE',
      'The active Production deployment instance could not be identified; the Deploy Hook was not invoked.',
    );
  }
  const url = parseDeployHook(env.VERCEL_DEPLOY_HOOK_URL);
  let response: Response;
  try {
    response = await fetcher(url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new DeploymentError(
      'DEPLOY_HOOK_FAILED',
      'The Production Deploy Hook was not confirmed; inspect provider state before retrying.',
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new DeploymentError(
      'DEPLOY_HOOK_FAILED',
      'The Production Deploy Hook was not confirmed; inspect provider state before retrying.',
    );
  }
  const job = await response
    .json()
    .then(parseHookJob)
    .catch(() => null);
  if (!job) {
    throw new DeploymentError(
      'DEPLOY_HOOK_RESPONSE_AMBIGUOUS',
      'The Production Deploy Hook response was ambiguous; inspect provider state before retrying.',
    );
  }
  return {
    version: 1,
    previousDeploymentUrl: baseline.deploymentUrl,
    previousCommitSha: baseline.commitSha,
    hookJobId: job.id,
    hookCreatedAt: job.createdAt,
  };
}

export async function waitForProductionDeployment(
  env: NodeJS.ProcessEnv,
  marker: ProductionReleaseMarker,
  fetcher: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<{
  commitSha: string;
  deploymentUrl: string;
  attempts: number;
  marker: ProductionReleaseMarker;
}> {
  const { origin, expectedSha } = parseProductionReleaseConfiguration(env);
  const release = parseProductionReleaseMarker(marker);
  let unavailable = 0;
  let sawNewInstance = false;
  let sawWrongSha = false;
  for (let attempt = 1; attempt <= PRODUCTION_RELEASE_POLL_ATTEMPTS; attempt++) {
    const observation = await observeProductionDeployment(origin, fetcher);
    if (!observation) {
      unavailable += 1;
    } else if (
      observation.deploymentUrl &&
      observation.deploymentUrl !== release.previousDeploymentUrl
    ) {
      sawNewInstance = true;
      if (observation.commitSha === expectedSha) {
        const activated = parseProductionReleaseMarker({
          ...release,
          activatedDeploymentUrl: observation.deploymentUrl,
        });
        return {
          commitSha: expectedSha,
          deploymentUrl: observation.deploymentUrl,
          attempts: attempt,
          marker: activated,
        };
      }
      sawWrongSha = true;
    }
    if (attempt < PRODUCTION_RELEASE_POLL_ATTEMPTS)
      await sleep(PRODUCTION_RELEASE_POLL_INTERVAL_MS);
  }
  if (unavailable === PRODUCTION_RELEASE_POLL_ATTEMPTS) {
    throw new DeploymentError(
      'DEPLOYMENT_PROVIDER_UNAVAILABLE',
      'Production deployment metadata remained unavailable during the bounded wait.',
    );
  }
  if (sawNewInstance && sawWrongSha) {
    throw new DeploymentError(
      'DEPLOYMENT_SHA_MISMATCH',
      'A new Production deployment instance activated with an unexpected commit SHA.',
    );
  }
  throw new DeploymentError(
    'DEPLOYMENT_INSTANCE_NOT_ACTIVATED',
    'The stable Production alias did not activate a new deployment instance during the bounded wait.',
  );
}

export async function isActivatedProductionDeployment(
  env: NodeJS.ProcessEnv,
  marker: ProductionReleaseMarker,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const { origin, expectedSha } = parseProductionReleaseConfiguration(env);
  const release = parseProductionReleaseMarker(marker);
  if (!release.activatedDeploymentUrl) return false;
  const observation = await observeProductionDeployment(origin, fetcher);
  return (
    observation?.deploymentUrl === release.activatedDeploymentUrl &&
    observation.commitSha === expectedSha
  );
}
