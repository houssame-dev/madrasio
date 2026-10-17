// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { rootCertificates } from 'node:tls';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createAuthTestDb, seedMembership, seedSchool, type AuthTestDb } from '../auth/test-helpers';
import { ADMIN_ACTOR, ADMIN_ACTION, parsePlatformAdminConfig, recipientDigest, type AdminReceipt, type PlatformAdminConfig, type ReceiptStore } from '../../scripts/operator/platform-admin-contracts';
import { platformMigrationContract, runPlatformAdmin, runPlatformAdminPreflight, type AdminDependencies, type OperatorDatabase, type OperatorSql } from '../../scripts/operator/platform-admin';
import { fileReceiptStore, main, operatorAuth, operatorDatabase, safeOperatorFailure, withReceiptLease } from '../../scripts/operator/staging-platform-admin';
import { Pool, type PoolClient } from 'pg';

const id = 'a0580000-0000-4000-8000-000000000001';
const email = 'platform.operator@example.test';
const before = '2020-01-01T00:00:00.000Z';
const created = '2026-01-01T00:00:00.000Z';
const secret = 'sb_secret_synthetic_operator_fixture';
function environment(): NodeJS.ProcessEnv {
  return { NODE_ENV: 'test', PLATFORM_ADMIN_TARGET_ENV: 'staging', STAGING_EXPECTED_PROJECT_REF: 'cqeaxlttezunirsmkrxz',
    SUPABASE_URL: 'https://cqeaxlttezunirsmkrxz.supabase.co', SUPABASE_SECRET_KEY: secret,
    MIGRATION_DATABASE_URL: 'postgresql://postgres.cqeaxlttezunirsmkrxz:synthetic-only@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
    DATABASE_SSL_CA: rootCertificates[0], APP_URL: 'https://madrasio-staging.vercel.app',
    PLATFORM_ADMIN_EMAIL: email, PLATFORM_ADMIN_AUTH_USER_ID: id,
    PLATFORM_ADMIN_OPERATION_ID: randomUUID(), PLATFORM_ADMIN_AUTHORIZATION_ID: randomUUID(),
    PLATFORM_ADMIN_RECEIPT_PATH: path.join(tmpdir(), 'synthetic-platform-admin.json'),
    PLATFORM_ADMIN_CONFIRMATION: 'DESIGNATE_STAGING_PLATFORM_ADMIN' };
}
function identity(): User {
  return { id, email, aud: 'authenticated', role: 'authenticated', created_at: created,
    invited_at: created, email_confirmed_at: created, last_sign_in_at: created, is_anonymous: false,
    app_metadata: { is_platform_admin: true }, user_metadata: { role: 'PLATFORM_ADMIN' } };
}
function generalEnvironment(): NodeJS.ProcessEnv {
  const env = environment();
  return { NODE_ENV: 'test', PLATFORM_ADMIN_TARGET_ENV: env.PLATFORM_ADMIN_TARGET_ENV,
    STAGING_EXPECTED_PROJECT_REF: env.STAGING_EXPECTED_PROJECT_REF,
    MIGRATION_DATABASE_URL: env.MIGRATION_DATABASE_URL, DATABASE_SSL_CA: env.DATABASE_SSL_CA };
}
function receipt(config: PlatformAdminConfig): AdminReceipt {
  return { version: 1, projectRef: 'cqeaxlttezunirsmkrxz', operationId: config.PLATFORM_ADMIN_OPERATION_ID,
    authorizationId: config.PLATFORM_ADMIN_AUTHORIZATION_ID, recipientDigest: recipientDigest(config), notBefore: before, stage: 'invited', authUserId: id };
}
function memoryReceipt(initial: AdminReceipt) {
  let current = structuredClone(initial);
  const store: ReceiptStore = { read: vi.fn(async () => structuredClone(current)),
    create: vi.fn(async (value) => { current = structuredClone(value); }),
    replace: vi.fn(async (value) => { current = structuredClone(value); }) };
  return { store, current: () => current };
}

