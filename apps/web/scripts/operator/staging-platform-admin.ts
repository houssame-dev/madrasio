import { createClient } from '@supabase/supabase-js';
import { postgresConnectionConfig } from '@school/database/connection';
import { Pool } from 'pg';
import { lstat, open, readFile, realpath, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { checkReceipt, modeSchema, parsePlatformAdminConfig, PlatformOperatorError, receiptSchema, refuse,
  type PlatformAdminConfig, type ReceiptStore, type AdminReceipt } from './platform-admin-contracts';
import { platformMigrationContract, runPlatformAdmin, runPlatformAdminPreflight, type OperatorDatabase, type OperatorAuth } from './platform-admin';

/** Private external operator custody. Existing receipts are never silently adopted or removed. */
export async function fileReceiptStore(config: PlatformAdminConfig): Promise<ReceiptStore> {
  const filename = path.resolve(config.PLATFORM_ADMIN_RECEIPT_PATH);
  const repository = await realpath(fileURLToPath(new URL('../../../../', import.meta.url)));
  const parent = await realpath(path.dirname(filename));
  const relative = path.relative(repository, parent);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) ||
      parent !== path.resolve(path.dirname(filename))) refuse('EXTERNAL_PRIVATE_RECEIPT_REQUIRED');
  const read = async () => {
    const stat = await lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) refuse('RECEIPT_REJECTED');
    const result = receiptSchema.safeParse(JSON.parse(await readFile(filename, 'utf8')));
    if (!result.success) refuse('RECEIPT_REJECTED');
    checkReceipt(config, result.data);
    return result.data;
  };
  const write = async (target: string, receipt: AdminReceipt) => {
    const handle = await open(target, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(receiptSchema.parse(receipt))); await handle.sync(); }
    finally { await handle.close(); }
  };
  return {
    read,
    create: (receipt) => write(filename, receipt),
    async replace(receipt) {
      await read();
      const temporary = `${filename}.${randomUUID()}.tmp`;
      await write(temporary, receipt);
      // A failed replacement leaves the previous state and temporary evidence intact.
      await rename(temporary, filename);
    },
  };
}

/** Exclusive local lease prevents duplicate provider sends from concurrent runners.
 * A crash leaves the lease in place: manual reconciliation, never automatic stale-lock removal.
 */
export async function withReceiptLease<T>(filename: string, work: () => Promise<T>): Promise<T> {
  const lease = `${filename}.lock`;
  let handle;
  try { handle = await open(lease, 'wx', 0o600); }
  catch { refuse('RECEIPT_LEASE_RECONCILIATION_REQUIRED'); }
  try { return await work(); }
  finally { await handle.close(); await unlink(lease); }
}

export function operatorDatabase(pool: Pool): OperatorDatabase {
  return {
    async transaction(readOnly, work) {
      const client = await pool.connect();
      let committing = false;
      let failed = false;
      try {
        await client.query(readOnly ? 'begin read only' : 'begin');
        await client.query("set local lock_timeout='3s'");
        await client.query("set local statement_timeout='5s'");
        const result = await work({ query: (sql, values) => client.query(sql, values) });
        committing = true;
        await client.query('commit');
        return result;
      } catch (error) {
        failed = true;
        if (committing && !readOnly) refuse('DESIGNATION_COMMIT_UNCERTAIN');
        try { await client.query('rollback'); } catch { /* Discard connection; never retry. */ }
        throw error;
      } finally { client.release(failed); }
    },
  };
}

export function operatorAuth(config: PlatformAdminConfig): OperatorAuth {
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        if (url.origin !== config.SUPABASE_URL || !/^\/auth\/v1\/(invite|admin\/users\/[0-9a-f-]{36})$/.test(url.pathname)) {
          refuse('AUTH_DESTINATION_REJECTED');
        }
        return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(10_000) });
      },
    },
  });
  return {
    async getUserById(id) {
      const result = await client.auth.admin.getUserById(id);
      if (result.error?.status === 404) return null;
      if (result.error) refuse('AUTH_INSPECTION_FAILED');
      return result.data.user;
    },
    async invite(email, redirectTo) {
      const result = await client.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (result.error || !result.data.user) refuse('INVITATION_OUTCOME_REQUIRES_RECONCILIATION');
      return result.data.user;
    },
  };
}

export function safeOperatorFailure(error: unknown) {
  return { event: error instanceof PlatformOperatorError ? error.code : 'OPERATOR_FAILED_RECONCILE_BEFORE_RETRY' };
}

/** Explicit invocation only; importing this module never opens a connection or reads credentials. */
export async function main(args: string[], env: NodeJS.ProcessEnv) {
  if (args.length !== 1) refuse('ONE_EXPLICIT_MODE_REQUIRED');
  const parsed = modeSchema.safeParse(args[0]);
  if (!parsed.success) refuse('INVALID_OPERATOR_MODE');
  const mode = parsed.data;
  const connection = parsePlatformAdminConfig(env, 'preflight');
  const config = mode === 'preflight' ? undefined : parsePlatformAdminConfig(env, mode);
  const receipts = config ? await fileReceiptStore(config) : undefined;
  const migrations = await platformMigrationContract();
  const pool = new Pool({ ...postgresConnectionConfig(connection.MIGRATION_DATABASE_URL, connection.DATABASE_SSL_CA),
    max: 1, connectionTimeoutMillis: 5000, query_timeout: 10_000, idleTimeoutMillis: 1000,
    application_name: 'madrasio-staging-platform-admin' });
  // Pool background failures must not dump connection details via an unhandled error event.
  pool.on('error', () => { process.exitCode = 1; });
  try {
    if (mode === 'preflight') {
      console.info(JSON.stringify(await runPlatformAdminPreflight(operatorDatabase(pool), migrations)));
      return;
    }
    if (!config || !receipts) refuse('INVALID_OPERATOR_CONFIGURATION');
    const run = () => runPlatformAdmin(mode, config, { db: operatorDatabase(pool), auth: operatorAuth(config), receipts, migrations });
    const result = mode === 'invite' || mode === 'designate'
      ? await withReceiptLease(config.PLATFORM_ADMIN_RECEIPT_PATH, run) : await run();
    console.info(JSON.stringify(result));
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2), process.env).catch((error: unknown) => {
    console.error(JSON.stringify(safeOperatorFailure(error)));
    process.exitCode = 1;
  });
}
