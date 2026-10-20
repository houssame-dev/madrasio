import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import { postgresConnectionConfig } from '@school/database/connection';
import { z } from 'zod';
import { lstat, open, readFile, realpath, rename } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ACCOUNT_KEYS, DATASET, descartesManifest, emailFor } from './descartes-plan';
import { applyDescartes, DescartesError, reject, type DescartesAuth, type SeedReceipt } from './descartes-seed';
import { parsePlatformAdminConfig } from './platform-admin-contracts';
import { operatorDatabase, withReceiptLease } from './staging-platform-admin';
import { platformMigrationContract, runPlatformAdminPreflight } from './platform-admin';
import { STAGING_PROJECT_REF } from '../deployment/contracts';

export function parseDescartesConfig(env: NodeJS.ProcessEnv) {
  const connection = parsePlatformAdminConfig({ ...env, PLATFORM_ADMIN_TARGET_ENV: env.DESCARTES_TARGET_ENV }, 'preflight');
  const parsed = z.object({
    SUPABASE_URL: z.literal(`https://${STAGING_PROJECT_REF}.supabase.co`), SUPABASE_SECRET_KEY: z.string().min(1),
    DESCARTES_CONFIRMATION: z.literal('CREATE_DESCARTES_STAGING_ONLY'),
    DESCARTES_SILENT_AUTH_CONFIRMED: z.literal('ADMIN_CREATE_CONFIRMED_NO_EMAIL_HOOKS'),
    DESCARTES_PRIVATE_CUSTODY_CONFIRMED: z.literal('PRIVATE_EXTERNAL_DIRECTORY_VERIFIED'),
    DESCARTES_RECEIPT_PATH: z.string().refine(path.isAbsolute),
    DESCARTES_PASSWORDS_JSON: z.string(),
  }).safeParse(env);
  if (!parsed.success || env.NODE_OPTIONS || env.NODE_EXTRA_CA_CERTS || Object.entries(env).some(([key, value]) => /^(?:https?|all)_proxy$/i.test(key) && value)) reject('INVALID_OR_UNSAFE_DESCARTES_CONFIGURATION');
  let passwords: Record<string, string>;
  try {
    passwords = z.record(z.string().min(16).max(128)).parse(JSON.parse(parsed.data.DESCARTES_PASSWORDS_JSON));
    if (Object.keys(passwords).length !== 12 || ACCOUNT_KEYS.some(key => !passwords[key]) || new Set(Object.values(passwords)).size !== 12) reject('TWELVE_DISTINCT_PASSWORDS_REQUIRED');
  } catch { return reject('TWELVE_DISTINCT_PASSWORDS_REQUIRED'); }
  return { ...connection, ...parsed.data, passwords };
}

export function descartesAuth(config: ReturnType<typeof parseDescartesConfig>): DescartesAuth {
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const method = init?.method?.toUpperCase() ?? 'GET';
      const create = method === 'POST' && url.pathname === '/auth/v1/admin/users';
      const read = method === 'GET' && /^\/auth\/v1\/admin\/users\/[0-9a-f-]{36}$/.test(url.pathname);
      if (url.origin !== config.SUPABASE_URL || (!create && !read) || url.search || url.hash) reject('AUTH_DESTINATION_REJECTED');
      return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(10_000) });
    } },
  });
  const project = (user: import('@supabase/supabase-js').User) => ({
    id: user.id, email: user.email ?? '', dataset: String(user.user_metadata?.fictional_dataset ?? ''),
    account: String(user.user_metadata?.fictional_account ?? ''), locale: String(user.user_metadata?.preferred_locale ?? ''),
    eligible: !!user.email_confirmed_at && !user.is_anonymous && !user.deleted_at && !user.banned_until,
  });
  return {
    async inspect(tx) {
      const found = [];
      // Bounded operator-only collision check, like the first-admin procedure.
      // No Auth directory scan, client-provided UUID or reuse of a foreign identity.
      const rows = (await tx.query('select id::text from auth.users where lower(btrim(email))=any($1::text[])', [ACCOUNT_KEYS.map(emailFor)])).rows;
      if (rows.length > 12) reject('AUTH_IDENTITY_CONFLICT');
      for (const row of rows) {
        if (typeof row.id !== 'string' || !z.string().uuid().safeParse(row.id).success) reject('AUTH_IDENTITY_CONFLICT');
        const result = await client.auth.admin.getUserById(row.id);
        if (result.error) reject('AUTH_INSPECTION_FAILED');
        found.push(project(result.data.user));
      }
      return found;
    },
    async create(key, password) {
      if (!ACCOUNT_KEYS.includes(key)) reject('INVALID_ACCOUNT_KEY');
      // Supported Admin creation, never signup/invite/generateLink or SQL Auth inserts.
      const result = await client.auth.admin.createUser({ email: emailFor(key), password, email_confirm: true,
        user_metadata: { fictional_dataset: DATASET, fictional_account: key, preferred_locale: 'fr' } });
      if (result.error || !result.data.user) reject('AUTH_CREATE_OUTCOME_REQUIRES_RECONCILIATION');
      return project(result.data.user);
    },
  };
}

