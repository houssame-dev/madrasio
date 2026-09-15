import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { networkInterfaces, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';

import { applicationSecurityAuditSql, assertApplicationSecurity } from '@school/database/security';
import { Pool } from 'pg';

import { APPLICATION_TABLES, RecoveryError, assertIsolatedRestoreTarget } from './contracts';
import { loadAuthSchemaContract } from './inventory';
import { assertEmptyRestoreFoundation } from './restore';

export const LOCAL_TARGET_IMAGES = {
  database:
    'public.ecr.aws/supabase/postgres:17.6.1.156@sha256:ca7871b587ca2c401ac0f325df6249c9aa0d25647ded34631158efc51176767f',
  auth: 'public.ecr.aws/supabase/gotrue:v2.194.0@sha256:2b352c02adf11a2025cd5993c246ef85db73743553c39194d2b1862d1cc4d1fd',
} as const;

export const LOCAL_TARGET_LABEL = 'com.madrasio.recovery-target';
export const DEFAULT_LOCAL_TARGET_PORTS = { auth: 55431, database: 55432 } as const;
const TARGET_PREFIX = 'madrasio-recovery-target-';
const AUTH_COLUMN_COUNTS = { users: 35, identities: 9 } as const;

export type DockerPortBindings = Record<string, Array<{ HostIp: string; HostPort: string }> | null>;

export type ListeningSocket = { host: string; port: number };

export type LocalTargetState = {
  version: 1;
  id: string;
  createdAt: string;
  workDirectory: string;
  statePath: string;
  databaseContainer: string;
  authContainer: string;
  databaseVolume: string;
  network: string;
  databasePort: number;
  authPort: number;
  databasePassword: string;
  jwtSecret: string;
  images: typeof LOCAL_TARGET_IMAGES;
};

export type LocalTargetVerification = {
  id: string;
  databaseHealthy: boolean;
  authHealthy: boolean;
  postgresVersion: string;
  authUsersColumns: number;
  authIdentitiesColumns: number;
  authUsers: number;
  authIdentities: number;
  applicationTables: number;
  migrations: number;
  rlsTables: number;
  applicationPolicies: number;
  security: 'accepted' | 'not-migrated';
  dockerBindings: DockerPortBindings;
  listeningSockets: ListeningSocket[];
  nonLoopbackBindings: number;
  lanConnectivity: 'rejected' | 'not-tested';
};

type ProcessResult = { stdout: string; exitCode: number };
type ProcessOptions = {
  env?: NodeJS.ProcessEnv;
  input?: string;
  timeoutMs?: number;
  allowFailure?: boolean;
};

async function runProcess(
  command: string,
  args: string[],
  options: ProcessOptions = {},
): Promise<ProcessResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      env: options.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, options.timeoutMs ?? 120_000);
    timer.unref();
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.on('error', () => {
      clearTimeout(timer);
      rejectPromise(new Error('Local recovery target process could not start.'));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 || options.allowFailure) resolvePromise({ stdout, exitCode: code ?? 1 });
      else
        rejectPromise(
          new Error(
            timedOut
              ? 'Local recovery target process timed out.'
              : 'Local recovery target process failed.',
          ),
        );
      void stderr;
    });
    child.stdin.end(options.input);
  });
}

async function runPnpm(args: string[], options: ProcessOptions): Promise<ProcessResult> {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && /pnpm(?:\.c?m?js)?$/i.test(npmExecPath))
    return runProcess(process.execPath, [npmExecPath, ...args], options);
  if (process.platform === 'win32') {
    const command = ['pnpm', ...args].join(' ');
    return runProcess(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], options);
  }
  return runProcess('pnpm', args, options);
}

function dockerBinary(): string {
  return process.env.RECOVERY_DOCKER_BINARY?.trim() || 'docker';
}

async function docker(args: string[], options?: ProcessOptions): Promise<ProcessResult> {
  return runProcess(dockerBinary(), args, options);
}

function targetResources(id: string) {
  return {
    databaseContainer: `${id}-db`,
    authContainer: `${id}-auth`,
    databaseVolume: `${id}-db-data`,
    network: `${id}-network`,
  };
}

