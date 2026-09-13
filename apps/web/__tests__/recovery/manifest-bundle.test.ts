import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { readRecoveryBundle, writeRecoveryBundle } from '@/scripts/recovery/bundle';
import {
  RECOVERY_TABLES,
  safeRecoveryError,
} from '@/scripts/recovery/contracts';
import {
  artifactMetadata,
  createBackupId,
  loadMigrationMetadata,
  loadServerVersion,
  parseRecoveryManifest,
  resolveRecoveryMigrationsDirectory,
  validateRecoveryManifest,
  writeRecoveryManifest,
} from '@/scripts/recovery/manifest';

const sha256 = 'a'.repeat(64);
const gitSha = '3'.repeat(40);

async function manifestFixture(rowCount: number) {
  const directory = await mkdtemp(join(tmpdir(), 'manifest-bundle-test-'));
  const dump = join(directory, 'recovery-data.dump');
  const manifestPath = join(directory, 'manifest.json');
  const bundlePath = join(directory, 'recovery.bundle');
  await writeFile(dump, rowCount ? 'synthetic-non-empty-archive' : 'empty-production-archive');
  const migrationsDirectory = resolveRecoveryMigrationsDirectory();
  const migrations = await loadMigrationMetadata(migrationsDirectory);
  const serverVersion = await loadServerVersion({
    query: vi.fn(async () => ({ rows: [{ server_version: '17.6' }] })),
  } as never);
  const backupId = createBackupId('2026-09-13T15:09:01.123Z', gitSha);
  const manifest = validateRecoveryManifest({
    format: 'madrasio-recovery-v1',
    backupId,
    snapshotAt: '2026-09-13T15:09:01.123Z',
    source: {
      environment: 'production',
      projectRef: 'vpvbbsdmyhfjkbrbnocx',
      region: 'eu-central-1',
    },
    gitSha,
    postgres: { serverVersion, clientVersion: '17.6' },
    migrations,
    authSchema: [
      {
        table: 'users',
        ordinal: 1,
        column: 'id',
        dataType: 'uuid',
        udtName: 'uuid',
        nullable: false,
      },
      {
        table: 'identities',
        ordinal: 1,
        column: 'id',
        dataType: 'text',
        udtName: 'text',
        nullable: false,
      },
    ],
    fingerprints: RECOVERY_TABLES.map((table) => ({
      table,
      rowCount,
      primaryKeySha256: sha256,
      contentSha256: sha256,
      primaryKeyColumns: ['id'],
    })),
    lifecycleAggregates: {},
    artifacts: [await artifactMetadata(dump)],
    encryption: {
      format: 'age',
      toolVersion: '1.3.1',
      recipientFingerprint: sha256,
    },
    providerContract: {
      version: 1,
      region: 'eu-central-1',
      appOrigin: 'https://madrasio.vercel.app',
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
  return { directory, dump, manifestPath, bundlePath, manifest };
}

describe('Production manifest and bundle construction', () => {
  it('normalizes non-zero snapshot milliseconds into the established V1 backup ID', () => {
    const historicalTimestamp = new Date('2026-09-13T15:09:01.123Z')
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('.000', '');
    expect(historicalTimestamp).toBe('20260913T150901.123Z');
    expect(
      /^\d{8}T\d{6}Z-[a-f0-9]{7,40}-[a-f0-9]{16}$/.test(
        `${historicalTimestamp}-${gitSha.slice(0, 12)}-${'a'.repeat(16)}`,
      ),
    ).toBe(false);
    const backupId = createBackupId('2026-09-13T15:09:01.123Z', gitSha);
    expect(backupId).toMatch(/^20260913T150901Z-3{12}-[a-f0-9]{16}$/);
    expect(backupId).not.toContain('.123Z');
    expect(() => createBackupId('not-a-date', gitSha)).toThrowError(
      expect.objectContaining({
        code: 'BACKUP_MANIFEST_VALIDATION_FAILED',
        diagnostic: { phase: 'manifest_validation', timeout: false },
      }),
    );
  });

  it.each([
    ['empty Production-shaped', 0],
    ['synthetic non-empty', 1],
  ] as const)('round-trips the %s manifest and V1 bundle', async (_name, rowCount) => {
    const fixture = await manifestFixture(rowCount);
    try {
      await writeRecoveryManifest(fixture.manifestPath, fixture.manifest);
      const entries = await writeRecoveryBundle(fixture.bundlePath, [
        fixture.manifestPath,
        fixture.dump,
      ]);
      expect(entries.map((entry) => entry.name)).toEqual([
        'manifest.json',
        'recovery-data.dump',
      ]);
      expect(entries[0]?.offset).toBe(0);
      expect(entries[1]?.offset).toBe(entries[0]?.bytes);
      const contents = await readRecoveryBundle(fixture.bundlePath);
      const restoredManifest = parseRecoveryManifest(
        JSON.parse(contents.get('manifest.json')!.toString('utf8')),
      );
      expect(restoredManifest.format).toBe('madrasio-recovery-v1');
      expect(restoredManifest.migrations).toMatchObject({
        count: 16,
        latest: '0015_data-api-grants-hardening',
      });
      expect(restoredManifest.fingerprints).toHaveLength(41);
      expect(restoredManifest.fingerprints.every((item) => item.rowCount === rowCount)).toBe(true);
      expect(contents.get('recovery-data.dump')).toEqual(await readFile(fixture.dump));
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it('loads the module-relative ordered migration contract and classifies metadata failures', async () => {
    const migrationsDirectory = resolveRecoveryMigrationsDirectory();
    expect(resolveRecoveryMigrationsDirectory(resolve(process.cwd(), '../..'))).toBe(
      migrationsDirectory,
    );
    expect(migrationsDirectory.replaceAll('\\', '/')).toMatch(
      /\/database\/drizzle\/migrations\/?$/,
    );
    await expect(loadMigrationMetadata(migrationsDirectory)).resolves.toMatchObject({
      count: 16,
      latest: '0015_data-api-grants-hardening',
    });
    await expect(loadMigrationMetadata(join(tmpdir(), 'missing-migrations'))).rejects.toMatchObject({
      code: 'BACKUP_MIGRATION_METADATA_FAILED',
      diagnostic: { phase: 'manifest_metadata', timeout: false },
    });
  });

  it('reads and trims the native SHOW server_version driver field', async () => {
    await expect(
      loadServerVersion({
        query: vi.fn(async () => ({ rows: [{ server_version: '17.6' }] })),
      } as never),
    ).resolves.toBe('17.6');
    await expect(
      loadServerVersion({
        query: vi.fn(async () => ({ rows: [{ server_version: ' 17.6 \n' }] })),
      } as never),
    ).resolves.toBe('17.6');
  });

  it.each([
    ['legacy property', [{ version: '17.6' }]],
    ['missing row', []],
    ['empty value', [{ server_version: '' }]],
    ['whitespace value', [{ server_version: ' \n ' }]],
    ['null value', [{ server_version: null }]],
    ['number value', [{ server_version: 17.6 }]],
    ['object value', [{ server_version: { value: '17.6' } }]],
    ['array value', [{ server_version: ['17.6'] }]],
  ] as const)('rejects the %s server metadata shape safely', async (_name, rows) => {
    await expect(
      loadServerVersion({ query: vi.fn(async () => ({ rows })) } as never),
    ).rejects.toMatchObject({
      code: 'BACKUP_SERVER_METADATA_FAILED',
      diagnostic: { phase: 'server_metadata', timeout: false },
    });
  });

  it('does not expose a rejected server row or unrelated secret-shaped fields', async () => {
    const secrets = [
      'postgresql://private:password@host/db',
      'customer@example.test',
      'https://cronitor.link/p/private/key',
    ];
    let error: unknown;
    try {
      await loadServerVersion({
        query: vi.fn(async () => ({
          rows: [
            {
              server_version: null,
              databaseUrl: secrets[0],
              email: secrets[1],
              heartbeat: secrets[2],
            },
          ],
        })),
      } as never);
    } catch (caught) {
      error = caught;
    }
    const safe = JSON.stringify(safeRecoveryError(error));
    expect(safe).toContain('BACKUP_SERVER_METADATA_FAILED');
    expect(safe).toContain('server_metadata');
    for (const secret of secrets) expect(safe).not.toContain(secret);
  });

  it('classifies server query failures without returning server details', async () => {
    await expect(
      loadServerVersion({
        query: vi.fn().mockRejectedValue(Object.assign(new Error('private host'), { code: '42501' })),
      } as never),
    ).rejects.toMatchObject({
      code: 'BACKUP_SERVER_METADATA_FAILED',
      diagnostic: { phase: 'server_metadata', sqlState: '42501' },
    });
  });

  it('classifies manifest validation without exposing rejected values or Zod details', () => {
    const secrets = [
      'postgresql://private:password@host/db',
      'customer@example.test',
      'password-hash-secret',
      'r2-secret-value',
      'https://cronitor.link/p/private/key',
      '-----BEGIN CERTIFICATE-----private',
    ];
    for (const value of [...secrets, 1n, new Date(), undefined, Number.POSITIVE_INFINITY, Buffer.from('private'), null]) {
      let error: unknown;
      try {
        validateRecoveryManifest({ format: 'madrasio-recovery-v1', gitSha: value });
      } catch (caught) {
        error = caught;
      }
      const safe = JSON.stringify(safeRecoveryError(error));
      expect(safe).toContain('BACKUP_MANIFEST_VALIDATION_FAILED');
      expect(safe).toContain('manifest_validation');
      for (const secret of secrets) expect(safe).not.toContain(secret);
    }
  });

  it('separates artifact checksums, manifest writes, bundle checksums and bundle writes', async () => {
    const fixture = await manifestFixture(0);
    try {
      await expect(artifactMetadata(join(fixture.directory, 'missing.dump'))).rejects.toMatchObject({
        code: 'BACKUP_BUNDLE_CHECKSUM_FAILED',
        diagnostic: { phase: 'bundle_checksum' },
      });
      await expect(
        writeRecoveryManifest(join(fixture.directory, 'missing', 'manifest.json'), fixture.manifest),
      ).rejects.toMatchObject({
        code: 'BACKUP_MANIFEST_WRITE_FAILED',
        diagnostic: { phase: 'manifest_write' },
      });
      await expect(
        writeRecoveryBundle(fixture.bundlePath, [join(fixture.directory, 'missing.json')]),
      ).rejects.toMatchObject({
        code: 'BACKUP_BUNDLE_CHECKSUM_FAILED',
        diagnostic: { phase: 'bundle_checksum' },
      });
      await expect(
        writeRecoveryBundle(fixture.bundlePath, [fixture.dump, fixture.dump]),
      ).rejects.toMatchObject({
        code: 'BACKUP_BUNDLE_WRITE_FAILED',
        diagnostic: { phase: 'bundle_write' },
      });
      await expect(
        writeRecoveryBundle(join(fixture.directory, 'missing', 'bundle'), [fixture.dump]),
      ).rejects.toMatchObject({
        code: 'BACKUP_BUNDLE_WRITE_FAILED',
        diagnostic: { phase: 'bundle_write' },
      });
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  it('classifies serialization failures without exposing invalid manifest values', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'manifest-write-test-'));
    const secret = 'postgresql://private:password@host/db';
    try {
      let error: unknown;
      try {
        await writeRecoveryManifest(join(directory, 'manifest.json'), {
          secret,
          unsupported: 1n,
        } as never);
      } catch (caught) {
        error = caught;
      }
      expect(safeRecoveryError(error)).toMatchObject({
        code: 'BACKUP_MANIFEST_WRITE_FAILED',
        phase: 'manifest_write',
      });
      expect(JSON.stringify(safeRecoveryError(error))).not.toContain(secret);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
