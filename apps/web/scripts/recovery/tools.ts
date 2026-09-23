import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, posix, relative, resolve, win32 } from 'node:path';

import { postgresConnectionConfig } from '@school/database/connection';

import {
  AGE_RUNTIME_VERSION,
  PINNED_TOOLS,
  PRODUCTION_POSTGRES_MAJOR,
  RECOVERY_TABLES,
  RecoveryError,
  type RecoveryDiagnostic,
} from './contracts';
import { assertRecoveryWorkDirectory } from './filesystem';

export type CommandEnvironment = Record<string, string | undefined>;
export type RecoveryArchiveMount = {
  hostArchive: string;
  hostWorkspace: string;
  writable?: boolean;
};
export type ResolvedRecoveryArchiveMount = {
  containerArchive: string;
  containerWorkspace: string;
  hostArchive: string;
  hostWorkspace: string;
  writable?: boolean;
};
export type PostgresTlsMount = {
  hostCa: string;
  hostDirectory: string;
};
export type ResolvedPostgresTlsMount = PostgresTlsMount & {
  containerCa: string;
  containerDirectory: string;
};
export type CommandOptions = {
  env?: CommandEnvironment;
  postgresTlsMount?: PostgresTlsMount;
  recoveryArchiveMount?: RecoveryArchiveMount;
  timeoutMs?: number;
};
export type ExternalToolFailureKind = 'spawn' | 'connection' | 'snapshot' | 'operation';
export type ExternalToolFailureCause = NonNullable<RecoveryDiagnostic['toolCause']>;
export class ExternalToolError extends Error {
  constructor(
    public readonly kind: ExternalToolFailureKind,
    public readonly exitCode: number | undefined,
    public readonly signal: string | undefined,
    public readonly timeout: boolean,
    public readonly cause: ExternalToolFailureCause = 'unknown',
  ) {
    super('External recovery tool failed; output withheld.');
    this.name = 'ExternalToolError';
  }
}
export type CommandRunner = (
  command: string,
  args: string[],
  options?: CommandOptions,
) => Promise<{ stdout: string }>;

export type PnpmInvocation = { command: string; args: string[] };
export type AgeTool = 'age' | 'age-keygen';
export type AgeToolInvocation = { command: string; args: string[] };
export const RECOVERY_AGE_TOOL_DIRECTORY = 'RECOVERY_AGE_TOOL_DIRECTORY';

export function resolveAgeToolInvocation(
  command: AgeTool,
  args: string[],
  context: {
    platform?: NodeJS.Platform;
    toolDirectory?: string;
  } = {},
): AgeToolInvocation {
  const platform = context.platform ?? process.platform;
  const path = platform === 'win32' ? win32 : posix;
  const configuredDirectory = (
    context.toolDirectory ?? process.env[RECOVERY_AGE_TOOL_DIRECTORY]
  )?.trim();
  if (!configuredDirectory) return { command, args: [...args] };
  if (!path.isAbsolute(configuredDirectory)) {
    throw new RecoveryError(
      'BACKUP_ENCRYPTION_FAILED',
      'The configured age tool directory is invalid.',
      { phase: 'tool_verification', toolCause: 'unavailable', timeout: false },
    );
  }
  return {
    command: path.join(configuredDirectory, platform === 'win32' ? `${command}.exe` : command),
    args: [...args],
  };
}

const RECOVERY_PNPM_VERSION = '11.22.0';