function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1';
}

export function assertLoopbackBindings(
  bindings: DockerPortBindings,
  expectedContainerPorts: readonly string[],
): void {
  const published = Object.entries(bindings).flatMap(([containerPort, values]) =>
    (values ?? []).map((value) => ({ containerPort, ...value })),
  );
  if (
    published.length !== expectedContainerPorts.length ||
    published.some(
      ({ containerPort, HostIp }) =>
        !expectedContainerPorts.includes(containerPort) || !isLoopbackHost(HostIp),
    ) ||
    expectedContainerPorts.some(
      (containerPort) => !published.some((binding) => binding.containerPort === containerPort),
    )
  ) {
    throw new RecoveryError(
      'LOCAL_RESTORE_TARGET_BROAD_BINDING',
      'The local recovery target has a non-loopback or unexpected published port.',
    );
  }
}

export function parseWindowsListeningSockets(output: string): ListeningSocket[] {
  const sockets: ListeningSocket[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*TCP\s+(\[[^\]]+\]|[^:\s]+):(\d+)\s+\S+\s+LISTENING\b/i);
    if (!match) continue;
    sockets.push({ host: match[1]!, port: Number(match[2]) });
  }
  return sockets;
}

export function assertLoopbackListeningSockets(
  sockets: ListeningSocket[],
  expectedPorts: readonly number[],
): void {
  const target = sockets.filter((socket) => expectedPorts.includes(socket.port));
  if (
    target.some((socket) => !isLoopbackHost(socket.host)) ||
    expectedPorts.some((port) => !target.some((socket) => socket.port === port))
  ) {
    throw new RecoveryError(
      'LOCAL_RESTORE_TARGET_BROAD_BINDING',
      'The local recovery target socket audit found a broad or missing listener.',
    );
  }
}

function assertPort(port: number): number {
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535)
    throw new Error('Local recovery target port is invalid.');
  return port;
}

function localTargetUrl(state: LocalTargetState): string {
  return `postgresql://postgres:${encodeURIComponent(state.databasePassword)}@127.0.0.1:${state.databasePort}/postgres`;
}

function assertStatePath(path: string): string {
  const full = resolve(path);
  const root = resolve(tmpdir());
  const fromRoot = relative(root, full);
  if (
    !fromRoot ||
    fromRoot.startsWith('..') ||
    isAbsolute(fromRoot) ||
    !basename(dirname(full)).startsWith(TARGET_PREFIX)
  )
    throw new Error('Refused local recovery target state outside its temporary directory.');
  return full;
}

export async function readLocalTargetState(path: string): Promise<LocalTargetState> {
  const full = assertStatePath(path);
  const parsed = JSON.parse(await readFile(full, 'utf8')) as LocalTargetState;
  if (typeof parsed.id !== 'string') throw new Error('Local recovery target state is invalid.');
  const resources = targetResources(parsed.id);
  if (
    parsed.version !== 1 ||
    !parsed.id.startsWith(TARGET_PREFIX) ||
    parsed.statePath !== full ||
    parsed.workDirectory !== dirname(full) ||
    parsed.databaseContainer !== resources.databaseContainer ||
    parsed.authContainer !== resources.authContainer ||
    parsed.databaseVolume !== resources.databaseVolume ||
    parsed.network !== resources.network ||
    assertPort(parsed.databasePort) !== parsed.databasePort ||
    assertPort(parsed.authPort) !== parsed.authPort ||
    parsed.databasePort === parsed.authPort ||
    !/^[0-9a-f]{48}$/.test(parsed.databasePassword) ||
    !/^[0-9a-f]{64}$/.test(parsed.jwtSecret) ||
    parsed.images.database !== LOCAL_TARGET_IMAGES.database ||
    parsed.images.auth !== LOCAL_TARGET_IMAGES.auth
  ) {
    throw new Error('Local recovery target state is invalid.');
  }
  return parsed;
}

async function resourceExists(type: 'container' | 'volume' | 'network', name: string) {
  const result = await docker([type, 'inspect', name], { allowFailure: true });
  return result.exitCode === 0;
}

