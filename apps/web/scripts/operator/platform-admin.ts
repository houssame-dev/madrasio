import type { User } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { normalizeEmail } from '@/lib/auth/email';
import { applicationSecurityAuditSql } from '@school/database/security';
import { EXPECTED_LATEST_MIGRATION, EXPECTED_MIGRATION_COUNT, EXPECTED_TABLE_COUNT, STAGING_PROJECT_REF } from '../deployment/contracts';
import { ADMIN_ACTION, ADMIN_ACTOR, checkReceipt, recipientDigest, refuse, type AdminMode, type AdminReceipt, type PlatformAdminConfig, type ReceiptStore } from './platform-admin-contracts';

export interface OperatorSql { query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> }
export interface OperatorDatabase {
  transaction<T>(readOnly: boolean, work: (tx: OperatorSql) => Promise<T>): Promise<T>;
}
export interface OperatorAuth {
  getUserById(id: string): Promise<User | null>;
  invite(email: string, redirectTo: string): Promise<User>;
}
export type MigrationContract = Array<{ hash: string; created_at: string }>;
export interface AdminDependencies { db: OperatorDatabase; auth: OperatorAuth; receipts: ReceiptStore; migrations: MigrationContract }

export async function platformMigrationContract(): Promise<MigrationContract> {
  const folder = new URL('../../../../database/drizzle/migrations/', import.meta.url);
  const journal = z.object({ entries: z.array(z.object({ idx: z.number(), tag: z.string(), when: z.number() })) })
    .parse(JSON.parse(await readFile(new URL('meta/_journal.json', folder), 'utf8')));
  if (journal.entries.length !== EXPECTED_MIGRATION_COUNT || journal.entries.at(-1)?.tag !== EXPECTED_LATEST_MIGRATION ||
      journal.entries.some((entry, i) => entry.idx !== i || !/^\d{4}_[a-z0-9_-]+$/.test(entry.tag))) refuse('LOCAL_MIGRATION_CONTRACT_REJECTED');
  return Promise.all(journal.entries.map(async (entry) => ({
    created_at: String(entry.when),
    hash: createHash('sha256').update(await readFile(fileURLToPath(new URL(`${entry.tag}.sql`, folder)), 'utf8')).digest('hex'),
  })));
}

async function readiness(tx: OperatorSql, expected: MigrationContract) {
  if (expected.length !== EXPECTED_MIGRATION_COUNT) refuse('LOCAL_MIGRATION_CONTRACT_REJECTED');
  const metadata = (await tx.query(`select current_database() as database,
    to_regclass('auth.users')::text as auth_users, to_regclass('public.audit_events')::text as audit,
    (select count(*)::int from information_schema.tables where table_schema='public' and table_type='BASE TABLE') as tables,
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='users'
      and column_name='is_platform_admin' and data_type='boolean' and is_nullable='NO' and column_default='false') as authority`)).rows[0];
  if (!metadata || metadata.database !== 'postgres' || metadata.auth_users !== 'auth.users' ||
      metadata.audit !== 'audit_events' || metadata.tables !== EXPECTED_TABLE_COUNT || metadata.authority !== true) refuse('SCHEMA_READINESS_FAILED');
  const ledger = (await tx.query('select hash,created_at::text from drizzle.__drizzle_migrations order by created_at')).rows;
  if (ledger.length !== expected.length || ledger.some((row, i) => row.hash !== expected[i].hash || row.created_at !== expected[i].created_at)) {
    refuse('MIGRATION_READINESS_FAILED');
  }
  if ((await tx.query(applicationSecurityAuditSql)).rows.length) refuse('DATABASE_SECURITY_READINESS_FAILED');
}