function resolveWindowsPnpmLauncher(context: {
  appData?: string;
  readTextFile?: (filePath: string) => string;
  isFile?: (filePath: string) => boolean;
}): string | undefined {
  const appData = (context.appData ?? process.env.APPDATA)?.trim();

  if (!appData || !win32.isAbsolute(appData)) return undefined;

  const packageRoot = win32.join(appData, 'npm', 'node_modules', 'pnpm');
  const packageJsonPath = win32.join(packageRoot, 'package.json');
  const readTextFile =
    context.readTextFile ?? ((filePath: string) => readFileSync(filePath, 'utf8'));
  const isFile =
    context.isFile ?? ((filePath: string) => statSync(filePath).isFile());

  let metadata: {
    name?: unknown;
    version?: unknown;
    bin?: { pnpm?: unknown };
  };

  try {
    metadata = JSON.parse(readTextFile(packageJsonPath)) as typeof metadata;
  } catch {
    return undefined;
  }

  if (
    metadata.name !== 'pnpm' ||
    metadata.version !== RECOVERY_PNPM_VERSION ||
    typeof metadata.bin?.pnpm !== 'string'
  ) {
    return undefined;
  }

  const declaredLauncher = metadata.bin.pnpm.trim();

  if (!declaredLauncher || win32.isAbsolute(declaredLauncher)) return undefined;

  const launcher = win32.resolve(packageRoot, declaredLauncher);
  const relativeLauncher = win32.relative(packageRoot, launcher);

  if (
    !relativeLauncher ||
    relativeLauncher === '..' ||
    relativeLauncher.startsWith(`..${win32.sep}`) ||
    win32.isAbsolute(relativeLauncher) ||
    !/^pnpm\.(?:js|cjs|mjs)$/i.test(win32.basename(launcher))
  ) {
    return undefined;
  }

  try {
    if (!isFile(launcher)) return undefined;
  } catch {
    return undefined;
  }

  return launcher;
}