async function waitForDatabase(container: string): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await docker(['inspect', '--format', '{{.State.Health.Status}}', container], {
      allowFailure: true,
    });
    if (result.stdout.trim() === 'healthy') return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error('Local recovery database did not become healthy.');
}

async function waitForAuth(port: number): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(1_500),
      });
      await response.arrayBuffer();
      if (response.ok) return;
    } catch {
      // A bounded retry is expected while GoTrue applies its managed migrations.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error('Local recovery Auth service did not become healthy.');
}

async function inspectBindings(container: string): Promise<DockerPortBindings> {
  const result = await docker([
    'inspect',
    '--format',
    '{{json .NetworkSettings.Ports}}',
    container,
  ]);
  return JSON.parse(result.stdout) as DockerPortBindings;
}

async function auditWindowsSockets(ports: readonly number[]): Promise<ListeningSocket[]> {
  if (process.platform !== 'win32') return [];
  const result = await runProcess('netstat', ['-ano', '-p', 'tcp']);
  const sockets = parseWindowsListeningSockets(result.stdout).filter((socket) =>
    ports.includes(socket.port),
  );
  assertLoopbackListeningSockets(sockets, ports);
  return sockets;
}

async function rejectsLanConnections(ports: readonly number[]): Promise<'rejected' | 'not-tested'> {
  const addresses = Object.values(networkInterfaces())
    .flatMap((values) => values ?? [])
    .filter((item) => item.family === 'IPv4' && !item.internal)
    .map((item) => item.address);
  if (!addresses.length) return 'not-tested';
  for (const host of addresses) {
    for (const port of ports) {
      const connected = await new Promise<boolean>((resolvePromise) => {
        const socket = createConnection({ host, port });
        const finish = (value: boolean) => {
          socket.destroy();
          resolvePromise(value);
        };
        socket.once('connect', () => finish(true));
        socket.once('error', () => finish(false));
        socket.setTimeout(750, () => finish(false));
      });
      if (connected)
        throw new RecoveryError(
          'LOCAL_RESTORE_TARGET_BROAD_BINDING',
          'The local recovery target is reachable through a non-loopback interface.',
        );
    }
  }
  return 'rejected';
}

