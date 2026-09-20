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
  assertStagingRecoveryTarget,
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
  fingerprintTable,
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
  assertPostgresContainerArchiveReadable,
  assertToolVersions,
  cleanupPostgresToolEnvironment,
  classifyToolFailure,
  createPgDumpArchive,
  ExternalToolError,
  inspectPgDumpArchive,
  pgRestoreTableSelection,
  pgDumpArguments,
  postgresToolEnvironment,
  postgresContainerInvocation,
  resolvePnpmInvocation,
  resolveRecoveryArchiveMount,
  validateRecoveryArchiveMount,
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

  it('accepts only the exact STAGING Session Pooler with a trusted CA', () => {
    const staging: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      DEPLOY_TARGET_ENV: 'staging',
      STAGING_EXPECTED_PROJECT_REF: 'cqeaxlttezunirsmkrxz',
      DATABASE_SSL_CA: ca,
      MIGRATION_DATABASE_URL:
        'postgresql://postgres.cqeaxlttezunirsmkrxz:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
    };
    expect(assertStagingRecoveryTarget(staging).port).toBe('5432');
    for (const changed of [
      { STAGING_EXPECTED_PROJECT_REF: productionRef },
      { DEPLOY_TARGET_ENV: 'production' },
      { DATABASE_SSL_CA: undefined },
      { MIGRATION_DATABASE_URL: staging.MIGRATION_DATABASE_URL!.replace(':5432', ':6543') },
      { MIGRATION_DATABASE_URL: productionEnv().MIGRATION_DATABASE_URL },
    ]) {
      expect(() => assertStagingRecoveryTarget({ ...staging, ...changed })).toThrow(
        'exact verified-TLS STAGING',
      );
    }
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
      'postgresql://x:x@db.cqeaxlttezunirsmkrxz.supabase.co:5432/x',
      'postgresql://x:x@aws-0-eu-central-1.pooler.supabase.com:5432/x',
      'postgresql://x:x@aws-0-eu-central-1.pooler.supabase.com:6543/x',
      'postgresql://x:x@192.168.1.50:5432/x',
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
  it('launches pnpm through Node and npm_execpath without joining arguments', () => {
    const args = ['--filter', '@school/database', 'migrate', '--config', 'path with spaces'];
    expect(
      resolvePnpmInvocation(args, {
        platform: 'win32',
        execPath: 'C:\\Program Files\\nodejs\\node.exe',
        npmExecPath: 'C:\\Program Files\\pnpm\\pnpm.cjs',
      }),
    ).toEqual({
      command: 'C:\\Program Files\\nodejs\\node.exe',
      args: ['C:\\Program Files\\pnpm\\pnpm.cjs', ...args],
    });
  });

  it('accepts a native POSIX pnpm launcher independently of the test host', () => {
    expect(
      resolvePnpmInvocation(['--filter', '@school/database', 'migrate'], {
        platform: 'linux',
        execPath: '/opt/node/bin/node',
        npmExecPath: '/opt/pnpm/pnpm.mjs',
      }),
    ).toEqual({
      command: '/opt/node/bin/node',
      args: ['/opt/pnpm/pnpm.mjs', '--filter', '@school/database', 'migrate'],
    });
  });

  it.each([
    ['win32', 'C:\\Program Files\\pnpm\\not-pnpm.cjs'],
    ['win32', 'pnpm.cjs'],
    ['linux', '/opt/pnpm/not-pnpm.js'],
    ['linux', 'pnpm.mjs'],
    ['linux', '/opt/pnpm/pnpm.cmjs'],
  ] as const)('rejects invalid %s launcher metadata %s', (platform, npmExecPath) => {
    expect(() =>
      resolvePnpmInvocation(['migrate'], {
        platform,
        execPath: platform === 'win32' ? 'C:\\Program Files\\nodejs\\node.exe' : '/usr/bin/node',
        npmExecPath,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'RESTORE_PACKAGE_MANAGER_LAUNCH_FAILED',
        diagnostic: { phase: 'migration_launch', timeout: false },
      }),
    );
  });

  it('uses a shell-free Linux fallback when npm_execpath is unavailable', () => {
    expect(
      resolvePnpmInvocation(['--filter', '@school/database', 'migrate'], {
        platform: 'linux',
        execPath: '/usr/bin/node',
        npmExecPath: '',
      }),
    ).toEqual({
      command: 'pnpm',
      args: ['--filter', '@school/database', 'migrate'],
    });
  });

  it('fails with a bounded classification when the Windows pnpm launcher is unavailable', () => {
    expect(() =>
      resolvePnpmInvocation(['migrate'], {
        platform: 'win32',
        execPath: 'C:\\Program Files\\nodejs\\node.exe',
        npmExecPath: '',
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'RESTORE_PACKAGE_MANAGER_LAUNCH_FAILED',
        diagnostic: { phase: 'migration_launch', timeout: false },
      }),
    );
  });

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
    expect(classifyAuthTable('mfa_factors')).toBe(AUTH_RECOVERY_CLASS.KNOWN_DURABLE_UNSUPPORTED);
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

  it('separates application and Auth inventory query failures', async () => {
    const application = {
      query: vi.fn().mockRejectedValue(Object.assign(new Error('private'), { code: '42501' })),
    };
    await expect(assertRecoveryInventory(application as never)).rejects.toMatchObject({
      code: 'BACKUP_APPLICATION_INVENTORY_FAILED',
      diagnostic: { phase: 'application_inventory', sqlState: '42501' },
    });
    const auth = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: APPLICATION_TABLES.map((table) => ({ table_name: table })) })
        .mockRejectedValueOnce(Object.assign(new Error('private'), { code: '42501' })),
    };
    await expect(assertRecoveryInventory(auth as never)).rejects.toMatchObject({
      code: 'BACKUP_AUTH_INVENTORY_FAILED',
      diagnostic: { phase: 'auth_inventory', sqlState: '42501' },
    });
  });

  it('classifies fingerprint query failures without returning row values', async () => {
    const query = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('customer@example.test'), { code: '42501' }));
    await expect(fingerprintTable({ query } as never, 'public.users')).rejects.toMatchObject({
      code: 'BACKUP_FINGERPRINT_FAILED',
      diagnostic: { phase: 'fingerprint', sqlState: '42501' },
    });
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

  it('passes PostgreSQL TLS and connection inputs to the pinned container by env name only', () => {
    const invocation = postgresContainerInvocation(
      'pg_dump',
      pgDumpArguments('/tmp/archive.dump', '00000003-1'),
      'postgres:17.6-bookworm@sha256:reviewed',
    );
    expect(invocation).toEqual(
      expect.arrayContaining([
        '--network',
        'host',
        '--volume',
        '/tmp:/tmp:rw',
        'PGHOST',
        'PGPORT',
        'PGDATABASE',
        'PGUSER',
        'PGPASSWORD',
        'PGSSLMODE',
        'PGSSLROOTCERT',
      ]),
    );
    expect(invocation.join(' ')).not.toMatch(/postgresql:\/\/|secret|BEGIN CERTIFICATE/);
  });

  it('permits TLS-free tool access only for the disposable loopback integration target', async () => {
    await expect(
      postgresToolEnvironment('postgresql://local:local@127.0.0.1:55432/postgres', undefined),
    ).resolves.toMatchObject({
      env: { PGHOST: '127.0.0.1', PGPORT: '55432', PGSSLMODE: 'disable' },
      cleanupDirectory: undefined,
    });
    await expect(
      postgresToolEnvironment('postgresql://user:secret@db.example.com:5432/postgres', undefined),
    ).rejects.toMatchObject({ code: 'BACKUP_TARGET_VERIFICATION_FAILED' });
  });

  it('maps a Windows recovery archive to a fixed read-only container path', () => {
    const hostWorkspace = 'C:\\Users\\Example User\\AppData\\Local\\Temp\\madrasio-recovery-a1b2c3';
    const hostArchive = `${hostWorkspace}\\recovery-data.dump`;
    const mount = resolveRecoveryArchiveMount(
      { hostArchive, hostWorkspace },
      { platform: 'win32' },
    );
    const invocation = postgresContainerInvocation(
      'pg_restore',
      ['--data-only', '--table', 'auth.users', hostArchive],
      'postgres:17.6-bookworm@sha256:reviewed',
      mount,
    );
    expect(invocation).toContain(
      `type=bind,source=${hostWorkspace},target=/madrasio-recovery,readonly`,
    );
    expect(invocation.at(-1)).toBe('/madrasio-recovery/recovery-data.dump');
    expect(invocation.slice(invocation.indexOf('pg_restore') + 1)).not.toContain(hostArchive);
  });

  it('maps a POSIX recovery archive through the same scoped container contract', () => {
    const hostWorkspace = '/tmp/madrasio-recovery-a1b2c3';
    const hostArchive = `${hostWorkspace}/recovery-data.dump`;
    const mount = resolveRecoveryArchiveMount(
      { hostArchive, hostWorkspace },
      { platform: 'linux' },
    );
    const invocation = postgresContainerInvocation(
      'pg_restore',
      ['--list', hostArchive],
      'postgres:17.6-bookworm@sha256:reviewed',
      mount,
    );
    expect(invocation.at(-1)).toBe('/madrasio-recovery/recovery-data.dump');
    expect(invocation).toContain(
      'type=bind,source=/tmp/madrasio-recovery-a1b2c3,target=/madrasio-recovery,readonly',
    );
  });

  it('maps pg_dump output through one generated writable workspace mount', () => {
    const hostWorkspace = 'C:\\Recovery Tests\\madrasio-recovery-backup';
    const hostArchive = `${hostWorkspace}\\recovery-data.dump`;
    const mount = resolveRecoveryArchiveMount(
      { hostArchive, hostWorkspace, writable: true },
      { platform: 'win32' },
    );
    const invocation = postgresContainerInvocation(
      'pg_dump',
      ['--format=custom', `--file=${hostArchive}`],
      'postgres:17.6-bookworm@sha256:reviewed',
      mount,
    );
    expect(invocation).toContain(`type=bind,source=${hostWorkspace},target=/madrasio-recovery`);
    expect(invocation).not.toContain(
      `type=bind,source=${hostWorkspace},target=/madrasio-recovery,readonly`,
    );
    expect(invocation.at(-1)).toBe('--file=/madrasio-recovery/recovery-data.dump');
  });

  it('keeps a spaced host workspace in one narrowly scoped read-only mount argument', () => {
    const hostWorkspace = 'C:\\Recovery Tests\\madrasio-recovery-path with spaces';
    const hostArchive = `${hostWorkspace}\\recovery-data.dump`;
    const mount = resolveRecoveryArchiveMount(
      { hostArchive, hostWorkspace },
      { platform: 'win32' },
    );
    const invocation = postgresContainerInvocation(
      'pg_restore',
      [hostArchive],
      'postgres:17.6-bookworm@sha256:reviewed',
      mount,
    );
    expect(invocation.filter((item) => item.startsWith('type=bind,'))).toEqual([
      `type=bind,source=${hostWorkspace},target=/madrasio-recovery,readonly`,
    ]);
    expect(invocation.join('\n')).not.toContain('source=C:\\Recovery Tests,target=');
  });

  it('rejects archive traversal and pg_restore without a validated mount', () => {
    expect(() =>
      resolveRecoveryArchiveMount(
        {
          hostWorkspace: '/tmp/madrasio-recovery-a1b2c3',
          hostArchive: '/tmp/other/recovery-data.dump',
        },
        { platform: 'linux' },
      ),
    ).toThrow('workspace is invalid');
    expect(() =>
      postgresContainerInvocation(
        'pg_restore',
        ['--list', '/tmp/recovery-data.dump'],
        'postgres:17.6-bookworm@sha256:reviewed',
      ),
    ).toThrow('validated recovery archive mount');
  });

  it('selects restored data by explicit schema and unqualified table name', () => {
    expect(pgRestoreTableSelection('auth.users')).toEqual(['--schema', 'auth', '--table', 'users']);
    expect(pgRestoreTableSelection('public.school_memberships')).toEqual([
      '--schema',
      'public',
      '--table',
      'school_memberships',
    ]);
    expect(() => pgRestoreTableSelection('auth.users;drop table users')).toThrow(
      'selection is invalid',
    );
  });

  it('rejects a missing recovery archive before Docker launch', async () => {
    const directory = await createRecoveryWorkDirectory();
    try {
      await expect(
        validateRecoveryArchiveMount({
          hostArchive: join(directory, 'recovery-data.dump'),
          hostWorkspace: directory,
        }),
      ).rejects.toThrow('missing or invalid');
    } finally {
      await cleanupRecoveryWorkDirectory(directory);
    }
  });

  it('classifies a container-inaccessible archive without exposing Docker output', async () => {
    const directory = await createRecoveryWorkDirectory();
    const archive = join(directory, 'recovery-data.dump');
    await writeFile(archive, 'synthetic archive');
    const runner = vi.fn().mockRejectedValue(new Error('sensitive docker detail'));
    try {
      await expect(
        assertPostgresContainerArchiveReadable(
          { hostArchive: archive, hostWorkspace: directory },
          'postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3',
          runner,
        ),
      ).rejects.toMatchObject({ code: 'RESTORE_DATA_FAILED' });
      expect(runner).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining([
          '--mount',
          expect.stringContaining('target=/madrasio-recovery,readonly'),
          'test',
          '-r',
          '/madrasio-recovery/recovery-data.dump',
        ]),
        { timeoutMs: 30_000 },
      );
    } finally {
      await cleanupRecoveryWorkDirectory(directory);
    }
  });

  it('requires pinned PostgreSQL 17 and the exact official age v1.3.1 runtime string', async () => {
    const runner = vi.fn(async (command: string) => ({
      stdout: command === 'age' ? 'v1.3.1\n' : 'pg tool (PostgreSQL) 17.6',
    }));
    await expect(assertToolVersions(runner)).resolves.toBeUndefined();
    runner.mockImplementation(async (command: string) => ({
      stdout: command === 'age' ? 'v1.3.1\n' : 'pg tool (PostgreSQL) 16.9',
    }));
    await expect(assertToolVersions(runner)).rejects.toThrow('PostgreSQL 17');
  });

  it.each(['1.3.1', 'v1.3.0', 'v1.3.2', 'prefix-v1.3.1', 'v1.3.1-suffix'])(
    'rejects non-exact age runtime output %s',
    async (ageVersion) => {
      const runner = vi.fn(async (command: string) => ({
        stdout: command === 'age' ? ageVersion : 'pg tool (PostgreSQL) 17.6',
      }));
      await expect(assertToolVersions(runner)).rejects.toThrow('pinned age tool version');
    },
  );

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

  it('classifies coordinator connection, transaction and export failures separately', async () => {
    await expect(
      withExportedSnapshot(
        {
          connect: vi
            .fn()
            .mockRejectedValue(Object.assign(new Error('private'), { code: '08001' })),
        } as never,
        async () => undefined,
      ),
    ).rejects.toMatchObject({
      code: 'BACKUP_DB_CONNECTION_FAILED',
      diagnostic: { phase: 'coordinator_connection', sqlState: '08001' },
    });

    const transaction = fakePool();
    transaction.query.mockRejectedValueOnce(Object.assign(new Error('private'), { code: '25006' }));
    await expect(
      withExportedSnapshot(transaction.pool as never, async () => undefined),
    ).rejects.toMatchObject({
      code: 'BACKUP_READ_ONLY_TRANSACTION_FAILED',
      diagnostic: { phase: 'read_only_transaction', sqlState: '25006' },
    });

    const exported = fakePool();
    exported.query.mockImplementation(async (sql: string) => {
      if (sql.includes('pg_export_snapshot'))
        throw Object.assign(new Error('private'), { code: '0A000' });
      return { rows: [] };
    });
    await expect(
      withExportedSnapshot(exported.pool as never, async () => undefined),
    ).rejects.toMatchObject({
      code: 'BACKUP_SNAPSHOT_EXPORT_FAILED',
      diagnostic: { phase: 'snapshot_export', sqlState: '0A000' },
    });
  });

  it('classifies snapshot import, consumer query and coordinator loss separately', async () => {
    const imported = fakePool();
    imported.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SET TRANSACTION SNAPSHOT'))
        throw Object.assign(new Error('private'), { code: '22023' });
      return { rows: [] };
    });
    await expect(
      withSnapshotConsumer(imported.pool as never, '00000003-0000001B-1', async () => undefined),
    ).rejects.toMatchObject({
      code: 'BACKUP_SNAPSHOT_IMPORT_FAILED',
      diagnostic: { phase: 'snapshot_import', sqlState: '22023' },
    });

    const consumer = fakePool();
    await expect(
      withSnapshotConsumer(consumer.pool as never, '00000003-0000001B-1', async () => {
        throw new Error('private customer row');
      }),
    ).rejects.toMatchObject({
      code: 'BACKUP_SNAPSHOT_CONSUMER_FAILED',
      diagnostic: { phase: 'snapshot_consumer_query' },
    });

    const lost = fakePool();
    lost.query.mockImplementation(async (sql: string) => {
      if (sql === 'COMMIT') throw Object.assign(new Error('private host'), { code: '08006' });
      if (sql.includes('pg_export_snapshot'))
        return { rows: [{ snapshot: '00000003-0000001B-1', timestamp: '2026-09-11T00:00:00Z' }] };
      return { rows: [] };
    });
    await expect(
      withExportedSnapshot(lost.pool as never, async () => undefined),
    ).rejects.toMatchObject({
      code: 'BACKUP_SNAPSHOT_COORDINATOR_LOST',
      diagnostic: { phase: 'coordinator_commit', sqlState: '08006' },
    });
  });

  it.each([
    ['spawn', 'BACKUP_PG_DUMP_START_FAILED', 'pg_dump_start'],
    ['connection', 'BACKUP_PG_DUMP_CONNECTION_FAILED', 'pg_dump_connection'],
    ['snapshot', 'BACKUP_PG_DUMP_SNAPSHOT_FAILED', 'pg_dump_snapshot'],
    ['operation', 'BACKUP_ARCHIVE_CREATION_FAILED', 'archive_creation'],
  ] as const)('maps pg_dump %s failures to %s', async (kind, code, phase) => {
    const runner = vi.fn().mockRejectedValue(new ExternalToolError(kind, 1, undefined, false));
    await expect(createPgDumpArchive([], {}, runner)).rejects.toMatchObject({
      code,
      diagnostic: { phase, exitCode: 1, timeout: false },
    });
  });

  it('separates pg_dump and archive-inspection timeouts', async () => {
    const timeout = vi
      .fn()
      .mockRejectedValue(new ExternalToolError('operation', undefined, 'SIGTERM', true));
    await expect(createPgDumpArchive([], {}, timeout)).rejects.toMatchObject({
      code: 'BACKUP_OPERATION_TIMEOUT',
      diagnostic: { phase: 'archive_creation', signal: 'SIGTERM', timeout: true },
    });
    await expect(inspectPgDumpArchive('x.dump', timeout)).rejects.toMatchObject({
      code: 'BACKUP_OPERATION_TIMEOUT',
      diagnostic: { phase: 'archive_inspection', timeout: true },
    });
  });

  it('uses pg_dump stderr only for bounded classification and never returns its contents', () => {
    const secret =
      'postgresql://private-user:private-password@private-host/postgres BEGIN CERTIFICATE customer@example.test';
    const cases = [
      [`pg_dump: error: connection to server at "private-host" failed: ${secret}`, 'connection'],
      [`pg_dump: error: could not import the requested snapshot: ${secret}`, 'snapshot'],
      [`pg_dump: error: unrelated archive failure ${secret}`, 'operation'],
    ] as const;
    for (const [stderr, expected] of cases) {
      const classification = classifyToolFailure('pg_dump', stderr, 1);
      expect(classification).toBe(expected);
      expect(classification).not.toContain('private');
      expect(JSON.stringify(classification)).not.toContain(secret);
    }
  });

  it('classifies archive inspection independently from inventory mismatch', async () => {
    const runner = vi
      .fn()
      .mockRejectedValue(new ExternalToolError('operation', 2, undefined, false));
    await expect(inspectPgDumpArchive('x.dump', runner)).rejects.toMatchObject({
      code: 'BACKUP_ARCHIVE_INSPECTION_FAILED',
      diagnostic: { phase: 'archive_inspection', exitCode: 2 },
    });
    expect(() =>
      assertArchiveInventory('1; 0 0 TABLE DATA public unexpected postgres'),
    ).toThrowError(
      expect.objectContaining({
        code: 'BACKUP_INVENTORY_VALIDATION_FAILED',
        diagnostic: { phase: 'archive_inventory', timeout: false },
      }),
    );
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