export function resolvePnpmInvocation(
  args: string[],
  context: {
    platform?: NodeJS.Platform;
    execPath?: string;
    npmExecPath?: string;
    appData?: string;
    readTextFile?: (filePath: string) => string;
    isFile?: (filePath: string) => boolean;
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
    const fallbackLauncher = resolveWindowsPnpmLauncher({
      appData: context.appData,
      readTextFile: context.readTextFile,
      isFile: context.isFile,
    });

    if (fallbackLauncher) {
      return { command: execPath, args: [fallbackLauncher, ...args] };
    }

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

export function classifyToolFailureCause(
  command: string,
  stderr: string,
): ExternalToolFailureCause {
  if (command !== 'pg_dump') return 'unknown';
  const normalized = stderr.toLowerCase();
  if (
    /root certificate file .* (?:does not exist|not found|could not be read)|could not open certificate file|could not load root certificate file/.test(
      normalized,
    )
  )
    return 'tls_ca_unavailable';
  if (
    /certificate verify failed|server certificate .* does not match host name|ssl error|tls error/.test(
      normalized,
    )
  )
    return 'tls_verification';
  if (/password authentication failed|authentication failed/.test(normalized))
    return 'authentication';
  if (
    /could not translate host name|name or service not known|temporary failure in name resolution/.test(
      normalized,
    )
  )
    return 'dns';
  if (
    /could not import the requested snapshot|invalid snapshot identifier|snapshot .* does not exist|set transaction snapshot/.test(
      normalized,
    )
  )
    return 'snapshot';
  if (/permission denied/.test(normalized)) return 'permission';
  if (
    /no space left on device|read-only file system|could not open output file|could not write to output file/.test(
      normalized,
    )
  )
    return 'filesystem';
  if (
    /server closed the connection unexpectedly|terminating connection due to administrator command/.test(
      normalized,
    )
  )
    return 'server';
  if (
    /connection to server .* failed|could not connect to server|connection refused|connection timed out/.test(
      normalized,
    )
  )
    return 'network';
  return 'unknown';
}

export function classifySpawnFailureCause(error: unknown): ExternalToolFailureCause {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (code === 'ENOENT') return 'unavailable';
  if (code === 'EACCES' || code === 'EPERM') return 'permission';
  return 'unknown';
}

export const PINNED_POSTGRES_CONTAINER =
  'postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3';
export const RECOVERY_ARCHIVE_CONTAINER_WORKSPACE = '/madrasio-recovery';
export const POSTGRES_TLS_CONTAINER_DIRECTORY = '/madrasio-pgssl';

export function pgRestoreTableSelection(table: string): string[] {
  const match = /^(auth|public)\.([a-z][a-z0-9_]*)$/.exec(table);
  if (!match) {
    throw new RecoveryError('RESTORE_DATA_FAILED', 'The recovery table selection is invalid.');
  }
  return ['--schema', match[1]!, '--table', match[2]!];
}

export function resolveRecoveryArchiveMount(
  input: RecoveryArchiveMount,
  context: { platform?: NodeJS.Platform } = {},
): ResolvedRecoveryArchiveMount {
  const path = (context.platform ?? process.platform) === 'win32' ? win32 : posix;
  const hostWorkspace = path.resolve(input.hostWorkspace);
  const hostArchive = path.resolve(input.hostArchive);
  const archiveRelative = path.relative(hostWorkspace, hostArchive);
  if (
    !path.basename(hostWorkspace).startsWith('madrasio-recovery-') ||
    !archiveRelative ||
    archiveRelative.startsWith('..') ||
    path.isAbsolute(archiveRelative) ||
    path.basename(hostArchive) !== 'recovery-data.dump'
  ) {
    throw new RecoveryError('RESTORE_DATA_FAILED', 'The recovery archive workspace is invalid.');
  }
  return {
    hostWorkspace,
    hostArchive,
    ...(input.writable ? { writable: true } : {}),
    containerWorkspace: RECOVERY_ARCHIVE_CONTAINER_WORKSPACE,
    containerArchive: posix.join(
      RECOVERY_ARCHIVE_CONTAINER_WORKSPACE,
      ...archiveRelative.split(path.sep),
    ),
  };
}

export async function validateRecoveryArchiveMount(
  input: RecoveryArchiveMount,
): Promise<ResolvedRecoveryArchiveMount> {
  const hostWorkspace = assertRecoveryWorkDirectory(input.hostWorkspace);
  const resolved = resolveRecoveryArchiveMount({ ...input, hostWorkspace });
  let workspaceReal: string;
  let archiveReal: string;
  try {
    workspaceReal = await realpath(resolved.hostWorkspace);
    const archiveStats = await stat(resolved.hostArchive);
    if (!archiveStats.isFile()) throw new Error('not a file');
    archiveReal = await realpath(resolved.hostArchive);
  } catch {
    throw new RecoveryError('RESTORE_DATA_FAILED', 'The recovery archive is missing or invalid.');
  }
  const archiveRelative = relative(workspaceReal, archiveReal);
  if (!archiveRelative || archiveRelative.startsWith('..') || isAbsolute(archiveRelative)) {
    throw new RecoveryError(
      'RESTORE_DATA_FAILED',
      'The recovery archive escapes its generated workspace.',
    );
  }
  return resolveRecoveryArchiveMount({
    hostWorkspace: workspaceReal,
    hostArchive: archiveReal,
    writable: input.writable,
  });
}

export function resolvePostgresTlsMount(
  input: PostgresTlsMount,
  context: { platform?: NodeJS.Platform } = {},
): ResolvedPostgresTlsMount {
  const path = (context.platform ?? process.platform) === 'win32' ? win32 : posix;
  const hostDirectory = path.resolve(input.hostDirectory);
  const hostCa = path.resolve(input.hostCa);
  const caRelative = path.relative(hostDirectory, hostCa);
  if (
    !path.basename(hostDirectory).startsWith('madrasio-pgssl-') ||
    caRelative !== 'root.crt' ||
    path.isAbsolute(caRelative)
  ) {
    throw new RecoveryError(
      'BACKUP_TARGET_VERIFICATION_FAILED',
      'The PostgreSQL TLS trust mount is invalid.',
    );
  }
  return {
    hostDirectory,
    hostCa,
    containerDirectory: POSTGRES_TLS_CONTAINER_DIRECTORY,
    containerCa: posix.join(POSTGRES_TLS_CONTAINER_DIRECTORY, 'root.crt'),
  };
}

export async function validatePostgresTlsMount(
  input: PostgresTlsMount,
): Promise<ResolvedPostgresTlsMount> {
  const resolved = resolvePostgresTlsMount(input);
  let directoryReal: string;
  let caReal: string;
  try {
    directoryReal = await realpath(resolved.hostDirectory);
    const caStats = await stat(resolved.hostCa);
    if (!caStats.isFile() || caStats.size === 0) throw new Error('invalid CA file');
    caReal = await realpath(resolved.hostCa);
  } catch {
    throw new RecoveryError(
      'BACKUP_TARGET_VERIFICATION_FAILED',
      'The PostgreSQL TLS trust file is missing or invalid.',
    );
  }
  const caRelative = relative(directoryReal, caReal);
  if (caRelative !== 'root.crt' || isAbsolute(caRelative)) {
    throw new RecoveryError(
      'BACKUP_TARGET_VERIFICATION_FAILED',
      'The PostgreSQL TLS trust file escapes its generated directory.',
    );
  }
  return resolvePostgresTlsMount({ hostDirectory: directoryReal, hostCa: caReal });
}

export function postgresContainerInvocation(
  command: 'pg_dump' | 'pg_restore',
  args: string[],
  image: string,
  archiveMount?: ResolvedRecoveryArchiveMount,
  tlsMount?: ResolvedPostgresTlsMount,
): string[] {
  if (command === 'pg_restore' && !archiveMount && args.join(' ') !== '--version') {
    throw new RecoveryError(
      'RESTORE_DATA_FAILED',
      'Containerized pg_restore requires a validated recovery archive mount.',
    );
  }
  if (command === 'pg_restore' && archiveMount?.writable) {
    throw new RecoveryError('RESTORE_DATA_FAILED', 'Restore archive mounts must be read-only.');
  }
  if (command === 'pg_dump' && archiveMount && !archiveMount.writable) {
    throw new RecoveryError(
      'BACKUP_ARCHIVE_CREATION_FAILED',
      'Backup archive mounts must be explicitly writable.',
    );
  }
  const commandArguments = archiveMount
    ? args.map((argument) =>
        argument === archiveMount.hostArchive
          ? archiveMount.containerArchive
          : argument === `--file=${archiveMount.hostArchive}`
            ? `--file=${archiveMount.containerArchive}`
            : argument,
      )
    : args;
  if (
    archiveMount &&
    !commandArguments.includes(archiveMount.containerArchive) &&
    !commandArguments.includes(`--file=${archiveMount.containerArchive}`)
  ) {
    throw new RecoveryError(
      'RESTORE_DATA_FAILED',
      'The validated recovery archive was not selected by the PostgreSQL tool.',
    );
  }
  return [
    'run',
    '--rm',
    '--network',
    'host',
    ...(archiveMount
      ? [
          '--mount',
          `type=bind,source=${archiveMount.hostWorkspace},target=${archiveMount.containerWorkspace}${archiveMount.writable ? '' : ',readonly'}`,
        ]
      : command === 'pg_dump'
        ? ['--volume', '/tmp:/tmp:rw']
        : []),
    ...(tlsMount
      ? [
          '--mount',
          `type=bind,source=${tlsMount.hostDirectory},target=${tlsMount.containerDirectory},readonly`,
        ]
      : []),
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
    ...commandArguments,
  ];
}

export function postgresContainerEnvironment(
  env: CommandEnvironment,
  tlsMount?: ResolvedPostgresTlsMount,
): CommandEnvironment {
  if (env.PGSSLMODE === 'verify-full') {
    if (!tlsMount || env.PGSSLROOTCERT !== tlsMount.hostCa) {
      throw new RecoveryError(
        'BACKUP_TARGET_VERIFICATION_FAILED',
        'Containerized PostgreSQL verified TLS requires a validated trust mount.',
      );
    }
    return { ...env, PGSSLROOTCERT: tlsMount.containerCa };
  }
  if (env.PGSSLROOTCERT || tlsMount) {
    throw new RecoveryError(
      'BACKUP_TARGET_VERIFICATION_FAILED',
      'PostgreSQL TLS trust material requires verify-full mode.',
    );
  }
  if (env.PGSSLMODE && env.PGSSLMODE !== 'disable') {
    throw new RecoveryError(
      'BACKUP_TARGET_VERIFICATION_FAILED',
      'Unsupported PostgreSQL TLS mode.',
    );
  }
  return { ...env };
}

export const runCommand: CommandRunner = async (command, args, options = {}) => {
  const archiveMount = options.recoveryArchiveMount
    ? await validateRecoveryArchiveMount(options.recoveryArchiveMount)
    : undefined;
  const tlsMount = options.postgresTlsMount
    ? await validatePostgresTlsMount(options.postgresTlsMount)
    : undefined;
  return new Promise((resolve, reject) => {
    const inherited = Object.fromEntries(
      [
        'PATH',
        'Path',
        'PATHEXT',
        'SYSTEMROOT',
        'SystemRoot',
        'COMSPEC',
        'TEMP',
        'TMP',
        'HOME',
        'USERPROFILE',
        'APPDATA',
        'LOCALAPPDATA',
      ].map((key) => [key, process.env[key]]),
    );
    let childEnvironment = {
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
        childEnvironment = {
          ...childEnvironment,
          ...postgresContainerEnvironment(options.env ?? {}, tlsMount),
        };
        actualCommand = 'docker';
        actualArguments = postgresContainerInvocation(
          command as 'pg_dump' | 'pg_restore',
          args,
          configuredImage,
          archiveMount,
          tlsMount,
        );
      } else if (command === 'pnpm') {
        const invocation = resolvePnpmInvocation(args);
        actualCommand = invocation.command;
        actualArguments = invocation.args;
      } else if (command === 'age' || command === 'age-keygen') {
        const invocation = resolveAgeToolInvocation(command, args, {
          toolDirectory:
            options.env?.[RECOVERY_AGE_TOOL_DIRECTORY] ??
            process.env[RECOVERY_AGE_TOOL_DIRECTORY],
        });
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
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(
        new ExternalToolError(
          'spawn',
          undefined,
          undefined,
          false,
          classifySpawnFailureCause(error),
        ),
      );
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
            timedOut ? 'unknown' : classifyToolFailureCause(command, stderr),
          ),
        );
    });
  });
};

