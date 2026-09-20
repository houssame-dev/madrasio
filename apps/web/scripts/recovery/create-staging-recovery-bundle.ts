import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { STAGING_PROJECT_REF, parseStagingOrigin } from '../deployment/contracts';
import {
  RecoveryError,
  assertStagingRecoveryTarget,
  preservePrimaryWithCleanupFailure,
  safeRecoveryError,
} from './contracts';
import {
  createRecoveryBundle,
  type RecoveryBundleInput,
  type RecoveryBundleResult,
} from './create-recovery-bundle';
import {
  assertRecoveryWorkDirectory,
  cleanupRecoveryWorkDirectory,
  createRecoveryWorkDirectory,
} from './filesystem';

export type StagingRecoveryBundle = RecoveryBundleResult & {
  workspacePath: string;
};

export type StagingRecoveryBundleCreator = (
  input: RecoveryBundleInput,
) => Promise<RecoveryBundleResult>;

export async function createStagingRecoveryBundle(
  env: NodeJS.ProcessEnv = process.env,
  createBundle: StagingRecoveryBundleCreator = createRecoveryBundle,
): Promise<StagingRecoveryBundle> {
  const url = assertStagingRecoveryTarget(env);
  const appOrigin = parseStagingOrigin(env.STAGING_APP_ORIGIN).origin;
  if (env.RECOVERY_OUTPUT_PATH) {
    throw new RecoveryError(
      'BACKUP_TARGET_VERIFICATION_FAILED',
      'STAGING recovery output is created only in a generated temporary workspace.',
      { phase: 'target_verification', timeout: false, dbAccessBegan: false },
    );
  }
  const workspacePath = await createRecoveryWorkDirectory();
  const outputPath = resolve(workspacePath, 'staging-recovery.age');
  try {
    const result = await createBundle({
      databaseUrl: url,
      databaseSslCa: env.DATABASE_SSL_CA,
      gitSha: env.RECOVERY_GIT_SHA?.trim() ?? '',
      outputPath,
      ageRecipient: env.BACKUP_AGE_RECIPIENT ?? '',
      source: {
        environment: 'staging',
        projectRef: STAGING_PROJECT_REF,
        region: 'eu-central-1',
      },
      providerContract: {
        version: 1,
        region: 'eu-central-1',
        appOrigin,
        dataApi: 'disabled',
        sslEnforcement: 'required',
        callbackPath: '/auth/confirm',
        passwordMinimum: 8,
        publicSignup: false,
        anonymousSignin: false,
        expectedCronJobs: 2,
        expectedVaultNames: ['sms_staging_app_origin', 'sms_staging_cron_secret'],
        vercel: { rootDirectory: 'apps/web', framework: 'nextjs', region: 'fra1' },
      },
    });
    return { ...result, workspacePath };
  } catch (error) {
    try {
      await cleanupRecoveryWorkDirectory(workspacePath);
    } catch (cleanupError) {
      throw preservePrimaryWithCleanupFailure(error, cleanupError);
    }
    throw error;
  }
}

export async function cleanupStagingRecoveryBundle(
  bundle: Pick<StagingRecoveryBundle, 'workspacePath' | 'outputPath'>,
): Promise<void> {
  const workspace = assertRecoveryWorkDirectory(bundle.workspacePath);
  if (resolve(bundle.outputPath) !== resolve(workspace, 'staging-recovery.age')) {
    throw new RecoveryError(
      'BACKUP_PLAINTEXT_CLEANUP_FAILED',
      'Refused cleanup for an invalid STAGING recovery artifact location.',
      { phase: 'cleanup', timeout: false },
    );
  }
  await cleanupRecoveryWorkDirectory(workspace);
}

async function main(): Promise<void> {
  const result = await createStagingRecoveryBundle();
  process.stdout.write(
    `${JSON.stringify({ event: 'staging_recovery_bundle_created', backupId: result.backupId, outputPath: result.outputPath, bytes: result.bytes, ciphertextSha256: result.ciphertextSha256 })}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify(safeRecoveryError(error))}\n`);
    process.exitCode = 1;
  });
}