async function counts(tx: OperatorSql) {
  return (await tx.query(`select count(*)::int as designated,
    count(*) filter(where status='ACTIVE')::int as active from public.users where is_platform_admin`)).rows[0];
}
async function candidate(tx: OperatorSql, config: PlatformAdminConfig, lock = false) {
  const id = config.PLATFORM_ADMIN_AUTH_USER_ID ?? null;
  const auth = (await tx.query(`select id::text,email,created_at::text,invited_at::text,email_confirmed_at::text,
    last_sign_in_at::text,banned_until::text,deleted_at::text,is_anonymous,
    coalesce(encrypted_password,'')<>'' as password_set from auth.users
    where id=$1 or lower(btrim(email))=$2${lock ? ' for share' : ''}`, [id, config.PLATFORM_ADMIN_EMAIL])).rows;
  const users = (await tx.query('select id::text,email,status,is_platform_admin from public.users where id=$1 or email=$2', [id, config.PLATFORM_ADMIN_EMAIL])).rows;
  const linked = (await tx.query(`select exists(select 1 from public.school_memberships where user_id=$1) or
    exists(select 1 from public.teachers where user_id=$1) or exists(select 1 from public.parents where user_id=$1) as linked`, [id ?? auth[0]?.id ?? users[0]?.id ?? null])).rows[0]?.linked;
  if (auth.length > 1 || users.length > 1 || linked !== false) refuse('IDENTITY_RECONCILIATION_REQUIRED');
  return { auth: auth[0], user: users[0] };
}
function verifyAuthRow(row: Record<string, unknown> | undefined, config: PlatformAdminConfig, receipt: AdminReceipt) {
  if (!row || row.id !== receipt.authUserId || row.id !== config.PLATFORM_ADMIN_AUTH_USER_ID ||
      row.email !== config.PLATFORM_ADMIN_EMAIL || typeof row.created_at !== 'string' ||
      !Number.isFinite(Date.parse(row.created_at)) || Date.parse(row.created_at) < Date.parse(receipt.notBefore) ||
      !row.invited_at || !row.email_confirmed_at || !row.last_sign_in_at || row.password_set !== true ||
      row.deleted_at || row.banned_until || row.is_anonymous !== false) {
    refuse('AUTH_SETUP_OR_IDENTITY_REJECTED');
  }
}
async function providerIdentity(deps: AdminDependencies, config: PlatformAdminConfig, receipt: AdminReceipt) {
  const user = await deps.auth.getUserById(config.PLATFORM_ADMIN_AUTH_USER_ID!);
  if (!user || user.id !== receipt.authUserId || !user.email || normalizeEmail(user.email) !== config.PLATFORM_ADMIN_EMAIL ||
      !user.invited_at || !user.email_confirmed_at || !user.last_sign_in_at || user.banned_until || user.deleted_at || user.is_anonymous === true) {
    refuse('AUTH_SETUP_OR_IDENTITY_REJECTED');
  }
}
async function completed(tx: OperatorSql, config: PlatformAdminConfig, receipt: AdminReceipt, user: Record<string, unknown> | undefined) {
  const total = await counts(tx);
  if (total?.designated !== 1 || total.active !== 1 || !user || user.id !== receipt.authUserId ||
      user.email !== config.PLATFORM_ADMIN_EMAIL || user.status !== 'ACTIVE' || user.is_platform_admin !== true) return false;
  const events = (await tx.query(`select metadata from public.audit_events where action=$1 and scope='PLATFORM'
    and school_id is null and actor_kind='SYSTEM' and actor_user_id is null and system_actor=$2
    and resource_type='User' and resource_id=$3`, [ADMIN_ACTION, ADMIN_ACTOR, receipt.authUserId])).rows;
  return events.length === 1 &&
    z.object({ operationId: z.literal(config.PLATFORM_ADMIN_OPERATION_ID), authorizationId: z.literal(config.PLATFORM_ADMIN_AUTHORIZATION_ID) })
      .strict().safeParse(events[0].metadata).success;
}

/** Injected I/O, no listeners, credentials or provider activity on import. Never retries writes. */
export async function runPlatformAdminPreflight(db: OperatorDatabase, migrations: MigrationContract) {
  return db.transaction(true, async (tx) => {
    await readiness(tx, migrations);
    const total = await counts(tx);
    return { event: 'PREFLIGHT_COMPLETE', designated: Number(total?.designated), active: Number(total?.active) };
  });
}