export async function assertPostgresContainerArchiveReadable(
  input: RecoveryArchiveMount,
  image: string,
  runner: CommandRunner = runCommand,
): Promise<ResolvedRecoveryArchiveMount> {
  if (image !== PINNED_POSTGRES_CONTAINER) {
    throw new RecoveryError(
      'RESTORE_DATA_FAILED',
      'The PostgreSQL recovery container is not the reviewed immutable image.',
    );
  }
  const mount = await validateRecoveryArchiveMount(input);
  try {
    await runner(
      'docker',
      [
        'run',
        '--rm',
        '--mount',
        `type=bind,source=${mount.hostWorkspace},target=${mount.containerWorkspace},readonly`,
        image,
        'test',
        '-r',
        mount.containerArchive,
      ],
      { timeoutMs: 30_000 },
    );
  } catch {
    throw new RecoveryError(
      'RESTORE_DATA_FAILED',
      'The recovery archive is inaccessible inside the PostgreSQL container.',
    );
  }
  return mount;
}

function toolDiagnostic(
  error: ExternalToolError,
  phase: RecoveryDiagnostic['phase'],
): RecoveryDiagnostic {
  return {
    phase,
    toolCause: error.cause,
    ...(error.exitCode !== undefined ? { exitCode: error.exitCode } : {}),
    ...(error.signal ? { signal: error.signal } : {}),
    timeout: error.timeout,
  };
}

