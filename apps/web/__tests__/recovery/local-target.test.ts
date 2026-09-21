import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { promisify } from 'node:util';

import { applicationSecurityAuditSql, assertApplicationSecurity } from '@school/database/security';
import { afterEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

import {
  assertLoopbackBindings,
  assertLoopbackListeningSockets,
  cleanupLocalRecoveryTarget,
  createLocalRecoveryTarget,
  parseWindowsListeningSockets,
  runLocalTargetRehearsal,
  verifyLocalRecoveryTarget,
} from '../../scripts/recovery/local-target';
import {
  cleanupRecoveryWorkDirectory,
  createRecoveryWorkDirectory,
} from '../../scripts/recovery/filesystem';
import {
  assertEmptyRestoreFoundation,
  assertForeignKeyIntegrity,
  assertIdentityIntegrity,
  buildSequenceReconciliationSql,
} from '../../scripts/recovery/restore';
import {
  PINNED_POSTGRES_CONTAINER,
  assertPostgresContainerArchiveReadable,
  pgRestoreTableSelection,
  resolvePostgresTlsMount,
  runCommand,
} from '../../scripts/recovery/tools';

const execFileAsync = promisify(execFile);
const live = process.env.RECOVERY_TEST_LOCAL_TARGET === '1';
let statePath: string | undefined;

afterEach(async () => {
  if (statePath) await cleanupLocalRecoveryTarget(statePath).catch(() => undefined);
  statePath = undefined;
});

describe('local recovery target network contract', () => {
  it('accepts exact IPv4 loopback-only Docker bindings', () => {
    expect(() =>
      assertLoopbackBindings({ '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55432' }] }, [
        '5432/tcp',
      ]),
    ).not.toThrow();
  });

  it.each(['0.0.0.0', '::', '[::]', '192.168.1.20'])(
    'rejects unsafe Docker host binding %s',
    (HostIp) => {
      expect(() =>
        assertLoopbackBindings({ '5432/tcp': [{ HostIp, HostPort: '55432' }] }, ['5432/tcp']),
      ).toThrowError(expect.objectContaining({ code: 'LOCAL_RESTORE_TARGET_BROAD_BINDING' }));
    },
  );

  it('rejects missing and unexpected published ports', () => {
    expect(() => assertLoopbackBindings({}, ['5432/tcp'])).toThrow();
    expect(() =>
      assertLoopbackBindings(
        {
          '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55432' }],
          '9999/tcp': [{ HostIp: '127.0.0.1', HostPort: '55431' }],
        },
        ['5432/tcp'],
      ),
    ).toThrow();
  });

  it('parses Windows listeners and rejects wildcard sockets', () => {
    const loopback = parseWindowsListeningSockets(
      '  TCP    127.0.0.1:55432    0.0.0.0:0    LISTENING    100',
    );
    expect(() => assertLoopbackListeningSockets(loopback, [55432])).not.toThrow();
    const broad = parseWindowsListeningSockets(
      '  TCP    0.0.0.0:55432    0.0.0.0:0    LISTENING    100',
    );
    expect(() => assertLoopbackListeningSockets(broad, [55432])).toThrowError(
      expect.objectContaining({ code: 'LOCAL_RESTORE_TARGET_BROAD_BINDING' }),
    );
  });
});

