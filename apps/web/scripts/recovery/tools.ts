import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, posix, relative, resolve, win32 } from 'node:path';

import { postgresConnectionConfig } from '@school/database/connection';

import {
  AGE_RUNTIME_VERSION,
  PINNED_TOOLS,
  PRODUCTION_POSTGRES_MAJOR,
  RECOVERY_TABLES,
  RecoveryError,
  type RecoveryDiagnostic,
} from './contracts';

export type CommandEnvironment = Record<string, string | undefined>;
export type ExternalToolFailureKind = 'spawn' | 'connection' | 'snapshot' | 'operation';
export class ExternalToolError extends Error {
  constructor(
    public readonly kind: ExternalToolFailureKind,
    public readonly exitCode: number | undefined,
    public readonly signal: string | undefined,
    public readonly timeout: boolean,
  ) {
    super('External recovery tool failed; output withheld.');
    this.name = 'ExternalToolError';
  }
}
export type CommandRunner = (
  command: string,
  args: string[],
  options?: { env?: CommandEnvironment; timeoutMs?: number },
) => Promise<{ stdout: string }>;

export type PnpmInvocation = { command: string; args: string[] };

export function resolvePnpmInvocation(
  args: string[],
  context: {
    platform?: NodeJS.Platform;
    execPath?: string;
    npmExecPath?: string;
  } = {},
): PnpmInvocation {
  const platform = context.platform ?? process.platform;
  const execPath = context.execPath ?? process.execPath;
  const npmExecPath = context.npmExecPath ?? process.env.npm_execpath;
  const normalizedLauncher = npmExecPath?.trim();

  if (normalizedLauncher) {
    const launcherPath = platform === 'win32' ? win32 : posix;
    if (
      !launcherPath.isAbsolute(normalizedLauncher) ||
      !/^pnpm(?:\.(?:js|cjs|mjs))?$/i.test(launcherPath.basename(normalizedLauncher))
    ) {
      throw new RecoveryError(
        'RESTORE_PACKAGE_MANAGER_LAUNCH_FAILED',
        'The recovery package-manager launcher is invalid.',
        { phase: 'migration_launch', timeout: false },
      );
    }
    return { command: execPath, args: [normalizedLauncher, ...args] };
  }

  if (platform === 'win32') {
    throw new RecoveryError(
      'RESTORE_PACKAGE_MANAGER_LAUNCH_FAILED',
      'The recovery package-manager launcher is unavailable.',
      { phase: 'migration_launch', timeout: false },
    );
  }

  return { command: 'pnpm', args: [...args] };
}

export function classifyToolFailure(
  command: string,
  stderr: string,
  exitCode?: number,
): ExternalToolFailureKind {
  if (exitCode !== undefined && [125, 126, 127].includes(exitCode)) return 'spawn';
  if (command !== 'pg_dump') return 'operation';
  const normalized = stderr.toLowerCase();
  if (
    /could not import the requested snapshot|invalid snapshot identifier|snapshot .* does not exist|set transaction snapshot/.test(
      normalized,
    )
  )
    return 'snapshot';
  if (
    /connection to server .* failed|could not connect to server|could not translate host name|password authentication failed|no pg_hba\.conf entry|server closed the connection unexpectedly/.test(
      normalized,
    )
  )
    return 'connection';
  return 'operation';
}

export const PINNED_POSTGRES_CONTAINER =
  'postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3';

export function postgresContainerInvocation(
  command: 'pg_dump' | 'pg_restore',
  args: string[],
  image: string,
): string[] {
  return [
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
    image,
    command,
    ...args,
  ];
}

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
    let actualCommand: string;
    let actualArguments: string[];
    try {
      if (useContainer) {
        actualCommand = 'docker';
        actualArguments = postgresContainerInvocation(
          command as 'pg_dump' | 'pg_restore',
          args,
          configuredImage,
        );
      } else if (command === 'pnpm') {
        const invocation = resolvePnpmInvocation(args);
        actualCommand = invocation.command;
        actualArguments = invocation.args;
      } else {
        actualCommand = command;
        actualArguments = args;
      }
    } catch (error) {
      reject(error);
      return;
    }
    const child = spawn(actualCommand, actualArguments, {
      env: childEnvironment,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const timeoutMs = options.timeoutMs ?? (command === 'pg_dump' ? 15 * 60_000 : 2 * 60_000);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    timer.unref();
    child.stdin.end();
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.on('error', () => {
      clearTimeout(timer);
      reject(new ExternalToolError('spawn', undefined, undefined, false));
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout });
      else
        reject(
          new ExternalToolError(
            timedOut ? 'operation' : classifyToolFailure(command, stderr, code ?? undefined),
            code ?? undefined,
            signal ?? undefined,
            timedOut,
          ),
        );
    });
  });

