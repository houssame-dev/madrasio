import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { postgresConnectionConfig } from '@school/database/connection';
import { Pool } from 'pg';

import { writeRecoveryBundle } from './bundle';
import {
  APPLICATION_TABLES,
  RECOVERY_TABLES,
  RecoveryError,
  preservePrimaryWithCleanupFailure,
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
import type { RecoveryManifest } from './manifest';
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

export type RecoveryBundleResult = {
  backupId: string;
  snapshotAt: string;
  outputPath: string;
  bytes: number;
  ciphertextSha256: string;
  applicationTableCount: number;
  authUserCount: number;
};

export type RecoveryBundleInput = {
  databaseUrl: URL;
  databaseSslCa: string | undefined;
  gitSha: string;
  outputPath: string;
  ageRecipient: string;
  source: RecoveryManifest['source'];
  providerContract: RecoveryManifest['providerContract'];
};

/** Internal artifact builder. Target identity and external side effects belong to guarded wrappers. */
export async function createRecoveryBundle(
  input: RecoveryBundleInput,
): Promise<RecoveryBundleResult> {
  const gitSha = input.gitSha.trim();
  if (!/^[a-f0-9]{40}$/.test(gitSha))
    throw new RecoveryError('BACKUP_MANIFEST_FAILED', 'Exact repository Git SHA is required.', {
      phase: 'target_verification',
      timeout: false,
      dbAccessBegan: false,
    });
  const output = resolve(input.outputPath);
  if (!input.outputPath || !output.endsWith('.age') || output.startsWith(resolve('.')))
    throw new RecoveryError(
      'BACKUP_ENCRYPTION_FAILED',
      'Encrypted output must be outside the repository.',
      { phase: 'target_verification', timeout: false, dbAccessBegan: false },
    );
  const recipient = validateAgeRecipient(input.ageRecipient);
  await assertToolVersions();
  const work = await createRecoveryWorkDirectory();
  const dump = resolve(work, 'recovery-data.dump');
  const manifestPath = resolve(work, 'manifest.json');
  const bundle = resolve(work, 'recovery.bundle');
  let toolCleanup: string | undefined;
  const pool = new Pool({
    ...postgresConnectionConfig(input.databaseUrl.toString(), input.databaseSslCa),
    connectionTimeoutMillis: 30_000,
    query_timeout: 2 * 60_000,
  });
  let result: RecoveryBundleResult | undefined;
  let primaryError: unknown;
  try {
    const tool = await postgresToolEnvironment(input.databaseUrl.toString(), input.databaseSslCa);
    toolCleanup = tool.cleanupDirectory;
    await writeFile(dump, '', { mode: 0o600 });
    await withExportedSnapshot(pool, async ({ snapshot, timestamp, coordinator }) => {
      await assertRecoveryInventory(coordinator);
      await assertSupportedAuthState(coordinator);
      const dumpPromise = createPgDumpArchive(
        pgDumpArguments(dump, snapshot),
        tool.env,
        undefined,
        { hostArchive: dump, hostWorkspace: work, writable: true },
      );
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
        source: input.source,
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
        providerContract: input.providerContract,
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
