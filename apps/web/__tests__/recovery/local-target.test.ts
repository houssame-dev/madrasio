import { execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { promisify } from 'node:util';

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
import { assertEmptyRestoreFoundation } from '../../scripts/recovery/restore';
import { runCommand } from '../../scripts/recovery/tools';

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