async function writeEnvironmentFile(path: string, values: Record<string, string>): Promise<void> {
  await writeFile(
    path,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`,
    { mode: 0o600 },
  );
}

async function assertOwnedResource(
  type: 'container' | 'volume' | 'network',
  name: string,
  id: string,
): Promise<void> {
  const result = await docker([
    type,
    'inspect',
    '--format',
    type === 'container'
      ? `{{index .Config.Labels "${LOCAL_TARGET_LABEL}"}}`
      : `{{index .Labels "${LOCAL_TARGET_LABEL}"}}`,
    name,
  ]);
  if (result.stdout.trim() !== id)
    throw new Error('Refused cleanup of an unowned Docker resource.');
}

async function cleanupResources(state: LocalTargetState, removeDirectory: boolean): Promise<void> {
  for (const container of [state.authContainer, state.databaseContainer]) {
    if (await resourceExists('container', container)) {
      await assertOwnedResource('container', container, state.id);
      await docker(['rm', '--force', container]);
    }
  }
  if (await resourceExists('volume', state.databaseVolume)) {
    await assertOwnedResource('volume', state.databaseVolume, state.id);
    await docker(['volume', 'rm', state.databaseVolume]);
  }
  if (await resourceExists('network', state.network)) {
    await assertOwnedResource('network', state.network, state.id);
    await docker(['network', 'rm', state.network]);
  }
  if (removeDirectory) await rm(state.workDirectory, { recursive: true, force: true });
}

export async function cleanupLocalRecoveryTarget(statePath: string): Promise<void> {
  const state = await readLocalTargetState(statePath);
  await cleanupResources(state, true);
}

export async function createLocalRecoveryTarget(
  options: {
    databasePort?: number;
    authPort?: number;
  } = {},
): Promise<LocalTargetState> {
  const databasePort = assertPort(options.databasePort ?? DEFAULT_LOCAL_TARGET_PORTS.database);
  const authPort = assertPort(options.authPort ?? DEFAULT_LOCAL_TARGET_PORTS.auth);
  if (databasePort === authPort) throw new Error('Local recovery target ports must be distinct.');
  const workDirectory = await mkdtemp(join(tmpdir(), TARGET_PREFIX));
  const id = `${TARGET_PREFIX}${basename(workDirectory).slice(TARGET_PREFIX.length)}`.toLowerCase();
  const resources = targetResources(id);
  const statePath = resolve(workDirectory, 'state.json');
  const state: LocalTargetState = {
    version: 1,
    id,
    createdAt: new Date().toISOString(),
    workDirectory,
    statePath,
    ...resources,
    databasePort,
    authPort,
    databasePassword: randomBytes(24).toString('hex'),
    jwtSecret: randomBytes(32).toString('hex'),
    images: LOCAL_TARGET_IMAGES,
  };
  let cleanupRequired = true;
  try {
    for (const [type, name] of [
      ['container', state.databaseContainer],
      ['container', state.authContainer],
      ['volume', state.databaseVolume],
      ['network', state.network],
    ] as const) {
      if (await resourceExists(type, name))
        throw new Error('Local recovery target resource collision.');
    }
    await docker([
      'network',
      'create',
      '--driver',
      'bridge',
      '--opt',
      'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
      '--label',
      `${LOCAL_TARGET_LABEL}=${id}`,
      state.network,
    ]);
    await docker([
      'volume',
      'create',
      '--label',
      `${LOCAL_TARGET_LABEL}=${id}`,
      state.databaseVolume,
    ]);
    const databaseEnvironment = resolve(workDirectory, 'database.env');
    await writeEnvironmentFile(databaseEnvironment, { POSTGRES_PASSWORD: state.databasePassword });
    await docker([
      'run',
      '--detach',
      '--name',
      state.databaseContainer,
      '--label',
      `${LOCAL_TARGET_LABEL}=${id}`,
      '--network',
      state.network,
      '--network-alias',
      'db',
      '--publish',
      `127.0.0.1:${databasePort}:5432`,
      '--env-file',
      databaseEnvironment,
      '--volume',
      `${state.databaseVolume}:/var/lib/postgresql/data`,
      LOCAL_TARGET_IMAGES.database,
    ]);
    await rm(databaseEnvironment, { force: true });
    await waitForDatabase(state.databaseContainer);
    await docker(
      ['exec', '-i', state.databaseContainer, 'psql', '-U', 'supabase_admin', '-d', 'postgres'],
      {
        input: `alter role postgres with login password '${state.databasePassword}';\nalter role supabase_auth_admin with password '${state.databasePassword}';\n`,
      },
    );
    const authEnvironment = resolve(workDirectory, 'auth.env');
    await writeEnvironmentFile(authEnvironment, {
      GOTRUE_API_HOST: '0.0.0.0',
      GOTRUE_API_PORT: '9999',
      API_EXTERNAL_URL: `http://127.0.0.1:${authPort}`,
      GOTRUE_DB_DRIVER: 'postgres',
      GOTRUE_DB_DATABASE_URL: `postgres://supabase_auth_admin:${state.databasePassword}@db:5432/postgres`,
      GOTRUE_SITE_URL: `http://127.0.0.1:${authPort}`,
      GOTRUE_URI_ALLOW_LIST: `http://127.0.0.1:${authPort}`,
      GOTRUE_DISABLE_SIGNUP: 'true',
      GOTRUE_JWT_SECRET: state.jwtSecret,
      GOTRUE_JWT_EXP: '3600',
      GOTRUE_JWT_AUD: 'authenticated',
      GOTRUE_JWT_ADMIN_ROLES: 'service_role',
      GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
      GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
      GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED: 'false',
      GOTRUE_MAILER_AUTOCONFIRM: 'false',
      GOTRUE_SMTP_ADMIN_EMAIL: 'local@example.invalid',
      GOTRUE_SMTP_HOST: 'localhost',
      GOTRUE_SMTP_PORT: '2500',
      GOTRUE_SMTP_USER: 'local',
      GOTRUE_SMTP_PASS: 'local',
      GOTRUE_SMTP_SENDER_NAME: 'Local Recovery',
      GOTRUE_EXTERNAL_PHONE_ENABLED: 'false',
      GOTRUE_SMS_AUTOCONFIRM: 'false',
    });
    await docker([
      'run',
      '--detach',
      '--name',
      state.authContainer,
      '--label',
      `${LOCAL_TARGET_LABEL}=${id}`,
      '--network',
      state.network,
      '--network-alias',
      'auth',
      '--publish',
      `127.0.0.1:${authPort}:9999`,
      '--env-file',
      authEnvironment,
      LOCAL_TARGET_IMAGES.auth,
    ]);
    await rm(authEnvironment, { force: true });
    await waitForAuth(authPort);
    await writeFile(statePath, `${JSON.stringify(state)}\n`, { mode: 0o600 });
    await verifyLocalRecoveryTarget(statePath, { expectMigrated: false });
    cleanupRequired = false;
    return state;
  } finally {
    if (cleanupRequired) await cleanupResources(state, true).catch(() => undefined);
  }
}