describe.skipIf(!live)('live local recovery target', () => {
  it('makes only the generated TLS trust directory readable inside the pinned container', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'madrasio-pgssl-'));
    const ca = join(directory, 'root.crt');
    const docker = process.env.RECOVERY_DOCKER_BINARY?.trim() || 'docker';
    const tls = resolvePostgresTlsMount({ hostDirectory: directory, hostCa: ca });
    try {
      await writeFile(ca, 'local trust fixture', { mode: 0o600 });
      await expect(
        runCommand(docker, [
          'run',
          '--rm',
          PINNED_POSTGRES_CONTAINER,
          'test',
          '!',
          '-r',
          tls.hostCa,
        ]),
      ).resolves.toMatchObject({ stdout: '' });
      await expect(
        runCommand(docker, [
          'run',
          '--rm',
          '--mount',
          `type=bind,source=${tls.hostDirectory},target=${tls.containerDirectory},readonly`,
          PINNED_POSTGRES_CONTAINER,
          'test',
          '-r',
          tls.containerCa,
        ]),
      ).resolves.toMatchObject({ stdout: '' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);

  it('runs the exact restore migration command through the cross-platform launcher', async () => {
    const state = await createLocalRecoveryTarget();
    statePath = state.statePath;
    const databaseUrl =
      `postgresql://postgres:${encodeURIComponent(state.databasePassword)}` +
      `@127.0.0.1:${state.databasePort}/postgres`;
    const pool = new Pool({ connectionString: databaseUrl, ssl: false });
    try {
      await expect(assertEmptyRestoreFoundation(pool)).resolves.toBeUndefined();
    } finally {
      await pool.end();
    }

    await expect(
      runCommand('pnpm', ['--filter', '@school/database', 'migrate'], {
        env: { MIGRATION_DATABASE_URL: databaseUrl },
      }),
    ).resolves.toMatchObject({ stdout: expect.any(String) });

    await expect(
      verifyLocalRecoveryTarget(state.statePath, { expectMigrated: true }),
    ).resolves.toMatchObject({
      applicationTables: 39,
      migrations: 16,
      rlsTables: 39,
      applicationPolicies: 0,
      security: 'accepted',
    });
  }, 300_000);

  it('restores synthetic durable Auth and public data through the mounted archive', async () => {
    const state = await createLocalRecoveryTarget();
    statePath = state.statePath;
    const databaseUrl =
      `postgresql://postgres:${encodeURIComponent(state.databasePassword)}` +
      `@127.0.0.1:${state.databasePort}/postgres`;
    const pool = new Pool({ connectionString: databaseUrl, ssl: false });
    const work = await createRecoveryWorkDirectory();
    const archive = join(work, 'recovery-data.dump');
    const docker = process.env.RECOVERY_DOCKER_BINARY?.trim() || 'docker';
    const previousImage = process.env.RECOVERY_POSTGRES_CONTAINER_IMAGE;
    const previousPath = process.env.PATH;
    if (docker !== 'docker') process.env.PATH = `${dirname(docker)}${delimiter}${previousPath}`;
    process.env.RECOVERY_POSTGRES_CONTAINER_IMAGE = PINNED_POSTGRES_CONTAINER;
    const userId = '11111111-1111-4111-8111-111111111111';
    const identityId = '22222222-2222-4222-8222-222222222222';
    const schoolId = '33333333-3333-4333-8333-333333333333';
    const membershipId = '44444444-4444-4444-8444-444444444444';
    const pgEnvironment = {
      PGDATABASE: 'postgres',
      PGHOST: '127.0.0.1',
      PGPASSWORD: state.databasePassword,
      PGPORT: String(state.databasePort),
      PGUSER: 'postgres',
    };
    try {
      await expect(assertEmptyRestoreFoundation(pool)).resolves.toBeUndefined();
      await runCommand('pnpm', ['--filter', '@school/database', 'migrate'], {
        env: { MIGRATION_DATABASE_URL: databaseUrl },
      });
      await pool.query(
        `insert into auth.users
          (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
         values ($1,'authenticated','authenticated','synthetic@example.invalid','synthetic-not-a-real-hash',now(),'{}','{}',now(),now())`,
        [userId],
      );
      await pool.query(
        `insert into auth.identities
          (id,provider_id,user_id,identity_data,provider,created_at,updated_at)
         values ($1::uuid,$2::text,$2::uuid,jsonb_build_object('sub',$2::text,'email','synthetic@example.invalid'),'email',now(),now())`,
        [identityId, userId],
      );
      await pool.query(
        `insert into public.users (id,email) values ($1,'synthetic@example.invalid')`,
        [userId],
      );
      await pool.query(
        `insert into public.schools (id,name) values ($1,'Synthetic Recovery School')`,
        [schoolId],
      );
      await pool.query(
        `insert into public.school_memberships (id,school_id,user_id,role)
         values ($1,$2,$3,'SCHOOL_ADMIN')`,
        [membershipId, schoolId, userId],
      );
      await execFileAsync(docker, [
        'exec',
        state.databaseContainer,
        'pg_dump',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '--format=custom',
        '--data-only',
        '--no-owner',
        '--no-privileges',
        '--table',
        'auth.users',
        '--table',
        'auth.identities',
        '--table',
        'public.users',
        '--table',
        'public.schools',
        '--table',
        'public.school_memberships',
        '--file',
        '/tmp/recovery-data.dump',
      ]);
      await execFileAsync(docker, [
        'cp',
        `${state.databaseContainer}:/tmp/recovery-data.dump`,
        archive,
      ]);
      await pool.query(
        `delete from public.school_memberships;
         delete from public.schools;
         delete from public.users;
         delete from auth.identities;
         delete from auth.users`,
      );
      await assertPostgresContainerArchiveReadable(
        { hostArchive: archive, hostWorkspace: work },
        PINNED_POSTGRES_CONTAINER,
      );
      for (const table of [
        'auth.users',
        'auth.identities',
        'public.users',
        'public.schools',
        'public.school_memberships',
      ]) {
        await runCommand(
          'pg_restore',
          [
            '--exit-on-error',
            '--data-only',
            '--no-owner',
            '--no-privileges',
            ...pgRestoreTableSelection(table),
            '--dbname',
            'postgres',
            archive,
          ],
          {
            env: pgEnvironment,
            recoveryArchiveMount: { hostArchive: archive, hostWorkspace: work },
          },
        );
      }
      await pool.query(buildSequenceReconciliationSql());
      await expect(assertIdentityIntegrity(pool)).resolves.toBeUndefined();
      await expect(assertForeignKeyIntegrity(pool)).resolves.toBeUndefined();
      const security = await pool.query<{ violation: string }>(applicationSecurityAuditSql);
      expect(() => assertApplicationSecurity(security.rows)).not.toThrow();
      const counts = await pool.query<{
        application_tables: number;
        auth_identities: number;
        auth_users: number;
        memberships: number;
        policies: number;
        rls_tables: number;
        schools: number;
        users: number;
      }>(
        `select
          (select count(*)::int from auth.users) auth_users,
          (select count(*)::int from auth.identities) auth_identities,
          (select count(*)::int from public.users) users,
          (select count(*)::int from public.schools) schools,
          (select count(*)::int from public.school_memberships) memberships,
          (select count(*)::int from information_schema.tables where table_schema='public' and table_type='BASE TABLE') application_tables,
          (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity) rls_tables,
          (select count(*)::int from pg_policies where schemaname='public') policies`,
      );
      expect(counts.rows[0]).toEqual({
        application_tables: 39,
        auth_identities: 1,
        auth_users: 1,
        memberships: 1,
        policies: 0,
        rls_tables: 39,
        schools: 1,
        users: 1,
      });
      expect(
        await pool.query(
          'select count(*)::int count from auth.sessions union all select count(*)::int from auth.refresh_tokens',
        ),
      ).toMatchObject({ rows: [{ count: 0 }, { count: 0 }] });
    } finally {
      process.env.RECOVERY_POSTGRES_CONTAINER_IMAGE = previousImage;
      process.env.PATH = previousPath;
      await pool.end().catch(() => undefined);
      await cleanupRecoveryWorkDirectory(work).catch(() => undefined);
    }
  }, 300_000);

  it('cleans up owned Docker resources when startup fails', async () => {
    const occupiedPort = 55439;
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(occupiedPort, '127.0.0.1', resolve);
    });
    try {
      await expect(
        createLocalRecoveryTarget({ databasePort: occupiedPort, authPort: 55438 }),
      ).rejects.toThrow('process failed');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    const docker = process.env.RECOVERY_DOCKER_BINARY?.trim() || 'docker';
    const [containers, volumes, networks] = await Promise.all([
      execFileAsync(docker, [
        'ps',
        '-a',
        '--filter',
        'label=com.madrasio.recovery-target',
        '--format',
        '{{.Names}}',
      ]),
      execFileAsync(docker, [
        'volume',
        'ls',
        '--filter',
        'label=com.madrasio.recovery-target',
        '--format',
        '{{.Name}}',
      ]),
      execFileAsync(docker, [
        'network',
        'ls',
        '--filter',
        'label=com.madrasio.recovery-target',
        '--format',
        '{{.Name}}',
      ]),
    ]);
    expect([containers.stdout, volumes.stdout, networks.stdout].join('').trim()).toBe('');
  }, 120_000);

  it('provisions, migrates, verifies, and removes the exact minimal stack', async () => {
    const result = await runLocalTargetRehearsal();
    expect(result.cleanup).toBe('complete');
    expect(result.verification).toMatchObject({
      databaseHealthy: true,
      authHealthy: true,
      authUsersColumns: 35,
      authIdentitiesColumns: 9,
      authUsers: 0,
      authIdentities: 0,
      applicationTables: 39,
      migrations: 16,
      rlsTables: 39,
      applicationPolicies: 0,
      security: 'accepted',
      nonLoopbackBindings: 0,
    });
  }, 300_000);
});
