import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET, dynamic } from '@/app/api/health/deployment/route';
import { safeDeploymentError, STAGING_PROJECT_REF } from '@/scripts/deployment/contracts';
import {
  isExpectedDeployment,
  parseDeployHook,
  parseReleaseConfiguration,
  RELEASE_POLL_ATTEMPTS,
  RELEASE_POLL_INTERVAL_MS,
  STAGING_ORIGIN,
  triggerDeployHook,
  waitForDeployment,
} from '@/scripts/deployment/release-transport';

const sha = 'a'.repeat(40);
const env = {
  NODE_ENV: 'test',
  DEPLOY_TARGET_ENV: 'staging',
  DEPLOY_EXPECTED_PROJECT_REF: STAGING_PROJECT_REF,
  STAGING_APP_ORIGIN: STAGING_ORIGIN,
  DEPLOY_EXPECTED_SHA: sha,
  VERCEL_DEPLOY_HOOK_URL: 'https://api.vercel.com/v1/integrations/deploy/prj_test/test-only-hook',
} satisfies NodeJS.ProcessEnv;
const deployed = (commitSha: string | null = sha) => Response.json({ status: 'ok', commitSha });

afterEach(() => vi.unstubAllEnvs());

describe('STAGING Git release transport', () => {
  it('fails closed for wrong environment, project, origin, and missing/short SHA', () => {
    expect(parseReleaseConfiguration(env).expectedSha).toBe(sha);
    for (const overrides of [
      { DEPLOY_TARGET_ENV: 'production' },
      { DEPLOY_EXPECTED_PROJECT_REF: 'other' },
      { STAGING_APP_ORIGIN: 'https://other.vercel.app' },
      { DEPLOY_EXPECTED_SHA: '' },
      { DEPLOY_EXPECTED_SHA: 'abc123' },
    ]) {
      expect(() => parseReleaseConfiguration({ ...env, ...overrides })).toThrow();
    }
  });

  it('accepts only the HTTPS Vercel hook endpoint without redirects or credentials', () => {
    expect(parseDeployHook(env.VERCEL_DEPLOY_HOOK_URL).hostname).toBe('api.vercel.com');
    for (const value of [
      undefined,
      'not-a-url',
      'http://api.vercel.com/v1/integrations/deploy/prj_test/key',
      'https://evil.example/v1/integrations/deploy/prj_test/key',
      'https://user:password@api.vercel.com/v1/integrations/deploy/prj_test/key',
      `${env.VERCEL_DEPLOY_HOOK_URL}?redirect=elsewhere`,
      'https://api.vercel.com/v9/projects',
    ])
      expect(() => parseDeployHook(value)).toThrow('valid Vercel Deploy Hook secret');
  });

  it('sends exactly one POST and does not consume provider response fields', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ privateMetadata: 'unused' }));
    await expect(triggerDeployHook(env, fetcher)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ method: 'POST', redirect: 'manual' }),
    );
  });
  it('does not downgrade a confirmed 2xx when discarding the response body fails', async () => {
    const body = new ReadableStream({
      cancel() {
        throw new Error('response disposal failed');
      },
    });

    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(body, { status: 200 }));

    await expect(triggerDeployHook(env, fetcher)).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([301, 401, 500])('fails safely for HTTP %i without a second trigger', async (status) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('private response', { status }));
    await expect(triggerDeployHook(env, fetcher)).rejects.toMatchObject({
      code: 'DEPLOY_HOOK_FAILED',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not leak secret URLs, provider bodies, or network errors', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error(env.VERCEL_DEPLOY_HOOK_URL));
    const error = await triggerDeployHook(env, fetcher).catch((caught: unknown) =>
      safeDeploymentError(caught),
    );
    expect(JSON.stringify(error)).not.toContain('test-only-hook');
    expect(JSON.stringify(error)).not.toContain('api.vercel.com');
    expect(error).toMatchObject({ code: 'DEPLOY_HOOK_FAILED' });
  });

  it('does not invoke the hook for invalid STAGING configuration', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      triggerDeployHook({ ...env, DEPLOY_TARGET_ENV: 'production' }, fetcher),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('ignores an old release and unavailable health until the exact SHA appears', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(deployed('b'.repeat(40)))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(deployed());
    const sleep = vi.fn(async () => {});
    await expect(waitForDeployment(env, fetcher, sleep)).resolves.toEqual({
      commitSha: sha,
      attempts: 3,
    });
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(RELEASE_POLL_INTERVAL_MS);
    expect(fetcher).toHaveBeenLastCalledWith(
      new URL('/api/health/deployment', STAGING_ORIGIN),
      expect.objectContaining({ cache: 'no-store', redirect: 'manual' }),
    );
  });

  it('has a bounded wait and never accepts the previous deployment', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => deployed('b'.repeat(40)));
    const sleep = vi.fn(async () => {});
    await expect(waitForDeployment(env, fetcher, sleep)).rejects.toMatchObject({
      code: 'DEPLOYMENT_SHA_NOT_READY',
    });
    expect(fetcher).toHaveBeenCalledTimes(RELEASE_POLL_ATTEMPTS);
    expect(sleep).toHaveBeenCalledTimes(RELEASE_POLL_ATTEMPTS - 1);
  });

  it('never accepts redirects, malformed JSON, missing SHA, or network failure', async () => {
    for (const response of [
      new Response('', { status: 302 }),
      new Response('not json'),
      deployed(null),
      Response.json({ commitSha: sha }),
    ]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      expect(await isExpectedDeployment(new URL(STAGING_ORIGIN), sha, fetcher)).toBe(false);
    }
    expect(
      await isExpectedDeployment(
        new URL(STAGING_ORIGIN),
        sha,
        vi.fn<typeof fetch>().mockRejectedValue(new Error('network')),
      ),
    ).toBe(false);
  });
});

