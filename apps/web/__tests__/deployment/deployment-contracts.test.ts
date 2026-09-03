import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertStagingMigrationTarget,
  buildCronCommand,
  CRON_JOBS,
  CRON_SCHEDULE,
  parseCronConfiguration,
  parseStagingOrigin,
  STAGING_PROJECT_REF,
  VAULT_SECRET_NAMES,
} from '@/scripts/deployment/contracts';

const repoRoot = resolve(process.cwd(), '../..');

function migrationEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    DEPLOY_TARGET_ENV: 'staging',
    DEPLOY_EXPECTED_PROJECT_REF: STAGING_PROJECT_REF,
    MIGRATION_DATABASE_URL: `postgresql://postgres.${STAGING_PROJECT_REF}:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
    ...overrides,
  };
}

describe('STAGING deployment contracts', () => {
  it('accepts only the reviewed STAGING Session Pooler migration target', () => {
    expect(assertStagingMigrationTarget(migrationEnv()).port).toBe('5432');
    expect(() =>
      assertStagingMigrationTarget(migrationEnv({ DEPLOY_TARGET_ENV: 'production' })),
    ).toThrow('approved STAGING');
    expect(() =>
      assertStagingMigrationTarget(
        migrationEnv({
          MIGRATION_DATABASE_URL: `postgresql://postgres.${STAGING_PROJECT_REF}:secret@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
        }),
      ),
    ).toThrow('port 5432');
    expect(() =>
      assertStagingMigrationTarget(
        migrationEnv({
          MIGRATION_DATABASE_URL:
            'postgresql://postgres.otherproject:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
        }),
      ),
    ).toThrow('approved STAGING');
  });

  it('requires a stable credential-free HTTPS application origin', () => {
    expect(parseStagingOrigin('https://school-management-system-staging.vercel.app').origin).toBe(
      'https://school-management-system-staging.vercel.app',
    );
    for (const value of [
      'http://school-management-system-staging.vercel.app',
      'http://localhost:3000',
      'https://user:secret@example.com',
      'https://example.com/a-path',
    ]) {
      expect(() => parseStagingOrigin(value)).toThrow('public HTTPS origin');
    }
  });

  it('requires explicit Cron configuration opt-in and a strong distinct secret', () => {
    const base = migrationEnv({
      STAGING_APP_ORIGIN: 'https://school-management-system-staging.vercel.app',
      CRON_SECRET: 'a-dedicated-cron-secret-with-more-than-32-characters',
    });
    expect(() => parseCronConfiguration(base)).toThrow('RUN_STAGING_CRON_CONFIGURATION=1');
    expect(
      parseCronConfiguration({ ...base, RUN_STAGING_CRON_CONFIGURATION: '1' }).origin.origin,
    ).toBe('https://school-management-system-staging.vercel.app');
    expect(() =>
      parseCronConfiguration({
        ...base,
        RUN_STAGING_CRON_CONFIGURATION: '1',
        SUPABASE_SERVICE_ROLE_KEY: base.CRON_SECRET,
      }),
    ).toThrow('distinct from the Supabase service-role');
  });

  it('builds two bounded Cron commands that reference Vault rather than secret values', () => {
    expect(CRON_JOBS).toHaveLength(2);
    expect(CRON_SCHEDULE).toBe('* * * * *');
    for (const job of CRON_JOBS) {
      const command = buildCronCommand(job.path);
      expect(command).toContain(job.path);
      expect(command).toContain(VAULT_SECRET_NAMES.origin);
      expect(command).toContain(VAULT_SECRET_NAMES.jobSecret);
      expect(command).not.toContain('a-dedicated-cron-secret');
      expect(command).not.toMatch(/insert\s+into\s+notifications|update\s+outbox_events/i);
    }
  });

  it('keeps validation, build, migration, verification, deploy, and smoke in fail-closed order', async () => {
    const workflow = await readFile(`${repoRoot}/.github/workflows/deploy-staging.yml`, 'utf8');
    const ordered = [
      'pnpm install --frozen-lockfile',
      'pnpm lint',
      'pnpm typecheck',
      'pnpm test',
      'pnpm build',
      'pnpm db:migrate',
      'pnpm verify:staging-migration',
      'Promote exact tested SHA to staging-release',
      'pnpm deploy:staging-hook',
      'pnpm verify:staging-release',
      'pnpm verify:staging-smoke',
    ];
    let previous = -1;
    for (const marker of ordered) {
      const current = workflow.indexOf(marker);
      expect(current, marker).toBeGreaterThan(previous);
      previous = current;
    }
    expect(workflow).toContain('environment: staging');
    expect(workflow).toContain('group: staging-deployment');
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).not.toContain('pull_request_target');
    for (const forbidden of [
      'VERCEL_TOKEN',
      'VERCEL_ORG_ID',
      'VERCEL_PROJECT_ID',
      'vercel pull',
      'vercel build',
      'vercel deploy',
      'pnpm dlx',
    ]) {
      expect(workflow).not.toContain(forbidden);
    }
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(workflow).toContain('DEPLOY_EXPECTED_SHA: ${{ github.sha }}');
    expect(workflow).toContain('DATABASE_SSL_CA: ${{ secrets.DATABASE_SSL_CA }}');
    expect(workflow).not.toContain('vars.DATABASE_SSL_CA');
    expect(workflow).toContain("ref: 'refs/heads/staging-release', sha: context.sha");
    expect(workflow).toContain('sha: context.sha, force: false');
    expect(workflow).toContain('promoted.data.object.sha !== context.sha');
    expect(workflow).toContain('contents: write');
    expect(workflow).toContain('VERCEL_DEPLOY_HOOK_URL: ${{ secrets.VERCEL_DEPLOY_HOOK_URL }}');
    const ci = await readFile(`${repoRoot}/.github/workflows/ci.yml`, 'utf8');
    expect(ci).toContain('contents: read');
    expect(ci).not.toContain('contents: write');
  });

  it('does not retain the unused Vercel CLI dependency', async () => {
    const rootPackage = JSON.parse(await readFile(`${repoRoot}/package.json`, 'utf8')) as {
      devDependencies: Record<string, string>;
    };
    expect(rootPackage.devDependencies.vercel).toBeUndefined();
  });

  it('does not attach migrations to install, build, or application startup', async () => {
    const rootPackage = JSON.parse(await readFile(`${repoRoot}/package.json`, 'utf8')) as {
      scripts: Record<string, string>;
    };
    const webPackage = JSON.parse(await readFile(`${repoRoot}/apps/web/package.json`, 'utf8')) as {
      scripts: Record<string, string>;
    };
    for (const name of ['prebuild', 'postinstall', 'build', 'start']) {
      expect(rootPackage.scripts[name] ?? '').not.toMatch(
        /db:migrate|\bpnpm db\b|drizzle-kit migrate/,
      );
      expect(webPackage.scripts[name] ?? '').not.toMatch(
        /db:migrate|\bpnpm db\b|drizzle-kit migrate/,
      );
    }
  });

  it('disables Vercel Git deployment and pins one Frankfurt function region', async () => {
    const config = JSON.parse(await readFile(`${repoRoot}/apps/web/vercel.json`, 'utf8')) as {
      git: { deploymentEnabled: boolean };
      regions: string[];
    };
    expect(config.git.deploymentEnabled).toBe(false);
    expect(config).not.toHaveProperty('github');
    expect(config.regions).toEqual(['fra1']);
  });
});