describe('STAGING platform operator configuration', () => {
  it('accepts general preflight without Auth credentials, recipient, correlation IDs or receipt configuration', () => {
    const config = parsePlatformAdminConfig(generalEnvironment(), 'preflight');
    expect(config.STAGING_EXPECTED_PROJECT_REF).toBe('cqeaxlttezunirsmkrxz');
    for (const key of ['PLATFORM_ADMIN_EMAIL', 'PLATFORM_ADMIN_AUTH_USER_ID', 'PLATFORM_ADMIN_OPERATION_ID',
      'PLATFORM_ADMIN_AUTHORIZATION_ID', 'PLATFORM_ADMIN_RECEIPT_PATH', 'SUPABASE_SECRET_KEY', 'APP_URL']) {
      expect(config).not.toHaveProperty(key);
    }
  });
  it.each(['prepare-invite', 'invite', 'designate', 'verify'] as const)('general config cannot authorize %s', (mode) => {
    expect(() => parsePlatformAdminConfig(generalEnvironment(), mode)).toThrow('INVALID_OPERATOR_CONFIGURATION');
  });
  for (const mode of ['prepare-invite', 'invite', 'designate', 'verify'] as const) {
    it.each(['PLATFORM_ADMIN_EMAIL', 'PLATFORM_ADMIN_OPERATION_ID', 'PLATFORM_ADMIN_AUTHORIZATION_ID',
      'PLATFORM_ADMIN_RECEIPT_PATH', 'SUPABASE_SECRET_KEY'])(`${mode} rejects missing %s`, (key) => {
      const env = environment();
      env.PLATFORM_ADMIN_CONFIRMATION = mode === 'invite' ? 'INVITE_STAGING_PLATFORM_ADMIN' : 'DESIGNATE_STAGING_PLATFORM_ADMIN';
      delete env[key];
      expect(() => parsePlatformAdminConfig(env, mode)).toThrow('INVALID_OPERATOR_CONFIGURATION');
    });
  }
  it.each(['invite', 'designate'] as const)('%s still requires its mutation confirmation', (mode) => {
    const env = environment();
    delete env.PLATFORM_ADMIN_CONFIRMATION;
    expect(() => parsePlatformAdminConfig(env, mode)).toThrow(mode === 'invite' ? 'INVITATION_AUTHORIZATION_REQUIRED' : 'DESIGNATION_AUTHORIZATION_REQUIRED');
  });
  it.each(['designate', 'verify'] as const)('%s still requires the exact Auth UUID', (mode) => {
    const env = environment();
    delete env.PLATFORM_ADMIN_AUTH_USER_ID;
    expect(() => parsePlatformAdminConfig(env, mode)).toThrow('EXACT_AUTH_UUID_REQUIRED');
  });
  it.each([
    { PLATFORM_ADMIN_TARGET_ENV: 'production' }, { STAGING_EXPECTED_PROJECT_REF: 'other' },
    { SUPABASE_URL: 'https://vpvbbsdmyhfjkbrbnocx.supabase.co' },
    { MIGRATION_DATABASE_URL: 'postgresql://postgres.vpvbbsdmyhfjkbrbnocx:synthetic@aws-0-eu-central-1.pooler.supabase.com:5432/postgres' },
    { DATABASE_SSL_CA: '' }, { DATABASE_SSL_CA: 'invalid-certificate' }, { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
  ])('general preflight retains target and TLS rejection (case %#)', (changes) => {
    expect(() => parsePlatformAdminConfig({ ...generalEnvironment(), ...changes }, 'preflight')).toThrow();
  });
  it('accepts exact STAGING with verified CA and canonical email', () => {
    expect(parsePlatformAdminConfig({ ...environment(), PLATFORM_ADMIN_EMAIL: ' Platform.Operator@Example.Test ' }, 'designate').PLATFORM_ADMIN_EMAIL).toBe(email);
  });
  it.each([
    { PLATFORM_ADMIN_TARGET_ENV: 'production' }, { STAGING_EXPECTED_PROJECT_REF: 'other' },
    { SUPABASE_URL: 'https://vpvbbsdmyhfjkbrbnocx.supabase.co' },
    { MIGRATION_DATABASE_URL: 'postgresql://postgres.vpvbbsdmyhfjkbrbnocx:synthetic@aws-0-eu-central-1.pooler.supabase.com:5432/postgres' },
    { MIGRATION_DATABASE_URL: 'postgresql://postgres.cqeaxlttezunirsmkrxz:synthetic@aws-0-eu-central-1.pooler.supabase.com.evil.test:5432/postgres' },
    { DATABASE_SSL_CA: 'not-a-certificate' }, { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
    { PLATFORM_ADMIN_CONFIRMATION: '' }, { PLATFORM_ADMIN_AUTH_USER_ID: '' },
    { APP_URL: 'https://other.example.test' }, { NEXT_PUBLIC_SERVICE_ROLE_KEY: secret },
  ])('fails closed without exposing rejected configuration (case %#)', (changes) => {
    let failure: unknown;
    try { parsePlatformAdminConfig({ ...environment(), ...changes }, 'designate'); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(Error);
    expect(JSON.stringify(safeOperatorFailure(failure))).not.toContain(secret);
  });
  it('requires a separate invitation confirmation', () => {
    expect(() => parsePlatformAdminConfig(environment(), 'invite')).toThrow('INVITATION_AUTHORIZATION_REQUIRED');
  });
});

describe('isolated canonical-migration operator transactions', () => {
  let fixture: AuthTestDb;
  let config: PlatformAdminConfig;
  let deps: AdminDependencies;
  let receipts: ReturnType<typeof memoryReceipt>;
  let statements: string[];
  beforeEach(async () => {
    fixture = await createAuthTestDb();
    // Match the existing database security-replay convention: these managed roles
    // do not exist in the generic Auth fixture but are mandatory for this gate.
    await fixture.client.exec('create role anon; create role authenticated; create role service_role');
    // Supabase lifecycle columns absent from the existing minimal test-only Auth table.
    await fixture.client.exec(`alter table auth.users add invited_at timestamptz, add banned_until timestamptz,
      add deleted_at timestamptz, add is_anonymous boolean not null default false,
      add encrypted_password text default 'synthetic-password-state'`);
    config = parsePlatformAdminConfig(environment(), 'designate');
    receipts = memoryReceipt(receipt(config));
    statements = [];
    const db: OperatorDatabase = { transaction: (readOnly, work) => fixture.client.transaction(async (tx) => {
      if (readOnly) await tx.exec('set transaction read only');
      const sql: OperatorSql = { async query(text, values) {
        statements.push(text);
        return tx.query<Record<string, unknown>>(text, values);
      } };
      return work(sql);
    }) };
    deps = { db, receipts: receipts.store, migrations: await platformMigrationContract(),
      auth: { getUserById: vi.fn(async () => identity()), invite: vi.fn(async () => identity()) } };
    await seedIdentity();
  });
  afterEach(async () => { await fixture.client.close(); });
  async function seedIdentity(userId = id, canonical = email) {
    await fixture.client.query(`insert into auth.users(id,email,created_at,invited_at,email_confirmed_at,last_sign_in_at)
      values ($1,$2,$3,$3,$3,$3)`, [userId, canonical, created]);
  }
  async function granted() {
    return (await fixture.client.query<{ n: number }>('select count(*)::int as n from public.users where is_platform_admin')).rows[0].n;
  }
  async function designate() { return runPlatformAdmin('designate', config, deps); }

  it('preflight is read-only and never invokes the provider or receipt writes', async () => {
    expect(await runPlatformAdmin('preflight', config, deps)).toMatchObject({ designated: 0, active: 0 });
    expect(await granted()).toBe(0);
    expect(deps.auth.invite).not.toHaveBeenCalled();
    expect(deps.auth.getUserById).not.toHaveBeenCalled();
    expect(receipts.store.replace).not.toHaveBeenCalled();
    expect(receipts.store.create).not.toHaveBeenCalled();
    expect(receipts.store.read).not.toHaveBeenCalled();
    expect(statements.every((sql) => !/^(insert|update|delete)/i.test(sql))).toBe(true);
  });
  it('general preflight needs only the database and migration contract, and never reads a recipient', async () => {
    expect(await runPlatformAdminPreflight(deps.db, deps.migrations)).toEqual({ event: 'PREFLIGHT_COMPLETE', designated: 0, active: 0 });
    expect(statements.some((sql) => /from auth\.users|school_memberships|encrypted_password/i.test(sql))).toBe(false);
    expect(statements.every((sql) => /^select|^\s*WITH/i.test(sql))).toBe(true);
    expect(await granted()).toBe(0);
    expect((await fixture.client.query('select * from public.audit_events')).rows).toHaveLength(0);
  });
  it('commits exactly one SYSTEM audit and no School/membership, then repeats as an exact no-op', async () => {
    expect((await designate()).event).toBe('DESIGNATION_COMMITTED');
    const first = await fixture.client.query('select * from public.users');
    expect((await designate()).event).toBe('DESIGNATION_VERIFIED_NOOP');
    expect((await runPlatformAdmin('verify', config, deps)).event).toBe('DESIGNATION_VERIFIED_NOOP');
    expect((await fixture.client.query('select * from public.users')).rows).toEqual(first.rows);
    const events = (await fixture.client.query('select * from public.audit_events')).rows;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: ADMIN_ACTION, actor_kind: 'SYSTEM', system_actor: ADMIN_ACTOR,
      scope: 'PLATFORM', school_id: null, actor_user_id: null, resource_type: 'User', resource_id: id,
      metadata: { operationId: config.PLATFORM_ADMIN_OPERATION_ID, authorizationId: config.PLATFORM_ADMIN_AUTHORIZATION_ID } });
    const output = JSON.stringify({ result: await runPlatformAdmin('verify', config, deps), receipt: receipts.current(), events });
    for (const value of [secret, email, 'synthetic-only']) expect(output).not.toContain(value);
    for (const table of ['schools', 'school_memberships', 'teachers', 'parents']) {
      expect((await fixture.client.query<{ n: number }>(`select count(*)::int as n from public.${table}`)).rows[0].n).toBe(0);
    }
    expect(statements).toContain('lock table public.users in share row exclusive mode');
  });
  it('requires confirmation at the core boundary too', async () => {
    await expect(runPlatformAdmin('designate', { ...config, PLATFORM_ADMIN_CONFIRMATION: undefined }, deps)).rejects.toThrow('DESIGNATION_AUTHORIZATION_REQUIRED');
    expect(statements).toHaveLength(0);
  });
  it('binds the recipient to the prepared operation without logging the email', async () => {
    await expect(runPlatformAdmin('designate', { ...config, PLATFORM_ADMIN_EMAIL: 'changed@example.test' }, deps)).rejects.toThrow('RECEIPT_IDENTITY_MISMATCH');
    expect(await granted()).toBe(0);
  });
  it.each(['missing', 'email', 'uuid', 'setup', 'password', 'banned', 'anonymous', 'old'])('rejects Auth ambiguity/state: %s', async (problem) => {
    if (problem === 'missing') await fixture.client.query('delete from auth.users');
    if (problem === 'email') await fixture.client.query("update auth.users set email='other@example.test'");
    if (problem === 'uuid') config.PLATFORM_ADMIN_AUTH_USER_ID = randomUUID();
    if (problem === 'setup') await fixture.client.query('update auth.users set last_sign_in_at=null');
    if (problem === 'password') await fixture.client.query("update auth.users set encrypted_password=''");
    if (problem === 'banned') await fixture.client.query('update auth.users set banned_until=now()');
    if (problem === 'anonymous') await fixture.client.query('update auth.users set is_anonymous=true');
    if (problem === 'old') await fixture.client.query("update auth.users set created_at='2019-01-01'");
    await expect(designate()).rejects.toThrow();
    expect(await granted()).toBe(0);
  });
  it('rejects two Auth rows resolving the requested UUID/email', async () => {
    await seedIdentity(randomUUID(), email);
    await expect(designate()).rejects.toThrow('IDENTITY_RECONCILIATION_REQUIRED');
  });
  it.each(['missing', 'uuid', 'email', 'setup'])('requires matching provider identity independently: %s', async (problem) => {
    deps.auth.getUserById = async () => problem === 'missing' ? null : { ...identity(),
      ...(problem === 'uuid' ? { id: randomUUID() } : {}),
      ...(problem === 'email' ? { email: 'other@example.test' } : {}),
      ...(problem === 'setup' ? { email_confirmed_at: undefined } : {}) };
    await expect(designate()).rejects.toThrow('AUTH_SETUP_OR_IDENTITY_REJECTED');
    expect(await granted()).toBe(0);
  });
  it.each(['teachers', 'parents'])('rejects linked %s profiles independently of memberships', async (table) => {
    await fixture.client.query("insert into public.users(id,email,status) values ($1,$2,'ACTIVE')", [id, email]);
    const school = await seedSchool(fixture.seed);
    await fixture.client.query(`insert into public.${table}(school_id,user_id,first_name,last_name) values ($1,$2,'Synthetic','Profile')`, [school.id, id]);
    await expect(designate()).rejects.toThrow('IDENTITY_RECONCILIATION_REQUIRED');
    expect(await granted()).toBe(0);
  });
  it('never derives authority from provider metadata or silently promotes a School user', async () => {
    await fixture.client.query("insert into public.users(id,email,status) values ($1,$2,'ACTIVE')", [id, email]);
    const school = await seedSchool(fixture.seed);
    await seedMembership(fixture.seed, id, school.id, 'SCHOOL_ADMIN');
    await expect(designate()).rejects.toThrow('IDENTITY_RECONCILIATION_REQUIRED');
    expect(await granted()).toBe(0);
  });
  it.each(['ACTIVE', 'SUSPENDED', 'DISABLED'])('does not adopt existing %s application users', async (status) => {
    await fixture.client.query('insert into public.users(id,email,status) values ($1,$2,$3)', [id, email, status]);
    await expect(designate()).rejects.toThrow('DESIGNATION_STATE_CONFLICT');
    expect(await granted()).toBe(0);
  });
  it('blocks another designated administrator, even if inactive', async () => {
    const other = randomUUID();
    await seedIdentity(other, 'other@example.test');
    await fixture.client.query("insert into public.users(id,email,status,is_platform_admin) values ($1,'other@example.test','DISABLED',true)", [other]);
    await expect(designate()).rejects.toThrow('DESIGNATION_STATE_CONFLICT');
    expect(await granted()).toBe(1);
  });
  it('rolls back the inserted User if mandatory audit persistence fails', async () => {
    const original = deps.db;
    deps.db = { transaction: (readOnly, work) => original.transaction(readOnly, (tx) => work({ query(sql, values) {
      if (sql.startsWith('insert into public.audit_events')) throw new Error('synthetic audit failure');
      return tx.query(sql, values);
    } })) };
    await expect(designate()).rejects.toThrow('synthetic audit failure');
    expect(await granted()).toBe(0);
    expect((await fixture.client.query('select * from public.users')).rows).toHaveLength(0);
    expect(receipts.current().stage).toBe('designation-attempted');
    await expect(designate()).rejects.toThrow('DESIGNATION_RECONCILIATION_REQUIRED');
  });
  it('does not retry an uncertain committed designation and can verify its exact completion', async () => {
    const original = deps.db;
    deps.db = { async transaction(readOnly, work) {
      const result = await original.transaction(readOnly, work);
      if (!readOnly) throw new Error('synthetic lost commit acknowledgement');
      return result;
    } };
    await expect(designate()).rejects.toThrow('synthetic lost commit acknowledgement');
    expect(receipts.current().stage).toBe('designation-attempted');
    expect((await designate()).event).toBe('DESIGNATION_VERIFIED_NOOP');
    expect(await granted()).toBe(1);
    expect((await fixture.client.query('select * from public.audit_events')).rows).toHaveLength(1);
  });
  it('serializes two independent first-admin attempts to one grant/audit', async () => {
    const other = randomUUID();
    await seedIdentity(other, 'second@example.test');
    const config2 = { ...config, PLATFORM_ADMIN_EMAIL: 'second@example.test', PLATFORM_ADMIN_AUTH_USER_ID: other,
      PLATFORM_ADMIN_OPERATION_ID: randomUUID(), PLATFORM_ADMIN_AUTHORIZATION_ID: randomUUID() };
    const secondReceipt = memoryReceipt({ ...receipt(config2), authUserId: other });
    const results = await Promise.allSettled([designate(), runPlatformAdmin('designate', config2,
      { ...deps, receipts: secondReceipt.store, auth: { ...deps.auth,
        getUserById: async () => ({ ...identity(), id: other, email: 'second@example.test' }) } })]);
    expect(results.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
    expect(await granted()).toBe(1);
    expect((await fixture.client.query('select * from public.audit_events')).rows).toHaveLength(1);
  });
  it('rejects migration drift', async () => {
    await fixture.client.query('delete from drizzle.__drizzle_migrations where created_at=(select max(created_at) from drizzle.__drizzle_migrations)');
    await expect(designate()).rejects.toThrow('MIGRATION_READINESS_FAILED');
    expect(await granted()).toBe(0);
  });
  it('rejects application security drift', async () => {
    await fixture.client.exec('alter table public.users disable row level security');
    await expect(designate()).rejects.toThrow('DATABASE_SECURITY_READINESS_FAILED');
    expect(await granted()).toBe(0);
  });
  it('prepares then attempts an invitation once; uncertain provider outcomes cannot resend', async () => {
    await fixture.client.query('delete from auth.users');
    config.PLATFORM_ADMIN_AUTH_USER_ID = undefined;
    config.PLATFORM_ADMIN_CONFIRMATION = 'INVITE_STAGING_PLATFORM_ADMIN';
    await runPlatformAdmin('prepare-invite', config, deps);
    expect(receipts.current().stage).toBe('prepared');
    deps.auth.invite = vi.fn(async () => { throw new Error('synthetic provider uncertainty'); });
    await expect(runPlatformAdmin('invite', config, deps)).rejects.toThrow('synthetic provider uncertainty');
    expect(receipts.current().stage).toBe('invitation-attempted');
    await expect(runPlatformAdmin('invite', config, deps)).rejects.toThrow('INVITATION_RECONCILIATION_REQUIRED');
    expect(deps.auth.invite).toHaveBeenCalledTimes(1);
  });
  it('records only the newly invited UUID, never a pre-existing identity', async () => {
    await fixture.client.query('delete from auth.users');
    config.PLATFORM_ADMIN_AUTH_USER_ID = undefined;
    config.PLATFORM_ADMIN_CONFIRMATION = 'INVITE_STAGING_PLATFORM_ADMIN';
    await runPlatformAdmin('prepare-invite', config, deps);
    deps.auth.invite = vi.fn(async () => ({ ...identity(), created_at: new Date().toISOString() }));
    expect((await runPlatformAdmin('invite', config, deps)).event).toBe('INVITATION_RECORDED');
    expect(receipts.current()).toMatchObject({ stage: 'invited', authUserId: id });
  });
  it('does not send an invitation if durable attempt persistence fails', async () => {
    await fixture.client.query('delete from auth.users');
    config.PLATFORM_ADMIN_AUTH_USER_ID = undefined;
    config.PLATFORM_ADMIN_CONFIRMATION = 'INVITE_STAGING_PLATFORM_ADMIN';
    receipts = memoryReceipt({ ...receipt(config), stage: 'prepared', authUserId: undefined });
    deps.receipts = { ...receipts.store, replace: async () => { throw new Error('synthetic receipt failure'); } };
    await expect(runPlatformAdmin('invite', config, deps)).rejects.toThrow('synthetic receipt failure');
    expect(deps.auth.invite).not.toHaveBeenCalled();
  });
  it('does not invite an existing Auth identity', async () => {
    config.PLATFORM_ADMIN_AUTH_USER_ID = undefined;
    await expect(runPlatformAdmin('prepare-invite', config, deps)).rejects.toThrow('INVITATION_STATE_REJECTED');
    expect(deps.auth.invite).not.toHaveBeenCalled();
  });
});

describe('local receipt custody and transport safety', () => {
  let folder: string;
  beforeEach(async () => { folder = await mkdtemp(path.join(tmpdir(), 'platform-operator-')); });
  afterEach(async () => { vi.unstubAllGlobals(); await rm(folder, { recursive: true, force: true }); });
  it('CLI general preflight bypasses receipt setup and Auth initialization', async () => {
    const connect = vi.spyOn(Pool.prototype, 'connect').mockRejectedValue(new Error('synthetic connection boundary'));
    const transport = vi.fn();
    vi.stubGlobal('fetch', transport);
    try {
      await expect(main(['preflight'], generalEnvironment())).rejects.toThrow('synthetic connection boundary');
      expect(connect).toHaveBeenCalledTimes(1);
      expect(transport).not.toHaveBeenCalled();
    } finally { connect.mockRestore(); }
  });
  it('the installed tsx entrypoint rejects absent mode before configuration or network startup', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/operator/staging-platform-admin.ts'], {
      cwd: process.cwd(), windowsHide: true, timeout: 15_000, encoding: 'utf8',
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, NODE_ENV: 'test',
        TEMP: folder, TMP: folder, HOME: folder, USERPROFILE: folder },
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim()).toBe(JSON.stringify({ event: 'ONE_EXPLICIT_MODE_REQUIRED' }));
  });
  it('stores bounded strict non-sensitive receipts, exclusively creates, replaces and leases', async () => {
    const config = parsePlatformAdminConfig({ ...environment(), PLATFORM_ADMIN_RECEIPT_PATH: path.join(folder, 'receipt.json') }, 'designate');
    const store = await fileReceiptStore(config);
    await store.create(receipt(config));
    await expect(store.create(receipt(config))).rejects.toThrow();
    await store.replace({ ...receipt(config), stage: 'complete' });
    expect((await store.read()).stage).toBe('complete');
    const stored = await readFile(config.PLATFORM_ADMIN_RECEIPT_PATH, 'utf8');
    expect(stored).not.toContain(email);
    expect(stored).not.toContain(secret);
    await withReceiptLease(config.PLATFORM_ADMIN_RECEIPT_PATH, async () => {
      await expect(withReceiptLease(config.PLATFORM_ADMIN_RECEIPT_PATH, async () => undefined)).rejects.toThrow('RECEIPT_LEASE_RECONCILIATION_REQUIRED');
    });
    await writeFile(config.PLATFORM_ADMIN_RECEIPT_PATH, 'x'.repeat(4097));
    await expect(store.read()).rejects.toThrow('RECEIPT_REJECTED');
  });
  it('rejects repository receipt storage', async () => {
    const config = parsePlatformAdminConfig({ ...environment(), PLATFORM_ADMIN_RECEIPT_PATH: path.join(process.cwd(), 'forbidden.json') }, 'designate');
    await expect(fileReceiptStore(config)).rejects.toThrow('EXTERNAL_PRIVATE_RECEIPT_REQUIRED');
  });
  it('does no network work on import/construction and permits only the two fixed Auth operations', async () => {
    const transport = vi.fn(async (_input: string | URL | Request) => new Response(JSON.stringify(identity()), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', transport);
    const auth = operatorAuth(parsePlatformAdminConfig(environment(), 'designate'));
    expect(transport).not.toHaveBeenCalled();
    await auth.getUserById(id);
    await auth.invite(email, 'https://madrasio-staging.vercel.app/auth/confirm');
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls.map(([input]) => String(input))).toEqual([
      `https://cqeaxlttezunirsmkrxz.supabase.co/auth/v1/admin/users/${id}`,
      'https://cqeaxlttezunirsmkrxz.supabase.co/auth/v1/invite?redirect_to=https%3A%2F%2Fmadrasio-staging.vercel.app%2Fauth%2Fconfirm',
    ]);
  });
  it('marks a lost write-commit acknowledgement uncertain and discards its connection', async () => {
    const query = vi.fn(async (sql: string) => { if (sql === 'commit') throw new Error(secret); return { rows: [] }; });
    const release = vi.fn();
    const client = { query, release } as unknown as PoolClient;
    const pool = { connect: async () => client } as unknown as Pool;
    await expect(operatorDatabase(pool).transaction(false, async () => 'done')).rejects.toThrow('DESIGNATION_COMMIT_UNCERTAIN');
    expect(query.mock.calls.filter(([sql]) => sql === 'commit')).toHaveLength(1);
    expect(release).toHaveBeenCalledWith(true);
    expect(safeOperatorFailure(new Error(secret))).toEqual({ event: 'OPERATOR_FAILED_RECONCILE_BEFORE_RETRY' });
  });
});
