import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { postgresConnectionConfig } from '@school/database/connection';

import {
  PINNED_TOOLS,
  PRODUCTION_POSTGRES_MAJOR,
  RECOVERY_TABLES,
  RecoveryError,
} from './contracts';

export type CommandEnvironment = Record<string, string | undefined>;
export type CommandRunner = (
  command: string,
  args: string[],
  options?: { env?: CommandEnvironment },
) => Promise<{ stdout: string }>;

export const PINNED_POSTGRES_CONTAINER =
  'postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3';

export const runCommand: CommandRunner = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const inherited = Object.fromEntries(
      ['PATH', 'Path', 'PATHEXT', 'SYSTEMROOT', 'SystemRoot', 'COMSPEC', 'TEMP', 'TMP', 'HOME'].map(
        (key) => [key, process.env[key]],
      ),
    );
    const childEnvironment = {
      NODE_ENV: process.env.NODE_ENV ?? 'production',
      ...inherited,
      ...options.env,
    } as NodeJS.ProcessEnv;
    const configuredImage = process.env.RECOVERY_POSTGRES_CONTAINER_IMAGE?.trim();
    const useContainer = configuredImage && ['pg_dump', 'pg_restore'].includes(command);
    if (configuredImage && configuredImage !== PINNED_POSTGRES_CONTAINER) {
      reject(new Error('The PostgreSQL recovery container is not the reviewed immutable image.'));
      return;
    }
    const actualCommand = useContainer ? 'docker' : command;
    const actualArguments = useContainer
      ? [
          'run',
          '--rm',
          '--network',
          'host',
          '--volume',
          '/tmp:/tmp:rw',
          ...[
            'PGHOST',
            'PGPORT',
            'PGDATABASE',
            'PGUSER',
            'PGPASSWORD',
            'PGSSLMODE',
            'PGSSLROOTCERT',
          ].flatMap((name) => ['--env', name]),
          configuredImage,
          command,
          ...args,
        ]
      : args;
    const child = spawn(actualCommand, actualArguments, {
      env: childEnvironment,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stdin.end();
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout });
      else
        reject(
          new Error(
            `External recovery tool failed (${code}); output withheld (${stderr.length} bytes).`,
          ),
        );
    });
  });

export async function assertToolVersions(runner: CommandRunner = runCommand): Promise<void> {
  const dump = await runner('pg_dump', ['--version']);
  const restore = await runner('pg_restore', ['--version']);
  const age = await runner('age', ['--version']);
  const pgMajor = Number(/(\d+)(?:\.\d+)?/.exec(dump.stdout)?.[1]);
  if (
    pgMajor !== PRODUCTION_POSTGRES_MAJOR ||
    !dump.stdout.includes(PINNED_TOOLS.postgres) ||
    !restore.stdout.includes(PINNED_TOOLS.postgres)
  ) {
    throw new RecoveryError(
      'BACKUP_APPLICATION_EXPORT_FAILED',
      'PostgreSQL 17 client tools are required.',
    );
  }
  if (!age.stdout.includes(PINNED_TOOLS.age)) {
    throw new RecoveryError('BACKUP_ENCRYPTION_FAILED', 'The pinned age tool version is required.');
  }
}

export function validateAgeRecipient(value: string | undefined): string {
  const recipient = value?.trim() ?? '';
  if (!/^age1[023456789acdefghjklmnpqrstuvwxyz]{50,70}$/.test(recipient)) {
    throw new RecoveryError(
      'BACKUP_ENCRYPTION_FAILED',
      'A valid age X25519 recipient is required.',
    );
  }
  return recipient;
}