describe('public deployment metadata', () => {
  it('returns only liveness and provider commit SHA, without caching', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', sha);
    vi.stubEnv('CRON_SECRET', 'test-secret-must-not-be-exposed');
    vi.stubEnv('DATABASE_URL', 'test-database-must-not-be-exposed');
    vi.stubEnv('VERCEL_URL', 'school-app-instance.vercel.app');
    const response = GET(
      new NextRequest('https://school.example/api/health/deployment', {
        headers: { 'x-vercel-deployment-url': 'school-app-instance.vercel.app' },
      }),
    );
    expect(await response.json()).toEqual({
      status: 'ok',
      commitSha: sha,
      deploymentUrl: 'school-app-instance.vercel.app',
    });
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(dynamic).toBe('force-dynamic');
  });

  it.each([undefined, '', 'invalid-or-secret-metadata'])(
    'fails closed for unavailable/invalid provider SHA',
    async (value) => {
      vi.stubEnv('VERCEL_GIT_COMMIT_SHA', value);
      vi.stubEnv('VERCEL_URL', 'school-app-instance.vercel.app');
      expect(
        await GET(
          new NextRequest('https://school.example/api/health/deployment', {
            headers: { 'x-vercel-deployment-url': 'school-app-instance.vercel.app' },
          }),
        ).json(),
      ).toEqual({
        status: 'ok',
        commitSha: null,
        deploymentUrl: 'school-app-instance.vercel.app',
      });
    },
  );

  it('fails closed when provider deployment identity is absent or inconsistent', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', sha);
    vi.stubEnv('VERCEL_URL', 'school-app-instance.vercel.app');
    for (const header of [undefined, 'different-instance.vercel.app', 'not-vercel.example']) {
      const response = GET(
        new NextRequest('https://school.example/api/health/deployment', {
          ...(header ? { headers: { 'x-vercel-deployment-url': header } } : {}),
        }),
      );
      expect(await response.json()).toEqual({
        status: 'ok',
        commitSha: sha,
        deploymentUrl: null,
      });
    }
  });
});