function toolDiagnostic(
  error: ExternalToolError,
  phase: RecoveryDiagnostic['phase'],
): RecoveryDiagnostic {
  return {
    phase,
    ...(error.exitCode !== undefined ? { exitCode: error.exitCode } : {}),
    ...(error.signal ? { signal: error.signal } : {}),
    timeout: error.timeout,
  };
}

export async function createPgDumpArchive(
  args: string[],
  env: CommandEnvironment,
  runner: CommandRunner = runCommand,
): Promise<void> {
  try {
    await runner('pg_dump', args, { env, timeoutMs: 15 * 60_000 });
  } catch (error) {
    const failure =
      error instanceof ExternalToolError
        ? error
        : new ExternalToolError('spawn', undefined, undefined, false);
    if (failure.timeout)
      throw new RecoveryError(
        'BACKUP_OPERATION_TIMEOUT',
        'The PostgreSQL archive operation timed out.',
        toolDiagnostic(failure, 'archive_creation'),
      );
    const mapping = {
      spawn: ['BACKUP_PG_DUMP_START_FAILED', 'pg_dump_start'],
      connection: ['BACKUP_PG_DUMP_CONNECTION_FAILED', 'pg_dump_connection'],
      snapshot: ['BACKUP_PG_DUMP_SNAPSHOT_FAILED', 'pg_dump_snapshot'],
      operation: ['BACKUP_ARCHIVE_CREATION_FAILED', 'archive_creation'],
    } as const;
    const [code, phase] = mapping[failure.kind];
    throw new RecoveryError(
      code,
      'The PostgreSQL archive could not be created.',
      toolDiagnostic(failure, phase),
    );
  }
}

export async function inspectPgDumpArchive(
  dump: string,
  runner: CommandRunner = runCommand,
): Promise<string> {
  try {
    return (await runner('pg_restore', ['--list', dump], { timeoutMs: 2 * 60_000 })).stdout;
  } catch (error) {
    const failure =
      error instanceof ExternalToolError
        ? error
        : new ExternalToolError('spawn', undefined, undefined, false);
    throw new RecoveryError(
      failure.timeout ? 'BACKUP_OPERATION_TIMEOUT' : 'BACKUP_ARCHIVE_INSPECTION_FAILED',
      failure.timeout
        ? 'The PostgreSQL archive inspection timed out.'
        : 'The PostgreSQL archive could not be inspected.',
      toolDiagnostic(failure, 'archive_inspection'),
    );
  }
}

export async function assertToolVersions(runner: CommandRunner = runCommand): Promise<void> {
  let dump: { stdout: string };
  let restore: { stdout: string };
  let age: { stdout: string };
  try {
    dump = await runner('pg_dump', ['--version'], { timeoutMs: 30_000 });
    restore = await runner('pg_restore', ['--version'], { timeoutMs: 30_000 });
    age = await runner('age', ['--version'], { timeoutMs: 30_000 });
  } catch (error) {
    const failure =
      error instanceof ExternalToolError
        ? error
        : new ExternalToolError('spawn', undefined, undefined, false);
    throw new RecoveryError(
      failure.timeout ? 'BACKUP_OPERATION_TIMEOUT' : 'BACKUP_APPLICATION_EXPORT_FAILED',
      failure.timeout
        ? 'Recovery tool verification timed out.'
        : 'Required recovery tools could not be verified.',
      toolDiagnostic(failure, 'tool_verification'),
    );
  }
  const pgMajor = Number(/(\d+)(?:\.\d+)?/.exec(dump.stdout)?.[1]);
  if (
    pgMajor !== PRODUCTION_POSTGRES_MAJOR ||
    !dump.stdout.includes(PINNED_TOOLS.postgres) ||
    !restore.stdout.includes(PINNED_TOOLS.postgres)
  ) {
    throw new RecoveryError(
      'BACKUP_APPLICATION_EXPORT_FAILED',
      'PostgreSQL 17 client tools are required.',
      { phase: 'tool_verification', timeout: false },
    );
  }
  if (age.stdout.trim() !== AGE_RUNTIME_VERSION) {
    throw new RecoveryError(
      'BACKUP_ENCRYPTION_FAILED',
      'The pinned age tool version is required.',
      {
        phase: 'tool_verification',
        timeout: false,
      },
    );
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
      { phase: 'cleanup', timeout: false },
    );
  }
  try {
    await rm(target, { recursive: true, force: false, maxRetries: 2 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw new RecoveryError(
      'BACKUP_PLAINTEXT_CLEANUP_FAILED',
      'Temporary database TLS material could not be removed.',
      { phase: 'cleanup', timeout: false },
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
      { phase: 'archive_inventory', timeout: false },
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
    throw new RecoveryError('BACKUP_ENCRYPTION_FAILED', 'Recovery bundle encryption failed.', {
      phase: 'encryption',
      timeout: false,
    });
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