export async function runPlatformAdmin(mode: AdminMode, config: PlatformAdminConfig, deps: AdminDependencies) {
  if (mode === 'preflight') return runPlatformAdminPreflight(deps.db, deps.migrations);
  if (mode === 'invite' && config.PLATFORM_ADMIN_CONFIRMATION !== 'INVITE_STAGING_PLATFORM_ADMIN') refuse('INVITATION_AUTHORIZATION_REQUIRED');
  if (mode === 'designate' && config.PLATFORM_ADMIN_CONFIRMATION !== 'DESIGNATE_STAGING_PLATFORM_ADMIN') refuse('DESIGNATION_AUTHORIZATION_REQUIRED');
  if (mode === 'prepare-invite') {
    const state = await deps.db.transaction(true, async (tx) => {
      await readiness(tx, deps.migrations);
      const total = await counts(tx);
      const target = await candidate(tx, config);
      if (total?.designated !== 0 || target.auth || target.user) refuse('INVITATION_STATE_REJECTED');
      const clock = (await tx.query("select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as now")).rows[0]?.now;
      if (typeof clock !== 'string') refuse('SCHEMA_READINESS_FAILED');
      return { designated: Number(total?.designated), active: Number(total?.active), candidatePresent: !!target.auth, notBefore: clock };
    });
    await deps.receipts.create({ version: 1, projectRef: STAGING_PROJECT_REF,
      operationId: config.PLATFORM_ADMIN_OPERATION_ID, authorizationId: config.PLATFORM_ADMIN_AUTHORIZATION_ID,
      recipientDigest: recipientDigest(config),
      notBefore: state.notBefore, stage: 'prepared' });
    return { event: 'INVITATION_PREPARED', designated: state.designated, active: state.active, candidatePresent: state.candidatePresent };
  }
  const receipt = await deps.receipts.read();
  checkReceipt(config, receipt);
  if (mode === 'invite') {
    if (receipt.stage !== 'prepared' || receipt.authUserId) refuse('INVITATION_RECONCILIATION_REQUIRED');
    await deps.db.transaction(true, async (tx) => {
      await readiness(tx, deps.migrations);
      const target = await candidate(tx, config);
      if ((await counts(tx))?.designated !== 0 || target.auth || target.user) refuse('INVITATION_STATE_REJECTED');
    });
    await deps.receipts.replace({ ...receipt, stage: 'invitation-attempted' });
    // Any provider error or lost receipt leaves an attempted state, requiring reconciliation.
    const invited = await deps.auth.invite(config.PLATFORM_ADMIN_EMAIL, `${config.APP_URL}/auth/confirm`);
    if (!z.string().uuid().safeParse(invited.id).success || !invited.email || normalizeEmail(invited.email) !== config.PLATFORM_ADMIN_EMAIL ||
        !invited.invited_at || !Number.isFinite(Date.parse(invited.created_at)) || Date.parse(invited.created_at) < Date.parse(receipt.notBefore)) {
      refuse('INVITATION_RECONCILIATION_REQUIRED');
    }
    await deps.receipts.replace({ ...receipt, stage: 'invited', authUserId: invited.id });
    return { event: 'INVITATION_RECORDED', operationId: receipt.operationId, authUserId: invited.id };
  }
  if (!receipt.authUserId || !['invited', 'designation-attempted', 'complete'].includes(receipt.stage)) refuse('INVITATION_RECONCILIATION_REQUIRED');
  await providerIdentity(deps, config, receipt);
  const exactComplete = await deps.db.transaction(true, async (tx) => {
    await readiness(tx, deps.migrations);
    const state = await candidate(tx, config);
    verifyAuthRow(state.auth, config, receipt);
    return completed(tx, config, receipt, state.user);
  });
  if (exactComplete) return { event: 'DESIGNATION_VERIFIED_NOOP', operationId: receipt.operationId, authUserId: receipt.authUserId };
  if (mode === 'verify' || receipt.stage !== 'invited') refuse('DESIGNATION_RECONCILIATION_REQUIRED');
  await deps.receipts.replace({ ...receipt, stage: 'designation-attempted' });
  await deps.db.transaction(false, async (tx) => {
    // Self-conflicting transaction-level lock also excludes other writers to users.
    // No network request is performed while this short STAGING-only lock is held.
    await tx.query('lock table public.users in share row exclusive mode');
    await readiness(tx, deps.migrations);
    const state = await candidate(tx, config, true);
    verifyAuthRow(state.auth, config, receipt);
    if ((await counts(tx))?.designated !== 0 || state.user) refuse('DESIGNATION_STATE_CONFLICT');
    await tx.query("insert into public.users(id,email,status,is_platform_admin) values ($1,$2,'ACTIVE',true)", [receipt.authUserId, config.PLATFORM_ADMIN_EMAIL]);
    await tx.query(`insert into public.audit_events(action,scope,school_id,actor_kind,actor_user_id,system_actor,resource_type,resource_id,metadata)
      values ($1,'PLATFORM',null,'SYSTEM',null,$2,'User',$3,$4::jsonb)`,
    [ADMIN_ACTION, ADMIN_ACTOR, receipt.authUserId, JSON.stringify({ operationId: receipt.operationId, authorizationId: receipt.authorizationId })]);
  });
  await deps.receipts.replace({ ...receipt, stage: 'complete' });
  return { event: 'DESIGNATION_COMMITTED', operationId: receipt.operationId, authUserId: receipt.authUserId };
}
