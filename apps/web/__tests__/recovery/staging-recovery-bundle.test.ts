import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { STAGING_PROJECT_REF } from '@/scripts/deployment/contracts';
import type { RecoveryBundleResult } from '@/scripts/recovery/create-recovery-bundle';
import { createProductionRecoveryBundle } from '@/scripts/recovery/create-production-backup';
import {
  cleanupStagingRecoveryBundle,
  createStagingRecoveryBundle,
} from '@/scripts/recovery/create-staging-recovery-bundle';

const productionRef = 'vpvbbsdmyhfjkbrbnocx';
const ca = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----';
const recipient = `age1${'q'.repeat(58)}`;
const gitSha = 'a'.repeat(40);
const result: RecoveryBundleResult = {
  backupId: '20260920T010203Z-aaaaaaaaaaaa-0123456789abcdef',
  snapshotAt: '2026-09-20T01:02:03.000Z',
  outputPath: 'replaced-by-test',
  bytes: 42,
  ciphertextSha256: 'b'.repeat(64),
  applicationTableCount: 39,
  authUserCount: 1,
};

function stagingEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    DEPLOY_TARGET_ENV: 'staging',
    STAGING_EXPECTED_PROJECT_REF: STAGING_PROJECT_REF,
    MIGRATION_DATABASE_URL: `postgresql://postgres.${STAGING_PROJECT_REF}:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
    DATABASE_SSL_CA: ca,
    STAGING_APP_ORIGIN: 'https://school-management-system-staging.vercel.app',
    RECOVERY_GIT_SHA: gitSha,
    BACKUP_AGE_RECIPIENT: recipient,
    ...overrides,
  };
}

function productionEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    DEPLOY_TARGET_ENV: 'production',
    DEPLOY_EXPECTED_PROJECT_REF: productionRef,
    PRODUCTION_EXPECTED_PROJECT_REF: productionRef,
    MIGRATION_DATABASE_URL: `postgresql://postgres.${productionRef}:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
    DATABASE_SSL_CA: ca,
    PRODUCTION_APP_ORIGIN: 'https://madrasio.vercel.app',
    RECOVERY_GIT_SHA: gitSha,
    RECOVERY_OUTPUT_PATH: join(tmpdir(), 'production-recovery-test.age'),
    BACKUP_AGE_RECIPIENT: recipient,
    ...overrides,
  };
}

describe('guarded recovery bundle wrappers', () => {
  it('fixes the Production source contract before invoking the shared core', async () => {
    const create = vi.fn(async (input) => ({ ...result, outputPath: input.outputPath }));
    await createProductionRecoveryBundle(
      productionEnv({ RECOVERY_SOURCE_ENVIRONMENT: 'staging' }),
      create,
    );
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]![0]).toMatchObject({
      source: { environment: 'production', projectRef: productionRef },
      providerContract: { appOrigin: 'https://madrasio.vercel.app' },
    });
  });

  it('creates a generated local-only STAGING result with a fixed source contract', async () => {
    const create = vi.fn(async (input) => ({ ...result, outputPath: input.outputPath }));
    const bundle = await createStagingRecoveryBundle(
      stagingEnv({ RECOVERY_SOURCE_ENVIRONMENT: 'production' }),
      create,
    );
    try {
      expect(create).toHaveBeenCalledOnce();
      expect(create.mock.calls[0]![0]).toMatchObject({
        source: { environment: 'staging', projectRef: STAGING_PROJECT_REF },
        providerContract: {
          appOrigin: 'https://school-management-system-staging.vercel.app',
          expectedVaultNames: ['sms_staging_app_origin', 'sms_staging_cron_secret'],
        },
      });
      expect(bundle.outputPath).toBe(join(bundle.workspacePath, 'staging-recovery.age'));
      expect(bundle.workspacePath.startsWith(tmpdir())).toBe(true);
    } finally {
      await cleanupStagingRecoveryBundle(bundle);
    }
    expect(existsSync(bundle.workspacePath)).toBe(false);
  });

  it('rejects caller-selected STAGING output paths before the shared core', async () => {
    const create = vi.fn();
    await expect(
      createStagingRecoveryBundle(
        stagingEnv({ RECOVERY_OUTPUT_PATH: join(tmpdir(), 'x.age') }),
        create,
      ),
    ).rejects.toMatchObject({ code: 'BACKUP_TARGET_VERIFICATION_FAILED' });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects Production credentials at the STAGING wrapper boundary', async () => {
    const create = vi.fn();
    await expect(
      createStagingRecoveryBundle(
        stagingEnv({
          MIGRATION_DATABASE_URL: productionEnv().MIGRATION_DATABASE_URL,
        }),
        create,
      ),
    ).rejects.toMatchObject({ code: 'BACKUP_TARGET_VERIFICATION_FAILED' });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects STAGING credentials at the Production wrapper boundary', async () => {
    const create = vi.fn();
    await expect(
      createProductionRecoveryBundle(
        productionEnv({
          MIGRATION_DATABASE_URL: stagingEnv().MIGRATION_DATABASE_URL,
        }),
        create,
      ),
    ).rejects.toMatchObject({ code: 'BACKUP_TARGET_VERIFICATION_FAILED' });
    expect(create).not.toHaveBeenCalled();
  });

  it('has no STAGING R2 or heartbeat dependency', async () => {
    const source = await readFile(
      join(process.cwd(), 'scripts/recovery/create-staging-recovery-bundle.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/from ['"].*\/(?:r2|heartbeat|automation)['"]/);
  });
});