async function queryScalar(state: LocalTargetState, sql: string): Promise<string> {
  const result = await docker([
    'exec',
    state.databaseContainer,
    'psql',
    '-U',
    'supabase_admin',
    '-d',
    'postgres',
    '-Atc',
    sql,
  ]);
  return result.stdout.trim();
}

export async function verifyLocalRecoveryTarget(
  statePath: string,
  options: { expectMigrated: boolean },
): Promise<LocalTargetVerification> {
  const state = await readLocalTargetState(statePath);
  assertIsolatedRestoreTarget({
    NODE_ENV: 'test',
    RESTORE_TARGET_ENV: 'isolated-local',
    RESTORE_CONFIRMATION: 'RESTORE_ISOLATED_LOCAL',
    RESTORE_DATABASE_URL: localTargetUrl(state),
  });
  const databaseBindings = await inspectBindings(state.databaseContainer);
  const authBindings = await inspectBindings(state.authContainer);
  assertLoopbackBindings(databaseBindings, ['5432/tcp']);
  assertLoopbackBindings(authBindings, ['9999/tcp']);
  const ports = [state.databasePort, state.authPort];
  const listeningSockets = await auditWindowsSockets(ports);
  const lanConnectivity = await rejectsLanConnections(ports);
  await waitForDatabase(state.databaseContainer);
  await waitForAuth(state.authPort);
  const pool = new Pool({ connectionString: localTargetUrl(state), ssl: false });
  try {
    const authSchema = await loadAuthSchemaContract(pool);
    const authUsersColumns = authSchema.filter((item) => item.table === 'users').length;
    const authIdentitiesColumns = authSchema.filter((item) => item.table === 'identities').length;
    if (
      authUsersColumns !== AUTH_COLUMN_COUNTS.users ||
      authIdentitiesColumns !== AUTH_COLUMN_COUNTS.identities
    ) {
      throw new Error('Local recovery Auth schema is incompatible.');
    }
    const counts = await pool.query<{
      auth_users: number;
      auth_identities: number;
      application_tables: number;
      rls_tables: number;
      policies: number;
    }>(
      `select
      (select count(*)::int from auth.users) auth_users,
      (select count(*)::int from auth.identities) auth_identities,
      (select count(*)::int from information_schema.tables where table_schema='public' and table_name=any($1::text[])) application_tables,
      (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[]) and c.relrowsecurity) rls_tables,
      (select count(*)::int from pg_policies where schemaname='public' and tablename=any($1::text[])) policies`,
      [APPLICATION_TABLES],
    );
    const row = counts.rows[0]!;
    const journalExists = (
      await pool.query<{ exists: boolean }>(
        "select to_regclass('drizzle.__drizzle_migrations') is not null as exists",
      )
    ).rows[0]?.exists;
    const migrations = journalExists
      ? ((
          await pool.query<{ count: number }>(
            'select count(*)::int count from drizzle.__drizzle_migrations',
          )
        ).rows[0]?.count ?? 0)
      : 0;
    if (row.auth_users !== 0 || row.auth_identities !== 0)
      throw new Error('Local recovery Auth foundation is not empty.');
    if (!options.expectMigrated) await assertEmptyRestoreFoundation(pool);
    let security: LocalTargetVerification['security'] = 'not-migrated';
    if (options.expectMigrated) {
      if (
        row.application_tables !== APPLICATION_TABLES.length ||
        migrations !== 16 ||
        row.rls_tables !== APPLICATION_TABLES.length ||
        row.policies !== 0
      ) {
        throw new Error('Local recovery application foundation is incomplete.');
      }
      const audit = await pool.query<{ violation: string }>(applicationSecurityAuditSql);
      assertApplicationSecurity(audit.rows);
      security = 'accepted';
    }
    return {
      id: state.id,
      databaseHealthy: true,
      authHealthy: true,
      postgresVersion: await queryScalar(state, "select current_setting('server_version')"),
      authUsersColumns,
      authIdentitiesColumns,
      authUsers: row.auth_users,
      authIdentities: row.auth_identities,
      applicationTables: row.application_tables,
      migrations,
      rlsTables: row.rls_tables,
      applicationPolicies: row.policies,
      security,
      dockerBindings: { ...databaseBindings, ...authBindings },
      listeningSockets,
      nonLoopbackBindings: 0,
      lanConnectivity,
    };
  } finally {
    await pool.end();
  }
}

