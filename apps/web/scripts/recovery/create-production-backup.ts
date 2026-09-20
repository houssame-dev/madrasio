import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseProductionOrigin } from '../deployment/production-contracts';
import { RecoveryError, assertProductionBackupTarget, safeRecoveryError } from './contracts';
import {
  createRecoveryBundle,
  type RecoveryBundleInput,
  type RecoveryBundleResult,
} from './create-recovery-bundle';

export type ProductionRecoveryBundle = RecoveryBundleResult;

export type RecoveryBundleCreator = (input: RecoveryBundleInput) => Promise<RecoveryBundleResult>;

export async function createProductionRecoveryBundle(
  env: NodeJS.ProcessEnv = process.env,
  createBundle: RecoveryBundleCreator = createRecoveryBundle,
): Promise<ProductionRecoveryBundle> {
  const url = assertProductionBackupTarget(env);
  const appOrigin = parseProductionOrigin(env.PRODUCTION_APP_ORIGIN).origin;
  const gitSha = env.RECOVERY_GIT_SHA?.trim() ?? '';
  if (!/^[a-f0-9]{40}$/.test(gitSha))
    throw new RecoveryError('BACKUP_MANIFEST_FAILED', 'Exact repository Git SHA is required.', {
      phase: 'target_verification',
      timeout: false,
      dbAccessBegan: false,
    });
  const output = resolve(env.RECOVERY_OUTPUT_PATH ?? '');
  if (!env.RECOVERY_OUTPUT_PATH || !output.endsWith('.age') || output.startsWith(resolve('.')))
    throw new RecoveryError(
      'BACKUP_ENCRYPTION_FAILED',
      'Encrypted output must be outside the repository.',
      { phase: 'target_verification', timeout: false, dbAccessBegan: false },
    );
  return createBundle({
    databaseUrl: url,
    databaseSslCa: env.DATABASE_SSL_CA,
    gitSha,
    outputPath: output,
    ageRecipient: env.BACKUP_AGE_RECIPIENT ?? '',
    source: {
      environment: 'production',
      projectRef: env.PRODUCTION_EXPECTED_PROJECT_REF!,
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
      expectedVaultNames: ['sms_production_app_origin', 'sms_production_cron_secret'],
      vercel: { rootDirectory: 'apps/web', framework: 'nextjs', region: 'fra1' },
    },
  });
}

async function main(): Promise<void> {
  const result = await createProductionRecoveryBundle();
  process.stdout.write(
    `${JSON.stringify({ event: 'recovery_bundle_created', backupId: result.backupId, bytes: result.bytes, ciphertextSha256: result.ciphertextSha256 })}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify(safeRecoveryError(error))}\n`);
    process.exitCode = 1;
  });
}
