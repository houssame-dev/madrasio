import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { readRecoveryBundle, writeRecoveryBundle } from '@/scripts/recovery/bundle';
import {
  APPLICATION_TABLES,
  AUTH_RECOVERY_CLASS,
  RECOVERY_TABLES,
  RESTORE_CONFIRMATION,
  assertIsolatedRestoreTarget,
  assertProductionBackupTarget,
  classifyAuthTable,
} from '@/scripts/recovery/contracts';
import {
  assertRecoveryWorkDirectory,
  cleanupRecoveryWorkDirectory,
  createRecoveryWorkDirectory,
} from '@/scripts/recovery/filesystem';
import {
  assertRecoveryInventory,
  assertSupportedAuthState,
  topologicalRestoreOrder,
} from '@/scripts/recovery/inventory';
import {
  canonicalJson,
  compareFingerprints,
  loadMigrationMetadata,
  parseRecoveryManifest,
} from '@/scripts/recovery/manifest';
import { uploadAndVerify } from '@/scripts/recovery/operations';
import { runFailClosedRestore } from '@/scripts/recovery/restore';
import { withExportedSnapshot, withSnapshotConsumer } from '@/scripts/recovery/snapshot';
import {
  assertArchiveInventory,
  assertToolVersions,
  cleanupPostgresToolEnvironment,
  pgDumpArguments,
  validateAgeRecipient,
} from '@/scripts/recovery/tools';

const productionRef = 'vpvbbsdmyhfjkbrbnocx';
const ca = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----';

function productionEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    DEPLOY_TARGET_ENV: 'production',
    DEPLOY_EXPECTED_PROJECT_REF: productionRef,
    PRODUCTION_EXPECTED_PROJECT_REF: productionRef,
    DATABASE_SSL_CA: ca,
    MIGRATION_DATABASE_URL: `postgresql://postgres.${productionRef}:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
    ...overrides,
  };
}

describe('recovery target safety', () => {
  it('accepts only the exact Production Session Pooler and rejects staging/runtime/local', () => {
    expect(assertProductionBackupTarget(productionEnv()).port).toBe('5432');
    expect(() =>
      assertProductionBackupTarget(
        productionEnv({
          MIGRATION_DATABASE_URL: productionEnv().MIGRATION_DATABASE_URL!.replace(':5432', ':6543'),
        }),
      ),
    ).toThrow('exact verified-TLS');
    expect(() =>
      assertProductionBackupTarget(
        productionEnv({
          PRODUCTION_EXPECTED_PROJECT_REF: 'cqeaxlttezunirsmkrxz',
          DEPLOY_EXPECTED_PROJECT_REF: 'cqeaxlttezunirsmkrxz',
        }),
      ),
    ).toThrow('exact verified-TLS');
    expect(() =>
      assertProductionBackupTarget(productionEnv({ DATABASE_SSL_CA: undefined })),
    ).toThrow('exact verified-TLS');
  });

  it('permits restore only on explicitly confirmed loopback PostgreSQL', () => {
    expect(
      assertIsolatedRestoreTarget({
        NODE_ENV: 'test',
        RESTORE_TARGET_ENV: 'isolated-local',
        RESTORE_CONFIRMATION,
        RESTORE_DATABASE_URL: 'postgresql://local:local@127.0.0.1:54322/postgres',
      }).hostname,
    ).toBe('127.0.0.1');
    for (const target of [
      'postgresql://x:x@db.example.com:5432/x',
      `postgresql://x:x@db.${productionRef}.supabase.co:5432/x`,
    ]) {
      expect(() =>
        assertIsolatedRestoreTarget({
          NODE_ENV: 'test',
          RESTORE_TARGET_ENV: 'isolated-local',
          RESTORE_CONFIRMATION,
          RESTORE_DATABASE_URL: target,
        }),
      ).toThrow('isolated local');
    }
  });
});