export async function migrateLocalRecoveryTarget(statePath: string): Promise<void> {
  const state = await readLocalTargetState(statePath);
  await verifyLocalRecoveryTarget(statePath, { expectMigrated: false });
  await runPnpm(['--filter', '@school/database', 'migrate'], {
    env: {
      ...process.env,
      DATABASE_URL: undefined,
      DATABASE_SSL_CA: undefined,
      DEPLOY_TARGET_ENV: undefined,
      TARGET_ENV: undefined,
      PRODUCTION_EXPECTED_PROJECT_REF: undefined,
      DEPLOY_EXPECTED_PROJECT_REF: undefined,
      MIGRATION_DATABASE_URL: localTargetUrl(state),
    },
    timeoutMs: 5 * 60_000,
  });
  await verifyLocalRecoveryTarget(statePath, { expectMigrated: true });
}

export async function runLocalTargetRehearsal(): Promise<{
  verification: LocalTargetVerification;
  cleanup: 'complete';
}> {
  const state = await createLocalRecoveryTarget();
  try {
    await migrateLocalRecoveryTarget(state.statePath);
    return {
      verification: await verifyLocalRecoveryTarget(state.statePath, { expectMigrated: true }),
      cleanup: 'complete',
    };
  } finally {
    await cleanupLocalRecoveryTarget(state.statePath);
  }
}

async function main(): Promise<void> {
  const [action, path] = process.argv.slice(2);
  if (action === 'create') {
    const state = await createLocalRecoveryTarget();
    process.stdout.write(`${JSON.stringify({ id: state.id, statePath: state.statePath })}\n`);
    return;
  }
  if (!path && action !== 'rehearse')
    throw new Error('A local recovery target state path is required.');
  if (action === 'verify') {
    process.stdout.write(
      `${JSON.stringify(await verifyLocalRecoveryTarget(path!, { expectMigrated: false }))}\n`,
    );
    return;
  }
  if (action === 'migrate') {
    await migrateLocalRecoveryTarget(path!);
    process.stdout.write(
      `${JSON.stringify(await verifyLocalRecoveryTarget(path!, { expectMigrated: true }))}\n`,
    );
    return;
  }
  if (action === 'cleanup') {
    await cleanupLocalRecoveryTarget(path!);
    process.stdout.write(`${JSON.stringify({ cleanup: 'complete' })}\n`);
    return;
  }
  if (action === 'rehearse') {
    process.stdout.write(`${JSON.stringify(await runLocalTargetRehearsal())}\n`);
    return;
  }
  throw new Error('Unknown local recovery target action.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write(
      `${JSON.stringify({ code: 'LOCAL_RECOVERY_TARGET_OPERATION_FAILED', message: 'Local recovery target operation failed.' })}\n`,
    );
    process.exitCode = 1;
  });
}