export async function postgresToolEnvironment(databaseUrl: string, ca: string | undefined) {
  const config = postgresConnectionConfig(databaseUrl, ca);
  const url = new URL(config.connectionString!);
  const directory = await mkdtemp(join(tmpdir(), 'madrasio-pgssl-'));
  const caPath = join(directory, 'root.crt');
  if (!ca?.trim())
    throw new RecoveryError(
      'BACKUP_TARGET_VERIFICATION_FAILED',
      'Trusted database CA is required.',
    );
  await writeFile(caPath, ca.replace(/\\n/g, '\n'), { mode: 0o600 });
  return {
    env: {
      PGHOST: url.hostname,
      PGPORT: url.port || '5432',
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGSSLMODE: 'verify-full',
      PGSSLROOTCERT: caPath,
    },
    cleanupDirectory: directory,
  };
}

export async function cleanupPostgresToolEnvironment(directory: string): Promise<void> {
  const target = resolve(directory);
  const root = resolve(tmpdir());
  const child = relative(root, target);
  if (
    !isAbsolute(target) ||
    child.startsWith('..') ||
    child === '' ||
    !target.split(/[\\/]/).at(-1)?.startsWith('madrasio-pgssl-')
  ) {
    throw new RecoveryError(
      'BACKUP_PLAINTEXT_CLEANUP_FAILED',
      'Refused cleanup outside a generated database TLS directory.',
    );
  }
  try {
    await rm(target, { recursive: true, force: false, maxRetries: 2 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw new RecoveryError(
      'BACKUP_PLAINTEXT_CLEANUP_FAILED',
      'Temporary database TLS material could not be removed.',
    );
  }
}

export function pgDumpArguments(output: string, snapshot: string): string[] {
  return [
    '--format=custom',
    '--data-only',
    '--no-owner',
    '--no-privileges',
    '--no-comments',
    `--snapshot=${snapshot}`,
    `--file=${output}`,
    ...RECOVERY_TABLES.flatMap((table) => ['--table', table]),
  ];
}

export type ArchiveInventory = { tableData: string[]; unsupported: string[] };

export function parsePgRestoreList(value: string): ArchiveInventory {
  const tableData = new Set<string>();
  const unsupported: string[] = [];
  for (const raw of value.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    const match = /^\d+; \d+ \d+ TABLE DATA (auth|public) ([a-z_][a-z0-9_]*) /.exec(line);
    if (match) tableData.add(`${match[1]}.${match[2]}`);
    else if (/ (TABLE|SCHEMA|ACL|FUNCTION|SEQUENCE|DEFAULT ACL) /.test(line))
      unsupported.push(line.slice(0, 120));
  }
  return { tableData: [...tableData].sort(), unsupported };
}

export function assertArchiveInventory(value: string): void {
  const inventory = parsePgRestoreList(value);
  if (
    inventory.unsupported.length ||
    JSON.stringify(inventory.tableData) !== JSON.stringify([...RECOVERY_TABLES].sort())
  ) {
    throw new RecoveryError(
      'BACKUP_INVENTORY_VALIDATION_FAILED',
      'Archive inventory differs from the recovery allowlist.',
    );
  }
}

export async function encryptBundle(
  input: string,
  output: string,
  recipient: string,
  runner: CommandRunner = runCommand,
): Promise<void> {
  try {
    await runner('age', [
      '--encrypt',
      '--recipient',
      validateAgeRecipient(recipient),
      '--output',
      output,
      input,
    ]);
  } catch {
    throw new RecoveryError('BACKUP_ENCRYPTION_FAILED', 'Recovery bundle encryption failed.');
  }
}

export async function decryptBundle(
  input: string,
  output: string,
  identityPath: string,
  runner: CommandRunner = runCommand,
): Promise<void> {
  if (!identityPath || !(await readFile(identityPath, 'utf8')).includes('AGE-SECRET-KEY-'))
    throw new RecoveryError('RESTORE_DECRYPTION_FAILED', 'A local age identity file is required.');
  try {
    await runner('age', ['--decrypt', '--identity', identityPath, '--output', output, input]);
  } catch {
    throw new RecoveryError('RESTORE_DECRYPTION_FAILED', 'Recovery bundle decryption failed.');
  }
}