describe('recovery archive and tools', () => {
  it('uses one complete 39-table application allowlist plus durable Auth', () => {
    expect(APPLICATION_TABLES).toHaveLength(39);
    expect(new Set(RECOVERY_TABLES).size).toBe(41);
    expect(RECOVERY_TABLES).toContain('auth.users');
    expect(RECOVERY_TABLES).not.toContain('auth.sessions');
    expect(RECOVERY_TABLES).not.toContain('auth.oauth_client_states');
    expect(RECOVERY_TABLES).not.toContain('auth.saml_relay_states');
  });

  it('classifies durable, transient, unsupported, platform and unknown Auth tables explicitly', () => {
    expect(classifyAuthTable('users')).toBe(AUTH_RECOVERY_CLASS.DURABLE_INCLUDED);
    expect(classifyAuthTable('oauth_client_states')).toBe(
      AUTH_RECOVERY_CLASS.KNOWN_TRANSIENT_EXCLUDED,
    );
    expect(classifyAuthTable('saml_relay_states')).toBe(
      AUTH_RECOVERY_CLASS.KNOWN_TRANSIENT_EXCLUDED,
    );
    expect(classifyAuthTable('mfa_factors')).toBe(
      AUTH_RECOVERY_CLASS.KNOWN_DURABLE_UNSUPPORTED,
    );
    expect(classifyAuthTable('schema_migrations')).toBe(
      AUTH_RECOVERY_CLASS.PLATFORM_MANAGED_EXCLUDED,
    );
    expect(classifyAuthTable('future_unknown_table')).toBe(AUTH_RECOVERY_CLASS.UNKNOWN);
  });

  it('fails closed when schema inventory drifts', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: APPLICATION_TABLES.map((table) => ({ table_name: table })),
      })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'identities' }, { table_name: 'users' }],
      });
    await expect(assertRecoveryInventory({ query } as never)).resolves.toBeUndefined();
    query.mockReset().mockResolvedValueOnce({
      rows: [...APPLICATION_TABLES, 'unexpected'].sort().map((table) => ({ table_name: table })),
    });
    await expect(assertRecoveryInventory({ query } as never)).rejects.toThrow('inventory differs');
  });

  it('rejects unsupported durable Auth feature state without returning its rows', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ table_name: 'mfa_factors' }] })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] });
    await expect(assertSupportedAuthState({ query } as never)).rejects.toThrow(
      'outside the reviewed email/password',
    );
    expect(query.mock.calls[1]?.[0]).toBe('select count(*)::int as count from auth."mfa_factors"');
  });

  it.each(['oauth_client_states', 'saml_relay_states'])(
    'accepts empty known transient Auth table %s without inspecting its rows',
    async (table) => {
      const query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ table_name: table }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [] });
      await expect(assertSupportedAuthState({ query } as never)).resolves.toBeUndefined();
      expect(query).toHaveBeenCalledTimes(3);
      expect(query.mock.calls.flat().join(' ')).not.toContain(`auth.${table}`);
    },
  );

  it.each(['oauth_client_states', 'saml_relay_states'])(
    'accepts non-empty known transient Auth table %s without reading or logging its payload',
    async (table) => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('information_schema.tables')) return { rows: [{ table_name: table }] };
        if (sql.includes('auth.identities')) return { rows: [{ count: 0 }] };
        if (sql.includes('information_schema.columns')) return { rows: [] };
        throw new Error(`transient payload query attempted for ${table}`);
      });
      await expect(assertSupportedAuthState({ query } as never)).resolves.toBeUndefined();
      expect(query).toHaveBeenCalledTimes(3);
    },
  );

  it.each([0, 1])('rejects an unknown Auth table even when its row count would be %i', async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{ table_name: 'future_unknown_table' }],
    });
    await expect(assertSupportedAuthState({ query } as never)).rejects.toMatchObject({
      code: 'BACKUP_AUTH_FEATURE_STATE_UNSUPPORTED',
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('accepts the Production incident schema with both transient tables present', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { table_name: 'identities' },
          { table_name: 'oauth_client_states' },
          { table_name: 'saml_relay_states' },
          { table_name: 'users' },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(assertSupportedAuthState({ query } as never)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('builds a bounded explicit data-only custom pg_dump contract', () => {
    const args = pgDumpArguments('data.dump', '00000003-1');
    expect(args).toContain('--format=custom');
    expect(args).toContain('--data-only');
    expect(args).toContain('--snapshot=00000003-1');
    expect(args.filter((item) => item === '--table')).toHaveLength(41);
    expect(args.join(' ')).not.toMatch(/password|database-url|session|refresh_tokens/);
  });

  it('requires pinned PostgreSQL 17 and age 1.3.1', async () => {
    const runner = vi.fn(async (command: string) => ({
      stdout: command === 'age' ? '1.3.1' : 'pg tool (PostgreSQL) 17.6',
    }));
    await expect(assertToolVersions(runner)).resolves.toBeUndefined();
    runner.mockImplementation(async (command: string) => ({
      stdout: command === 'age' ? '1.3.1' : 'pg tool (PostgreSQL) 16.9',
    }));
    await expect(assertToolVersions(runner)).rejects.toThrow('PostgreSQL 17');
  });

  it('validates age recipients and archive inventory', () => {
    expect(() => validateAgeRecipient('not-a-recipient')).toThrow('valid age');
    const recipient = `age1${'q'.repeat(58)}`;
    expect(validateAgeRecipient(recipient)).toBe(recipient);
    const list = RECOVERY_TABLES.map((table, index) => {
      const [schema, name] = table.split('.');
      return `${index + 1}; 0 0 TABLE DATA ${schema} ${name} postgres`;
    }).join('\n');
    expect(() => assertArchiveInventory(list)).not.toThrow();
    expect(() => assertArchiveInventory(`${list}\n99; 0 0 TABLE public surprise postgres`)).toThrow(
      'inventory',
    );
    for (const transient of ['oauth_client_states', 'saml_relay_states']) {
      expect(() =>
        assertArchiveInventory(`${list}\n99; 0 0 TABLE DATA auth ${transient} postgres`),
      ).toThrow('inventory');
    }
  });

  it('writes and verifies the repository-owned bundle container', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'recovery-test-'));
    try {
      const first = join(directory, 'manifest.json');
      const second = join(directory, 'recovery-data.dump');
      const bundle = join(directory, 'bundle.bin');
      await writeFile(first, '{}');
      await writeFile(second, 'archive');
      await writeRecoveryBundle(bundle, [first, second]);
      const files = await readRecoveryBundle(bundle);
      expect(files.get('recovery-data.dump')?.toString()).toBe('archive');
      const bytes = await readFile(bundle);
      bytes[bytes.length - 1] ^= 1;
      await writeFile(bundle, bytes);
      await expect(readRecoveryBundle(bundle)).rejects.toThrow('checksum');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('snapshot and restore orchestration', () => {
  function fakePool(rows: unknown[] = []) {
    const query = vi.fn(async (sql: string) =>
      sql.includes('pg_export_snapshot')
        ? { rows: [{ snapshot: '00000003-0000001B-1', timestamp: '2026-09-11T00:00:00Z' }] }
        : { rows },
    );
    const release = vi.fn();
    return { pool: { connect: vi.fn(async () => ({ query, release })) }, query, release };
  }

  it('holds an exported read-only repeatable-read snapshot until work completes', async () => {
    const fake = fakePool();
    await withExportedSnapshot(fake.pool as never, async ({ snapshot }) =>
      expect(snapshot).toBe('00000003-0000001B-1'),
    );
    expect(fake.query.mock.calls.map(([sql]) => sql)).toEqual(
      expect.arrayContaining(['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', 'COMMIT']),
    );
    expect(fake.release).toHaveBeenCalled();
  });

  it('imports the exact token before a snapshot consumer reads', async () => {
    const fake = fakePool();
    await withSnapshotConsumer(fake.pool as never, '00000003-0000001B-1', async () => undefined);
    expect(fake.query.mock.calls[1]?.[0]).toBe("SET TRANSACTION SNAPSHOT '00000003-0000001B-1'");
  });

  it('orders referenced tables before dependants and rejects cycles', () => {
    expect(
      topologicalRestoreOrder(
        ['public.parent', 'public.child'],
        [
          {
            source: 'public.child',
            target: 'public.parent',
            sourceColumns: ['parent_id'],
            targetColumns: ['id'],
          },
        ],
      ),
    ).toEqual(['public.parent', 'public.child']);
    expect(() =>
      topologicalRestoreOrder(
        ['public.a', 'public.b'],
        [
          { source: 'public.a', target: 'public.b', sourceColumns: ['id'], targetColumns: ['id'] },
          { source: 'public.b', target: 'public.a', sourceColumns: ['id'], targetColumns: ['id'] },
        ],
      ),
    ).toThrow('cycle');
  });

  it('stops immediately at the first failed restore phase', async () => {
    const calls: string[] = [];
    const phase =
      (name: string, fail = false) =>
      async () => {
        calls.push(name);
        if (fail) throw new Error('private detail');
      };
    await expect(
      runFailClosedRestore({
        foundation: phase('foundation'),
        migrations: phase('migrations'),
        auth: phase('auth', true),
        application: phase('application'),
        sequences: phase('sequences'),
        verify: phase('verify'),
      }),
    ).rejects.toThrow('auth');
    expect(calls).toEqual(['foundation', 'migrations', 'auth']);
  });
});

describe('manifest, reconciliation, cleanup and future transport boundary', () => {
  it('captures the exact ordered 0000-0015 repository migration contract', async () => {
    const metadata = await loadMigrationMetadata(
      resolve(process.cwd(), '../../database/drizzle/migrations'),
    );
    expect(metadata.count).toBe(16);
    expect(metadata.latest).toBe('0015_data-api-grants-hardening');
    expect(Object.keys(metadata.fileSha256)).toHaveLength(16);
    expect(metadata.createdAt).toHaveLength(16);
  });

  it('canonicalizes objects without locale-dependent key order and rejects unknown manifests', () => {
    expect(canonicalJson({ z: 1, a: { b: null, a: true } })).toBe(
      '{"a":{"a":true,"b":null},"z":1}',
    );
    expect(() => parseRecoveryManifest({ format: 'madrasio-recovery-v2' })).toThrow(
      'malformed or unsupported',
    );
  });

  it('compares only counts and deterministic hashes, not row content', () => {
    const item = {
      table: 'public.users' as const,
      rowCount: 1,
      primaryKeySha256: 'a'.repeat(64),
      contentSha256: 'b'.repeat(64),
      primaryKeyColumns: ['id'],
    };
    expect(() => compareFingerprints([item], [item])).not.toThrow();
    expect(() => compareFingerprints([item], [{ ...item, rowCount: 2 }])).toThrow('does not match');
  });

  it('only deletes generated recovery directories', async () => {
    const directory = await createRecoveryWorkDirectory();
    expect(assertRecoveryWorkDirectory(directory)).toBe(resolve(directory));
    await cleanupRecoveryWorkDirectory(directory);
    expect(() => assertRecoveryWorkDirectory(resolve(tmpdir()))).toThrow('Refused cleanup');
  });

  it('surfaces an operating-system plaintext cleanup failure', async () => {
    const directory = await createRecoveryWorkDirectory();
    const denied = vi.fn(async () => {
      throw Object.assign(new Error('private operating-system detail'), { code: 'EPERM' });
    }) as unknown as typeof rm;
    try {
      await expect(cleanupRecoveryWorkDirectory(directory, denied)).rejects.toMatchObject({
        code: 'BACKUP_PLAINTEXT_CLEANUP_FAILED',
      });
    } finally {
      await cleanupRecoveryWorkDirectory(directory);
    }
  });

  it('only deletes generated database TLS directories', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'madrasio-pgssl-'));
    await cleanupPostgresToolEnvironment(directory);
    await expect(cleanupPostgresToolEnvironment(resolve(tmpdir()))).rejects.toMatchObject({
      code: 'BACKUP_PLAINTEXT_CLEANUP_FAILED',
    });
  });

  it('requires independent immutable upload readback before verification', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'recovery-upload-test-'));
    const bodyPath = join(directory, 'cipher.age');
    const readbackPath = join(directory, 'readback.age');
    await writeFile(bodyPath, 'abc');
    const store = {
      putImmutable: vi.fn(async () => undefined),
      head: vi.fn(async () => ({ key: 'x', bytes: 3, sha256: 'abc' })),
      download: vi.fn(async (_key: string, destination: string) => writeFile(destination, 'abc')),
    };
    try {
      await expect(
        uploadAndVerify(
          store,
          {
            key: 'x',
            bodyPath,
            bytes: 3,
            sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
          },
          readbackPath,
        ),
      ).rejects.toThrow('remote verification');
      store.head.mockResolvedValueOnce({
        key: 'x',
        bytes: 3,
        sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      });
      await expect(
        uploadAndVerify(
          store,
          {
            key: 'x',
            bodyPath,
            bytes: 3,
            sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
          },
          readbackPath,
        ),
      ).resolves.toMatchObject({ key: 'x', bytes: 3 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
