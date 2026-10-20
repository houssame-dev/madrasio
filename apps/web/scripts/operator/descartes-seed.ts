import { isDeepStrictEqual } from 'node:util';
import { APPLICATION_TABLES } from '../recovery/contracts';
import type { OperatorDatabase, OperatorSql } from './platform-admin';
import { ACCOUNT_KEYS, DATASET, SCHOOL_ID, buildDescartesPlan, emailFor, type SeedBatch } from './descartes-plan';

export class DescartesError extends Error {
  constructor(public readonly code: string) { super(code); }
}
export function reject(code: string): never { throw new DescartesError(code); }
export interface SeedIdentity { id: string; email: string; dataset: string; account: string; locale: string; eligible: boolean }
export interface DescartesAuth {
  inspect(tx: OperatorSql): Promise<SeedIdentity[]>;
  create(key: string, password: string): Promise<SeedIdentity>;
}
export interface SeedReceipt {
  start(): Promise<void>;
  record(event: { phase: string; account?: string; authId?: string }): Promise<void>;
}
export const quote = (identifier: string) => {
  if (!/^[a-z_][a-z_0-9]*$/.test(identifier)) reject('INVALID_INTERNAL_IDENTIFIER');
  return `"${identifier}"`;
};
function identityMap(identities: SeedIdentity[]) {
  if (identities.length !== 12) reject('PARTIAL_AUTH_RECONCILIATION_REQUIRED');
  const result: Record<string, string> = {};
  for (const key of ACCOUNT_KEYS) {
    const matches = identities.filter(u => u.email === emailFor(key));
    if (matches.length !== 1) reject('AUTH_IDENTITY_CONFLICT');
    const user = matches[0];
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(user.id) || !user.eligible || user.dataset !== DATASET || user.account !== key || user.locale !== 'fr') reject('AUTH_IDENTITY_CONFLICT');
    result[key] = user.id;
  }
  if (new Set(Object.values(result)).size !== 12) reject('AUTH_IDENTITY_CONFLICT');
  return result;
}
function sortedRows(rows: Record<string, unknown>[]) {
  return [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/** Inspect the entire owned tenant, not just counts or a completion marker. No adoption. */
export async function inspectDescartes(tx: OperatorSql, batches: SeedBatch[]): Promise<'empty' | 'complete'> {
  let found = 0, complete = true;
  let mismatch = '';
  for (const batch of batches) {
    const columns = Object.keys(batch.rows[0]);
    const ids = batch.rows.map(row => row.id);
    const condition = batch.table === 'users' ? 'id=any($1::uuid[]) or lower(btrim(email))=any($2::text[])'
      : batch.table === 'schools' ? 'id=$1 or name=$2' : 'school_id=$1 or id=any($2::uuid[])';
    const values = batch.table === 'users' ? [ids, ACCOUNT_KEYS.map(emailFor)] : batch.table === 'schools' ? [SCHOOL_ID, 'Descartes School'] : [SCHOOL_ID, ids];
    const dateColumns = new Set(['start_date', 'end_date', 'date_of_birth', 'effective_from', 'effective_until']);
    const projection = columns.map(column => dateColumns.has(column) ? `${quote(column)}::text as ${quote(column)}` : quote(column));
    const rows = (await tx.query(`select ${projection.join(',')} from public.${quote(batch.table)} where ${condition}`, values)).rows;
    found += rows.length;
    if (!isDeepStrictEqual(sortedRows(rows), sortedRows(batch.rows))) { complete = false; mismatch ||= batch.table; }
  }
  const userIds = batches[0].rows.map(row => row.id);
  if ((await tx.query('select id from public.school_memberships where user_id=any($1::uuid[]) and school_id<>$2', [userIds, SCHOOL_ID])).rows.length) reject('CROSS_SCHOOL_IDENTITY_CONFLICT');
  const allowed = new Set(batches.map(batch => batch.table));
  for (const table of APPLICATION_TABLES) {
    if (allowed.has(table)) continue;
    const tenant = table === 'outbox_events' ? "payload->>'schoolId'=$1::text" : 'school_id=$1';
    if ((await tx.query(`select id from public.${quote(table)} where ${tenant} limit 1`, [SCHOOL_ID])).rows.length) reject('UNEXPECTED_TENANT_DATA_RECONCILIATION_REQUIRED');
  }
  if (!found) return 'empty';
  if (complete) return 'complete';
  return reject(`PARTIAL_OR_CHANGED_DATASET_RECONCILIATION_REQUIRED:${mismatch}`);
}

/** Insert only generated, reviewed columns. JSON is explicitly serialized; values are always parameters. */
export async function insertDescartes(tx: OperatorSql, batches: SeedBatch[]) {
  for (const batch of batches) {
    const columns = Object.keys(batch.rows[0]);
    // Bounded batches avoid PostgreSQL parameter limits and excessive statement sizes.
    for (let offset = 0; offset < batch.rows.length; offset += 100) {
      const values: unknown[] = [];
      const tuples = batch.rows.slice(offset, offset + 100).map(row => `(${columns.map(column => {
        const value = row[column];
        values.push(value !== null && typeof value === 'object' ? JSON.stringify(value) : value);
        return `$${values.length}`;
      }).join(',')})`);
      await tx.query(`insert into public.${quote(batch.table)} (${columns.map(quote).join(',')}) values ${tuples.join(',')}`, values);
    }
  }
}

/** Future apply only. The CLI requires independent explicit approval before reaching this function.
 * Auth and SQL do not share a transaction: retain a durable attempt record and fail closed on ambiguity.
 * Never retry, delete an identity, repair a tenant or infer ownership after a failure.
 */
export async function applyDescartes(deps: { db: OperatorDatabase; auth: DescartesAuth; receipt: SeedReceipt; passwords: Record<string, string> }) {
  return deps.db.transaction(false, async tx => {
    await tx.query('select pg_advisory_xact_lock(hashtext($1))', [DATASET]);
    const existing = await deps.auth.inspect(tx);
    const before = buildDescartesPlan(existing.length ? identityMap(existing) : undefined);
    const state = await inspectDescartes(tx, before);
    if (state === 'complete' && existing.length === 12) return { status: 'already-complete', schoolId: SCHOOL_ID };
    if (state !== 'empty' || existing.length) reject('IDENTITY_RECONCILIATION_REQUIRED');
    if (ACCOUNT_KEYS.some(key => typeof deps.passwords[key] !== 'string' || deps.passwords[key].length < 16)) reject('TWELVE_OPERATOR_PASSWORDS_REQUIRED');
    await deps.receipt.start();
    const created: SeedIdentity[] = [];
    for (const key of ACCOUNT_KEYS) {
      // Persist BEFORE sending: a timeout cannot authorize a second attempt.
      await deps.receipt.record({ phase: 'auth-attempt', account: key });
      const user = await deps.auth.create(key, deps.passwords[key]);
      if (user.email !== emailFor(key) || user.dataset !== DATASET || user.account !== key || user.locale !== 'fr' || !user.eligible || created.some(previous => previous.id === user.id)) reject('AUTH_IDENTITY_CONFLICT');
      created.push(user);
      await deps.receipt.record({ phase: 'auth-created', account: key, authId: user.id });
    }
    const plan = buildDescartesPlan(identityMap(created));
    // Recheck after provider calls: another tool/operator may have touched a logical identity.
    if (await inspectDescartes(tx, plan) !== 'empty') reject('DATASET_CHANGED_BEFORE_INSERT');
    await insertDescartes(tx, plan);
    if (await inspectDescartes(tx, plan) !== 'complete') reject('POST_INSERT_VERIFICATION_FAILED');
    await deps.receipt.record({ phase: 'database-commit-pending' });
    return { status: 'created', schoolId: SCHOOL_ID };
  });
}
