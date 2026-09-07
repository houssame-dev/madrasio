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
  parseProductionReleaseConfiguration,
  triggerProductionDeployHook,
} from '@/scripts/deployment/production-release-transport';

const repoRoot = resolve(process.cwd(), '../..');
const productionRef = 'abcdefghijklmnopqrst';
const stagingRef = 'cqeaxlttezunirsmkrxz';
const ca = '-----BEGIN CERTIFICATE-----\ntest-only\n-----END CERTIFICATE-----';

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
      parseProductionOrigin('https://school-management-system-staging.vercel.app'),
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

  it('sends one guarded deploy-hook request and discards the response', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi.fn().mockResolvedValue({ ok: true, body: { cancel } });
    await triggerProductionDeployHook(
      productionEnv({
        VERCEL_DEPLOY_HOOK_URL:
          'https://api.vercel.com/v1/integrations/deploy/prj_Project123/hook-name',
      }),
      fetcher as unknown as typeof fetch,
    );
    expect(fetcher).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
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
      'pnpm deploy:production-hook',
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