export async function createPgDumpArchive(
  args: string[],
  env: CommandEnvironment,
  runner: CommandRunner = runCommand,
  archiveMount?: RecoveryArchiveMount,
  postgresTlsMount?: PostgresTlsMount,
): Promise<void> {
  try {
    await runner('pg_dump', args, {
      env,
      timeoutMs: 15 * 60_000,
      ...(archiveMount ? { recoveryArchiveMount: archiveMount } : {}),
      ...(postgresTlsMount ? { postgresTlsMount } : {}),
    });
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
    return (
      await runner('pg_restore', ['--list', dump], {
        recoveryArchiveMount: { hostArchive: dump, hostWorkspace: dirname(dump) },
        timeoutMs: 2 * 60_000,
      })
    ).stdout;
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
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
  if (!ca?.trim() && localHosts.has(url.hostname)) {
    return {
      env: {
        PGHOST: url.hostname,
        PGPORT: url.port || '5432',
        PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
        PGSSLMODE: 'disable',
      },
      tlsMount: undefined,
      cleanupDirectory: undefined,
    };
  }
  if (!ca?.trim())
    throw new RecoveryError(
      'BACKUP_TARGET_VERIFICATION_FAILED',
      'Trusted database CA is required.',
    );
  const normalizedCa = ca.replace(/\\n/g, '\n').trim();
  if (!/^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----$/.test(normalizedCa)) {
    throw new RecoveryError(
      'BACKUP_TARGET_VERIFICATION_FAILED',
      'Trusted database CA must be a PEM certificate.',
    );
  }
  const directory = await mkdtemp(join(tmpdir(), 'madrasio-pgssl-'));
  const caPath = join(directory, 'root.crt');
  await writeFile(caPath, `${normalizedCa}\n`, { mode: 0o600 });
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
    tlsMount: { hostDirectory: directory, hostCa: caPath },
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
