import { writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

import { postgresConnectionConfig } from '@school/database/connection';
import { applicationSecurityAuditSql, assertApplicationSecurity } from '@school/database/security';
import { Pool } from 'pg';

import { readRecoveryBundle } from './bundle';
import {
  RECOVERY_TABLES,
  RecoveryError,
  assertIsolatedRestoreTarget,
  safeRecoveryError,
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
import { decryptBundle, runCommand } from './tools';

function localPgEnvironment(url: URL): Record<string, string> {
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
  };
}

async function main(): Promise<void> {
  const url = assertIsolatedRestoreTarget(process.env);
  const encrypted = resolve(process.env.RECOVERY_BUNDLE_PATH ?? '');
  const identity = resolve(process.env.RECOVERY_AGE_IDENTITY_PATH ?? '');
  const repository = resolve(process.cwd(), '../..');
  const identityRelative = relative(repository, identity);
  if (
    !process.env.RECOVERY_BUNDLE_PATH ||
    !process.env.RECOVERY_AGE_IDENTITY_PATH ||
    !isAbsolute(identity) ||
    (!identityRelative.startsWith('..') && !isAbsolute(identityRelative))
  ) {
    throw new RecoveryError(
      'RESTORE_DECRYPTION_FAILED',
      'Recovery object and an untracked external age identity path are required.',
    );
  }
  const work = await createRecoveryWorkDirectory();
  const plaintext = resolve(work, 'recovery.bundle');
  const dump = resolve(work, 'recovery-data.dump');
  const pool = new Pool(postgresConnectionConfig(url.toString()));
  try {
    await decryptBundle(encrypted, plaintext, identity);
    const files = await readRecoveryBundle(plaintext);
    const manifestBytes = files.get('manifest.json');
    const dumpBytes = files.get('recovery-data.dump');
    if (!manifestBytes || !dumpBytes)
      throw new RecoveryError(
        'RESTORE_MANIFEST_INVALID',
        'Required recovery artifacts are missing.',
      );
    const manifest = parseRecoveryManifest(JSON.parse(manifestBytes.toString('utf8')));
    if (
      process.env.RECOVERY_EXPECTED_SOURCE_PROJECT_REF !== manifest.source.projectRef ||
      process.env.RECOVERY_REPOSITORY_GIT_SHA !== manifest.gitSha
    ) {
      throw new RecoveryError(
        'RESTORE_MANIFEST_INVALID',
        'Recovery source project or repository revision was not explicitly confirmed.',
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
      );
    }
    const repositoryMigrations = await loadMigrationMetadata(
      resolveRecoveryMigrationsDirectory(),
    );
    if (canonicalJson(repositoryMigrations) !== canonicalJson(manifest.migrations)) {
      throw new RecoveryError(
        'RESTORE_MANIFEST_INVALID',
        'Repository migration chain does not match the recovery point.',
      );
    }
    await writeFile(dump, dumpBytes, { mode: 0o600 });
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
              '--table',
              table,
              '--dbname',
              env.PGDATABASE!,
              dump,
            ],
            { env },
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
                '--table',
                table,
                '--dbname',
                env.PGDATABASE!,
                dump,
              ],
              { env },
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
    process.stdout.write(
      `${JSON.stringify({ event: 'isolated_restore_verified', backupId: manifest.backupId, tables: manifest.fingerprints.length })}\n`,
    );
  } finally {
    await pool.end().catch(() => undefined);
    await cleanupRecoveryWorkDirectory(work);
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify(safeRecoveryError(error))}\n`);
  process.exitCode = 1;
});
