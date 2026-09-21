import { writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { postgresConnectionConfig } from '@school/database/connection';
import { applicationSecurityAuditSql, assertApplicationSecurity } from '@school/database/security';
import { Pool } from 'pg';

import { readRecoveryBundle } from './bundle';
import {
  RECOVERY_TABLES,
  RecoveryError,
  assertIsolatedRestoreTarget,
  safeRecoveryError,
  type RecoveryFailureCode,
  type RecoveryPhase,
} from './contracts';
import { cleanupRecoveryWorkDirectory, createRecoveryWorkDirectory } from './filesystem';
import { loadForeignKeys } from './inventory';
import {
  canonicalJson,
  hashBuffer,
  loadMigrationMetadata,
  parseRecoveryManifest,
  resolveRecoveryMigrationsDirectory,
} from './manifest';
import {
  assertAuthSchemaCompatible,
  assertEmptyRestoreFoundation,
  assertMigrationJournal,
  buildRestoreOrder,
  buildSequenceReconciliationSql,
  reconcileRestoredData,
  runFailClosedRestore,
} from './restore';
import {
  assertPostgresContainerArchiveReadable,
  decryptBundle,
  pgRestoreTableSelection,
  runCommand,
} from './tools';

function localPgEnvironment(url: URL): Record<string, string> {
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
  };
}

async function inRestorePhase<T>(
  phase: RecoveryPhase,
  fallbackCode: RecoveryFailureCode,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof RecoveryError && error.diagnostic) throw error;
    throw new RecoveryError(
      error instanceof RecoveryError ? error.code : fallbackCode,
      'The isolated restore stopped before completion.',
      { phase, timeout: false },
    );
  }
}