export async function descartesReceipt(filename: string): Promise<SeedReceipt> {
  const repository = await realpath(fileURLToPath(new URL('../../../../', import.meta.url)));
  const parent = await realpath(path.dirname(filename));
  const relative = path.relative(repository, parent);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) || parent !== path.resolve(path.dirname(filename))) reject('EXTERNAL_PRIVATE_RECEIPT_REQUIRED');
  const directory = await lstat(parent);
  if (!directory.isDirectory() || directory.isSymbolicLink() || (process.platform !== 'win32' && (directory.mode & 0o077))) reject('PRIVATE_RECEIPT_DIRECTORY_REQUIRED');
  const events: { phase: string; account?: string; authId?: string; at: string }[] = [];
  const write = async (target: string) => {
    const handle = await open(target, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify({ dataset: DATASET, project: STAGING_PROJECT_REF, events })); await handle.sync(); }
    finally { await handle.close(); }
  };
  return {
    async start() { await write(filename); },
    async record(event) {
      const stat = await lstat(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384 || JSON.parse(await readFile(filename, 'utf8')).dataset !== DATASET) reject('RECEIPT_REJECTED');
      events.push({ ...event, at: new Date().toISOString() });
      const temporary = `${filename}.${randomUUID()}.tmp`;
      await write(temporary); await rename(temporary, filename);
    },
  };
}

/** No I/O or secret loading on import. Dry-run is entirely offline and needs no credentials. */
export async function main(args: string[], env: NodeJS.ProcessEnv) {
  if (args.length !== 1 || !['dry-run', 'apply'].includes(args[0])) reject('EXPLICIT_DRY_RUN_OR_APPLY_REQUIRED');
  if (args[0] === 'dry-run') { console.info(JSON.stringify(descartesManifest(), null, 2)); return; }
  const config = parseDescartesConfig(env);
  const receipts = await descartesReceipt(config.DESCARTES_RECEIPT_PATH);
  const migrations = await platformMigrationContract();
  const pool = new Pool({ ...postgresConnectionConfig(config.MIGRATION_DATABASE_URL, config.DATABASE_SSL_CA), max: 1,
    connectionTimeoutMillis: 5000, query_timeout: 10000, idleTimeoutMillis: 1000, application_name: 'madrasio-descartes-staging-only' });
  pool.on('error', () => { process.exitCode = 1; });
  try {
    await runPlatformAdminPreflight(operatorDatabase(pool), migrations);
    const result = await withReceiptLease(config.DESCARTES_RECEIPT_PATH, () => applyDescartes({ db: operatorDatabase(pool), auth: descartesAuth(config), receipt: receipts, passwords: config.passwords }));
    if (result.status === 'created') await receipts.record({ phase: 'database-commit-confirmed' });
    console.info(JSON.stringify(result));
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2), process.env).catch((error: unknown) => {
    console.error(JSON.stringify({ event: error instanceof DescartesError ? error.code : 'DESCARTES_OPERATOR_FAILED_RECONCILE_BEFORE_RETRY' }));
    process.exitCode = 1;
  });
}
