import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { postgresConnectionConfig } from '@school/database/connection';
import { Pool } from 'pg';

import { writeRecoveryBundle } from './bundle';
import { parseProductionOrigin } from '../deployment/production-contracts';
import {
  APPLICATION_TABLES,
  RECOVERY_TABLES,
  RecoveryError,
  assertProductionBackupTarget,
  preservePrimaryWithCleanupFailure,
  safeRecoveryError,
} from './contracts';
import { cleanupRecoveryWorkDirectory, createRecoveryWorkDirectory } from './filesystem';
import {
  assertRecoveryInventory,
  assertSupportedAuthState,
  fingerprintTable,
  loadAuthSchemaContract,
  loadStatusAggregates,
} from './inventory';
import {
  artifactMetadata,
  createBackupId,
  hashBuffer,
  loadMigrationMetadata,
  loadServerVersion,
  resolveRecoveryMigrationsDirectory,
  validateRecoveryManifest,
  writeRecoveryManifest,
} from './manifest';
import { withExportedSnapshot } from './snapshot';
import {
  assertArchiveInventory,
  assertToolVersions,
  cleanupPostgresToolEnvironment,
  createPgDumpArchive,
  encryptBundle,
  inspectPgDumpArchive,
  pgDumpArguments,
  postgresToolEnvironment,
  validateAgeRecipient,
} from './tools';

export type ProductionRecoveryBundle = {
  backupId: string;
  snapshotAt: string;
  outputPath: string;
  bytes: number;
  ciphertextSha256: string;
  applicationTableCount: number;
  authUserCount: number;
};

export async function createProductionRecoveryBundle(
  env: NodeJS.ProcessEnv = process.env,
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
  const recipient = validateAgeRecipient(env.BACKUP_AGE_RECIPIENT);
  await assertToolVersions();
  const work = await createRecoveryWorkDirectory();
  const dump = resolve(work, 'recovery-data.dump');
  const manifestPath = resolve(work, 'manifest.json');
  const bundle = resolve(work, 'recovery.bundle');
  let toolCleanup: string | undefined;
  const pool = new Pool({
    ...postgresConnectionConfig(url.toString(), env.DATABASE_SSL_CA),
    connectionTimeoutMillis: 30_000,
    query_timeout: 2 * 60_000,
  });
  let result: ProductionRecoveryBundle | undefined;
  let primaryError: unknown;
  try {
    const tool = await postgresToolEnvironment(url.toString(), env.DATABASE_SSL_CA);
    toolCleanup = tool.cleanupDirectory;
    await withExportedSnapshot(pool, async ({ snapshot, timestamp, coordinator }) => {
      await assertRecoveryInventory(coordinator);
      await assertSupportedAuthState(coordinator);
      const dumpPromise = createPgDumpArchive(pgDumpArguments(dump, snapshot), tool.env);
      const fingerprintsPromise = (async () => {
        const values = [];
        for (const table of RECOVERY_TABLES)
          values.push(
            await fingerprintTable(coordinator, table as `auth.${string}` | `public.${string}`),
          );
        return values;
      })();
      const [dumpOutcome, fingerprintsOutcome] = await Promise.allSettled([
        dumpPromise,
        fingerprintsPromise,
      ]);
      if (dumpOutcome.status === 'rejected') throw dumpOutcome.reason;
      if (fingerprintsOutcome.status === 'rejected') throw fingerprintsOutcome.reason;
      const fingerprints = fingerprintsOutcome.value;
      const listing = await inspectPgDumpArchive(dump);
      assertArchiveInventory(listing);
      const migrations = await loadMigrationMetadata(resolveRecoveryMigrationsDirectory());
      const serverVersion = await loadServerVersion(coordinator);
      const backupId = createBackupId(timestamp, gitSha);
      const manifest = validateRecoveryManifest({
        format: 'madrasio-recovery-v1',
        backupId,
        snapshotAt: timestamp,
        source: {
          environment: 'production',
          projectRef: env.PRODUCTION_EXPECTED_PROJECT_REF,
          region: 'eu-central-1',
        },
        gitSha,
        postgres: { serverVersion, clientVersion: '17.6' },
        migrations,
        authSchema: await loadAuthSchemaContract(coordinator),
        fingerprints,
        lifecycleAggregates: await loadStatusAggregates(coordinator),
        artifacts: [await artifactMetadata(dump)],
        encryption: {
          format: 'age',
          toolVersion: '1.3.1',
          recipientFingerprint: hashBuffer(recipient),
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
      await writeRecoveryManifest(manifestPath, manifest);
      await writeRecoveryBundle(bundle, [manifestPath, dump]);
      await encryptBundle(bundle, output, recipient);
      const encrypted = await stat(output);
      result = {
        backupId,
        snapshotAt: timestamp,
        outputPath: output,
        bytes: encrypted.size,
        ciphertextSha256: hashBuffer(await readFile(output)),
        applicationTableCount: APPLICATION_TABLES.length,
        authUserCount:
          fingerprints.find((fingerprint) => fingerprint.table === 'auth.users')?.rowCount ?? 0,
      };
    });
  } catch (error) {
    primaryError = error;
  } finally {
    await pool.end().catch(() => undefined);
    let cleanupFailure: unknown;
    try {
      if (toolCleanup) await cleanupPostgresToolEnvironment(toolCleanup);
    } catch (cleanupError) {
      cleanupFailure = cleanupError;
    }
    try {
      await cleanupRecoveryWorkDirectory(work);
    } catch (cleanupError) {
      cleanupFailure ??= cleanupError;
    }
    if (cleanupFailure) {
      primaryError = primaryError
        ? preservePrimaryWithCleanupFailure(primaryError, cleanupFailure)
        : cleanupFailure;
    }
  }
  if (primaryError) throw primaryError;
  if (!result) {
    throw new RecoveryError(
      'BACKUP_ENCRYPTION_FAILED',
      'Encrypted recovery bundle was not created.',
    );
  }
  return result;
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
