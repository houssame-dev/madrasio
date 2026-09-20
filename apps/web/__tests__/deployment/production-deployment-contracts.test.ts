import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { parseProductionBootstrapConfig, parseSeedConfig } from '@/scripts/operator/contracts';
import {
  assertProductionMigrationTarget,
  assertProductionRuntimeTarget,
  buildProductionCronCommand,
  parseProductionCronConfiguration,
  parseProductionOrigin,
  PRODUCTION_CONFIRMATION,
  PRODUCTION_CRON_JOBS,
  PRODUCTION_VAULT_SECRET_NAMES,
} from '@/scripts/deployment/production-contracts';
import {
  isActivatedProductionDeployment,
  parseProductionReleaseConfiguration,
  parseProductionReleaseMarker,
  PRODUCTION_RELEASE_POLL_ATTEMPTS,
  triggerProductionDeployHook,
  waitForProductionDeployment,
} from '@/scripts/deployment/production-release-transport';

const repoRoot = resolve(process.cwd(), '../..');
const productionRef = 'abcdefghijklmnopqrst';
const stagingRef = 'cqeaxlttezunirsmkrxz';
const ca = '-----BEGIN CERTIFICATE-----\ntest-only\n-----END CERTIFICATE-----';
const oldSha = 'a'.repeat(40);
const newSha = 'b'.repeat(40);
const oldDeployment = 'madrasio-old-instance.vercel.app';
const newDeployment = 'madrasio-new-instance.vercel.app';

function deploymentResponse(deploymentUrl: string, commitSha: string, status = 200): Response {
  return Response.json(
    { status: 'ok', commitSha, deploymentUrl },
    { status },
  );
}

function releaseMarker(overrides: Record<string, unknown> = {}) {
  return parseProductionReleaseMarker({
    version: 1,
    previousDeploymentUrl: oldDeployment,
    previousCommitSha: oldSha,
    hookJobId: 'job_test_123',
    hookCreatedAt: 1_700_000_000_000,
    ...overrides,
  });
}

function productionEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    DEPLOY_TARGET_ENV: 'production',
    DEPLOY_EXPECTED_PROJECT_REF: productionRef,
    PRODUCTION_EXPECTED_PROJECT_REF: productionRef,
    PRODUCTION_DEPLOY_CONFIRMATION: PRODUCTION_CONFIRMATION,
    PRODUCTION_APP_ORIGIN: 'https://madrasio.vercel.app',
    DEPLOY_EXPECTED_SHA: 'a'.repeat(40),
    DATABASE_SSL_CA: ca,
    DATABASE_URL: `postgresql://postgres.${productionRef}:secret@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
    MIGRATION_DATABASE_URL: `postgresql://postgres.${productionRef}:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
    ...overrides,
  };
}

function productionBootstrapEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    ...productionEnv(),
    BOOTSTRAP_TARGET_ENV: 'production',
    BOOTSTRAP_EXPECTED_PROJECT_REF: productionRef,
    BOOTSTRAP_PRODUCTION_CONFIRMATION: 'BOOTSTRAP_PRODUCTION',
    PRODUCTION_CUSTOMER_DATA_BACKUP_CONFIRMED: 'BACKUP_AND_RESTORE_ACCEPTED',
    SUPABASE_URL: `https://${productionRef}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-test-value',
    SUPABASE_SECRET_KEY: 'test-only-modern-secret',
    BOOTSTRAP_ADMIN_EMAIL: 'admin@production.example',
    BOOTSTRAP_ADMIN_PASSWORD: 'production-password-for-test',
    BOOTSTRAP_SCHOOL_NAME: 'Production School',
    BOOTSTRAP_SCHOOL_TIMEZONE: 'Africa/Casablanca',
    ...overrides,
  };
}

describe('Production deployment target contracts', () => {
  it('requires exact distinct Production project and correct pooler modes', () => {
    expect(assertProductionMigrationTarget(productionEnv()).port).toBe('5432');
    expect(assertProductionRuntimeTarget(productionEnv()).port).toBe('6543');
    expect(() =>
      assertProductionMigrationTarget(
        productionEnv({
          DEPLOY_EXPECTED_PROJECT_REF: stagingRef,
          PRODUCTION_EXPECTED_PROJECT_REF: stagingRef,
          MIGRATION_DATABASE_URL: `postgresql://postgres.${stagingRef}:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
        }),
      ),
    ).toThrow('distinct exact Production');
    expect(() =>
      assertProductionMigrationTarget(
        productionEnv({ PRODUCTION_EXPECTED_PROJECT_REF: undefined }),
      ),
    ).toThrow('Production Supabase project ref');
    expect(() =>
      assertProductionMigrationTarget(
        productionEnv({ DEPLOY_EXPECTED_PROJECT_REF: 'differentproduction1' }),
      ),
    ).toThrow('exact Production project');
    expect(() =>
      assertProductionMigrationTarget(
        productionEnv({
          MIGRATION_DATABASE_URL: `postgresql://postgres.prefix${productionRef}suffix:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
        }),
      ),
    ).toThrow('approved eu-central-1 connection');
  });

  it('requires a trusted CA and rejects insecure TLS escape hatches', () => {
    expect(() =>
      assertProductionMigrationTarget(productionEnv({ DATABASE_SSL_CA: undefined })),
    ).toThrow('trusted CA');
    expect(() =>
      assertProductionMigrationTarget(productionEnv({ NODE_TLS_REJECT_UNAUTHORIZED: '0' })),
    ).toThrow('Insecure TLS');
    expect(() =>
      assertProductionMigrationTarget(
        productionEnv({
          MIGRATION_DATABASE_URL: `${productionEnv().MIGRATION_DATABASE_URL}?sslmode=disable`,
        }),
      ),
    ).toThrow('approved eu-central-1 connection');
  });

  it('accepts a provider-confirmed Production origin but rejects STAGING and localhost', () => {
    expect(parseProductionOrigin('https://madrasio.vercel.app').origin).toBe(
      'https://madrasio.vercel.app',
    );
    expect(() => parseProductionOrigin('http://localhost:3000')).toThrow('distinct');
    expect(() =>
      parseProductionOrigin('https://madrasio-staging.vercel.app'),
    ).toThrow('distinct');
  });

  it('requires exact release and Cron confirmation phrases', () => {
    expect(parseProductionReleaseConfiguration(productionEnv()).expectedSha).toBe('a'.repeat(40));
    expect(() =>
      parseProductionReleaseConfiguration(productionEnv({ PRODUCTION_DEPLOY_CONFIRMATION: 'yes' })),
    ).toThrow('DEPLOY_PRODUCTION');
    expect(() =>
      parseProductionReleaseConfiguration(productionEnv({ DEPLOY_EXPECTED_SHA: 'main' })),
    ).toThrow('exact lowercase commit SHA');
    expect(() => parseProductionCronConfiguration(productionEnv())).toThrow(
      'CONFIGURE_PRODUCTION_CRON',
    );
  });

  it('uses Production-only Vault/job names and never embeds a secret', () => {
    expect(PRODUCTION_CRON_JOBS).toHaveLength(2);
    for (const job of PRODUCTION_CRON_JOBS) {
      const command = buildProductionCronCommand(job.path);
      expect(command).toContain(PRODUCTION_VAULT_SECRET_NAMES.origin);
      expect(command).toContain(PRODUCTION_VAULT_SECRET_NAMES.jobSecret);
      expect(command).not.toContain('sms_staging');
      expect(command).not.toMatch(/insert\s+into\s+notifications|update\s+outbox_events/i);
    }
  });

  it('sends one guarded deploy-hook request and retains only bounded job metadata', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(deploymentResponse(oldDeployment, oldSha))
      .mockResolvedValueOnce(
        Response.json({
          job: { id: 'job_test_123', state: 'PENDING', createdAt: 1_700_000_000_000 },
        }),
      );
    await expect(
      triggerProductionDeployHook(
        productionEnv({
          VERCEL_DEPLOY_HOOK_URL:
            'https://api.vercel.com/v1/integrations/deploy/prj_Project123/hook-name',
        }),
        fetcher,
      ),
    ).resolves.toEqual(releaseMarker());
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
});

describe('Production deployment-instance activation', () => {
  it('supports the one-time transition from legacy SHA-only metadata without accepting it', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ status: 'ok', commitSha: oldSha }))
      .mockResolvedValueOnce(
        Response.json({
          job: { id: 'job_test_123', state: 'PENDING', createdAt: 1_700_000_000_000 },
        }),
      );
    const marker = await triggerProductionDeployHook(
      productionEnv({
        VERCEL_DEPLOY_HOOK_URL:
          'https://api.vercel.com/v1/integrations/deploy/prj_Project123/hook-name',
      }),
      fetcher,
    );
    expect(marker).toMatchObject({ previousDeploymentUrl: null, previousCommitSha: oldSha });

    const waitFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ status: 'ok', commitSha: oldSha }))
      .mockResolvedValueOnce(deploymentResponse(newDeployment, oldSha));
    await expect(
      waitForProductionDeployment(productionEnv(), marker, waitFetcher, async () => {}),
    ).resolves.toMatchObject({ deploymentUrl: newDeployment, attempts: 2 });
  });

  it('rejects the old active instance even when it already serves the requested SHA', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(deploymentResponse(oldDeployment, oldSha));
    await expect(
      waitForProductionDeployment(productionEnv(), releaseMarker(), fetcher, async () => {}),
    ).rejects.toMatchObject({ code: 'DEPLOYMENT_INSTANCE_NOT_ACTIVATED' });
    expect(fetcher).toHaveBeenCalledTimes(PRODUCTION_RELEASE_POLL_ATTEMPTS);
  });

  it('waits while the new deployment is unavailable, then accepts its stable-alias activation', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(deploymentResponse(newDeployment, oldSha));
    const sleep = vi.fn(async () => {});
    await expect(
      waitForProductionDeployment(productionEnv(), releaseMarker(), fetcher, sleep),
    ).resolves.toMatchObject({
      commitSha: oldSha,
      deploymentUrl: newDeployment,
      attempts: 2,
      marker: { activatedDeploymentUrl: newDeployment },
    });
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('does not accept a READY candidate while the stable alias still serves the old instance', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(deploymentResponse(oldDeployment, oldSha));
    await expect(
      waitForProductionDeployment(productionEnv(), releaseMarker(), fetcher, async () => {}),
    ).rejects.toMatchObject({ code: 'DEPLOYMENT_INSTANCE_NOT_ACTIVATED' });
  });

  it('accepts a same-SHA redeploy only after a new instance is active at the stable alias', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(deploymentResponse(oldDeployment, oldSha))
      .mockResolvedValueOnce(deploymentResponse(newDeployment, oldSha));
    await expect(
      waitForProductionDeployment(productionEnv(), releaseMarker(), fetcher, async () => {}),
    ).resolves.toMatchObject({ deploymentUrl: newDeployment, attempts: 2 });
  });

  it('rejects a newly active deployment with the wrong SHA', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(deploymentResponse(newDeployment, newSha));
    await expect(
      waitForProductionDeployment(productionEnv(), releaseMarker(), fetcher, async () => {}),
    ).rejects.toMatchObject({ code: 'DEPLOYMENT_SHA_MISMATCH' });
  });

  it('preserves normal different-SHA release behavior while requiring a new instance', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(deploymentResponse(oldDeployment, oldSha))
      .mockResolvedValueOnce(deploymentResponse(newDeployment, newSha));
    await expect(
      waitForProductionDeployment(
        productionEnv({ DEPLOY_EXPECTED_SHA: newSha }),
        releaseMarker(),
        fetcher,
        async () => {},
      ),
    ).resolves.toMatchObject({ commitSha: newSha, deploymentUrl: newDeployment, attempts: 2 });
  });

  it('fails closed on an ambiguous accepted hook response without triggering twice', async () => {
    const privateValue = 'must-not-escape-provider-response';
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(deploymentResponse(oldDeployment, oldSha))
      .mockResolvedValueOnce(Response.json({ job: { state: 'PENDING' }, privateValue }));
    const error = await triggerProductionDeployHook(
      productionEnv({
        VERCEL_DEPLOY_HOOK_URL:
          'https://api.vercel.com/v1/integrations/deploy/prj_Project123/hook-name',
      }),
      fetcher,
    ).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'DEPLOY_HOOK_RESPONSE_AMBIGUOUS' });
    expect(JSON.stringify(error)).not.toContain(privateValue);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it.each([
    ['provider rejection', () => new Response('private provider error', { status: 500 })],
    ['network ambiguity', () => Promise.reject(new Error('private network detail'))],
  ])('fails closed on %s without a second hook attempt', async (_label, hookResult) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(deploymentResponse(oldDeployment, oldSha))
      .mockImplementationOnce(async () => Promise.resolve(hookResult()));
    const error = await triggerProductionDeployHook(
      productionEnv({
        VERCEL_DEPLOY_HOOK_URL:
          'https://api.vercel.com/v1/integrations/deploy/prj_Project123/hook-name',
      }),
      fetcher,
    ).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'DEPLOY_HOOK_FAILED' });
    expect(JSON.stringify(error)).not.toMatch(/private provider|private network/);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('does not invoke the hook when the active-instance baseline is unavailable', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }));
    await expect(
      triggerProductionDeployHook(
        productionEnv({
          VERCEL_DEPLOY_HOOK_URL:
            'https://api.vercel.com/v1/integrations/deploy/prj_Project123/hook-name',
        }),
        fetcher,
      ),
    ).rejects.toMatchObject({ code: 'DEPLOYMENT_BASELINE_UNAVAILABLE' });
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('classifies a bounded provider outage and never accepts absent metadata', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('provider unavailable'));
    await expect(
      waitForProductionDeployment(productionEnv(), releaseMarker(), fetcher, async () => {}),
    ).rejects.toMatchObject({ code: 'DEPLOYMENT_PROVIDER_UNAVAILABLE' });
    expect(fetcher).toHaveBeenCalledTimes(PRODUCTION_RELEASE_POLL_ATTEMPTS);
  });

  it('requires the activated marker instance and exact SHA during smoke verification', async () => {
    const marker = releaseMarker({ activatedDeploymentUrl: newDeployment });
    await expect(
      isActivatedProductionDeployment(
        productionEnv(),
        marker,
        vi.fn<typeof fetch>().mockResolvedValue(deploymentResponse(newDeployment, oldSha)),
      ),
    ).resolves.toBe(true);
    await expect(
      isActivatedProductionDeployment(
        productionEnv(),
        marker,
        vi.fn<typeof fetch>().mockResolvedValue(deploymentResponse(oldDeployment, oldSha)),
      ),
    ).resolves.toBe(false);
    await expect(
      isActivatedProductionDeployment(
        productionEnv(),
        marker,
        vi.fn<typeof fetch>().mockResolvedValue(deploymentResponse(newDeployment, newSha)),
      ),
    ).resolves.toBe(false);
  });

  it('rejects malformed or secret-shaped release marker values', () => {
    for (const value of [
      {},
      { ...releaseMarker(), previousDeploymentUrl: 'https://secret@example.com/value' },
      { ...releaseMarker(), activatedDeploymentUrl: oldDeployment },
      { ...releaseMarker(), hookJobId: 'secret value with spaces' },
    ]) {
      expect(() => parseProductionReleaseMarker(value)).toThrow('marker is invalid');
    }
  });
});

describe('Production workflow and cross-target repository gates', () => {
  it('is manual-only, exact-SHA, fail-closed, and migration-before-deploy', async () => {
    const workflow = await readFile(`${repoRoot}/.github/workflows/deploy-production.yml`, 'utf8');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/\n\s+push:/);
    expect(workflow).toContain('DEPLOY_PRODUCTION');
    expect(workflow).toContain('candidate_sha');
    expect(workflow).toContain('head_sha: sha');
    expect(workflow).toContain('git merge-base --is-ancestor');
    expect(workflow).toContain('environment: Production');
    expect(workflow).toContain('group: production-deployment');
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).not.toContain('PRODUCTION_RELEASE_MARKER_FILE: ${{ runner.temp }}');
    expect(workflow).toContain('marker_path="$RUNNER_TEMP/production-release-marker.json"');
    expect(workflow).toContain(
      '"PRODUCTION_RELEASE_MARKER_FILE=$marker_path" >> "$GITHUB_ENV"',
    );
    expect(workflow).not.toMatch(/PRODUCTION_RELEASE_MARKER_FILE=.*(?:secret|token|password)/i);
    expect(workflow).not.toMatch(/VERCEL_TOKEN|VERCEL_ORG_ID|VERCEL_PROJECT_ID/);
    const ordered = [
      'pnpm install --frozen-lockfile',
      'pnpm lint',
      'pnpm typecheck',
      'pnpm test',
      'pnpm build',
      'pnpm verify:production-target',
      'pnpm db:migrate',
      'pnpm verify:production-migration',
      'Promote exact candidate SHA to production-release',
      'Initialize runner-local Production release marker',
      'pnpm deploy:production-hook',
      'Wait for current deployment instance and exact SHA',
      'pnpm verify:production-release',
      'pnpm verify:production-smoke',
    ];
    let previous = -1;
    for (const marker of ordered) {
      const current = workflow.indexOf(marker);
      expect(current, marker).toBeGreaterThan(previous);
      previous = current;
    }
    expect(workflow).not.toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY/);
    expect(workflow).not.toContain(stagingRef);
    const preflight = await readFile(
      `${repoRoot}/apps/web/scripts/deployment/verify-production-target.ts`,
      'utf8',
    );
    expect(preflight).toContain('assertProductionMigrationTarget');
    expect(preflight).toContain('begin read only');
    expect(preflight).toContain('postgresConnectionConfig');
    expect(preflight).not.toMatch(/insert\s+into|update\s+|delete\s+from|alter\s+|create\s+/i);
  });

  it('keeps demo seeding unavailable for Production', () => {
    expect(() =>
      parseSeedConfig({
        ...productionBootstrapEnv(),
        STAGING_TEACHER_EMAIL: 'teacher@production.example',
        STAGING_TEACHER_PASSWORD: 'teacher-password-for-test',
        STAGING_PARENT_EMAIL: 'parent@production.example',
        STAGING_PARENT_PASSWORD: 'parent-password-for-test',
      }),
    ).toThrow(expect.objectContaining({ code: 'PRODUCTION_SEED_REFUSED' }));
  });

  it('requires exact Production bootstrap and accepted backup-recovery gates', () => {
    expect(parseProductionBootstrapConfig(productionBootstrapEnv()).BOOTSTRAP_TARGET_ENV).toBe(
      'production',
    );
    expect(() =>
      parseProductionBootstrapConfig(
        productionBootstrapEnv({ BOOTSTRAP_PRODUCTION_CONFIRMATION: 'yes' }),
      ),
    ).toThrow(expect.objectContaining({ code: 'INVALID_OPERATOR_INPUT' }));
    expect(() =>
      parseProductionBootstrapConfig(
        productionBootstrapEnv({ PRODUCTION_CUSTOMER_DATA_BACKUP_CONFIRMED: undefined }),
      ),
    ).toThrow(expect.objectContaining({ code: 'INVALID_OPERATOR_INPUT' }));
    expect(() =>
      parseProductionBootstrapConfig(
        productionBootstrapEnv({
          PRODUCTION_EXPECTED_PROJECT_REF: stagingRef,
          BOOTSTRAP_EXPECTED_PROJECT_REF: stagingRef,
          SUPABASE_URL: `https://${stagingRef}.supabase.co`,
          DATABASE_URL: `postgresql://postgres.${stagingRef}:secret@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
          MIGRATION_DATABASE_URL: `postgresql://postgres.${stagingRef}:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
        }),
      ),
    ).toThrow(expect.objectContaining({ code: 'PRODUCTION_TARGET_NOT_CONFIRMED' }));
  });

  it('keeps pre-tenant smoke independent of Admin or School fixtures', async () => {
    const smoke = await readFile(
      `${repoRoot}/apps/web/scripts/deployment/verify-production-smoke.ts`,
      'utf8',
    );
    expect(smoke).toContain("'/api/health'");
    expect(smoke).toContain("'/api/health/ready'");
    expect(smoke).toContain("'/api/v1/me'");
    expect(smoke).toContain('/rest/v1/schools?select=id&limit=1');
    expect(smoke).not.toMatch(/BOOTSTRAP_ADMIN|signInWithPassword|school_memberships/);
  });
});