export async function restoreLocalRecoveryBundle(
  runtimeEnv: NodeJS.ProcessEnv = process.env,
): Promise<{ backupId: string; tables: number }> {
  const url = assertIsolatedRestoreTarget(runtimeEnv);
  const encrypted = resolve(runtimeEnv.RECOVERY_BUNDLE_PATH ?? '');
  const identity = resolve(runtimeEnv.RECOVERY_AGE_IDENTITY_PATH ?? '');
  const repository = resolve(process.cwd(), '../..');
  const identityRelative = relative(repository, identity);
  if (
    !runtimeEnv.RECOVERY_BUNDLE_PATH ||
    !runtimeEnv.RECOVERY_AGE_IDENTITY_PATH ||
    !isAbsolute(identity) ||
    (!identityRelative.startsWith('..') && !isAbsolute(identityRelative))
  ) {
    throw new RecoveryError(
      'RESTORE_DECRYPTION_FAILED',
      'Recovery object and an untracked external age identity path are required.',
      { phase: 'restore_decryption', timeout: false },
    );
  }
  const work = await createRecoveryWorkDirectory();
  const plaintext = resolve(work, 'recovery.bundle');
  const dump = resolve(work, 'recovery-data.dump');
  let poolConfig;
  try {
    poolConfig = postgresConnectionConfig(url.toString());
  } catch {
    throw new RecoveryError(
      'RESTORE_TARGET_REJECTED',
      'The isolated restore target connection contract is invalid.',
      { phase: 'target_verification', timeout: false },
    );
  }
  const pool = new Pool(poolConfig);
  try {
    await inRestorePhase('restore_decryption', 'RESTORE_DECRYPTION_FAILED', () =>
      decryptBundle(encrypted, plaintext, identity),
    );
    const files = await inRestorePhase('restore_bundle_validation', 'RESTORE_MANIFEST_INVALID', () =>
      readRecoveryBundle(plaintext),
    );
    const manifestBytes = files.get('manifest.json');
    const dumpBytes = files.get('recovery-data.dump');
    if (!manifestBytes || !dumpBytes)
      throw new RecoveryError(
        'RESTORE_MANIFEST_INVALID',
        'Required recovery artifacts are missing.',
        { phase: 'restore_bundle_validation', timeout: false },
      );
    const manifest = await inRestorePhase(
      'restore_manifest_validation',
      'RESTORE_MANIFEST_INVALID',
      async () => parseRecoveryManifest(JSON.parse(manifestBytes.toString('utf8'))),
    );
    if (
      runtimeEnv.RECOVERY_EXPECTED_SOURCE_PROJECT_REF !== manifest.source.projectRef ||
      runtimeEnv.RECOVERY_REPOSITORY_GIT_SHA !== manifest.gitSha
    ) {
      throw new RecoveryError(
        'RESTORE_MANIFEST_INVALID',
        'Recovery source project or repository revision was not explicitly confirmed.',
        { phase: 'restore_manifest_validation', timeout: false },
      );
    }
    const dumpArtifact = manifest.artifacts.find(
      (artifact) => artifact.filename === 'recovery-data.dump',
    );
    if (
      !dumpArtifact ||
      dumpArtifact.bytes !== dumpBytes.length ||
      dumpArtifact.sha256 !== hashBuffer(dumpBytes)
    ) {
      throw new RecoveryError(
        'RESTORE_MANIFEST_INVALID',
        'Recovery artifact does not match its manifest.',
        { phase: 'restore_manifest_validation', timeout: false },
      );
    }
    const repositoryMigrations = await loadMigrationMetadata(resolveRecoveryMigrationsDirectory());
    if (canonicalJson(repositoryMigrations) !== canonicalJson(manifest.migrations)) {
      throw new RecoveryError(
        'RESTORE_MANIFEST_INVALID',
        'Repository migration chain does not match the recovery point.',
        { phase: 'restore_manifest_validation', timeout: false },
      );
    }
    await inRestorePhase('restore_archive_validation', 'RESTORE_DATA_FAILED', async () => {
      await writeFile(dump, dumpBytes, { mode: 0o600 });
      await assertPostgresContainerArchiveReadable(
        { hostArchive: dump, hostWorkspace: work },
        runtimeEnv.RECOVERY_POSTGRES_CONTAINER_IMAGE ?? '',
      );
    });
    const env = localPgEnvironment(url);
    await runFailClosedRestore({
      foundation: async () => {
        const client = await pool.connect();
        try {
          await assertAuthSchemaCompatible(client, manifest.authSchema);
          await assertEmptyRestoreFoundation(client);
        } finally {
          client.release();
        }
      },
      migrations: async () => {
        await runCommand('pnpm', ['--filter', '@school/database', 'migrate'], {
          env: { ...env, MIGRATION_DATABASE_URL: url.toString() },
        });
        await assertMigrationJournal(pool, manifest.migrations.createdAt);
      },
      auth: async () => {
        for (const table of ['auth.users', 'auth.identities'])
          await runCommand(
            'pg_restore',
            [
              '--exit-on-error',
              '--data-only',
              '--no-owner',
              '--no-privileges',
              ...pgRestoreTableSelection(table),
              '--dbname',
              env.PGDATABASE!,
              dump,
            ],
            {
              env,
              recoveryArchiveMount: { hostArchive: dump, hostWorkspace: work },
            },
          );
      },
      application: async () => {
        const client = await pool.connect();
        try {
          const order = buildRestoreOrder(await loadForeignKeys(client)).filter((table) =>
            table.startsWith('public.'),
          );
          if (order.length !== RECOVERY_TABLES.length - 2)
            throw new RecoveryError('RESTORE_DATA_FAILED', 'Public restore order is incomplete.');
          for (const table of order)
            await runCommand(
              'pg_restore',
              [
                '--exit-on-error',
                '--data-only',
                '--no-owner',
                '--no-privileges',
                ...pgRestoreTableSelection(table),
                '--dbname',
                env.PGDATABASE!,
                dump,
              ],
              {
                env,
                recoveryArchiveMount: { hostArchive: dump, hostWorkspace: work },
              },
            );
        } finally {
          client.release();
        }
      },
      sequences: async () => {
        await pool.query(buildSequenceReconciliationSql());
      },
      verify: async () => {
        const client = await pool.connect();
        try {
          await reconcileRestoredData(client, manifest);
          const security = await client.query<{ violation: string }>(applicationSecurityAuditSql);
          try {
            assertApplicationSecurity(security.rows);
          } catch {
            throw new RecoveryError(
              'RESTORE_SECURITY_VERIFICATION_FAILED',
              'Restored database security invariants failed.',
            );
          }
        } finally {
          client.release();
        }
      },
    });
    return { backupId: manifest.backupId, tables: manifest.fingerprints.length };
  } finally {
    await pool.end().catch(() => undefined);
    await cleanupRecoveryWorkDirectory(work);
  }
}

async function main(): Promise<void> {
  const result = await restoreLocalRecoveryBundle();
  process.stdout.write(`${JSON.stringify({ event: 'isolated_restore_verified', ...result })}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify(safeRecoveryError(error))}\n`);
    process.exitCode = 1;
  });
}
