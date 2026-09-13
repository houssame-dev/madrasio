import { createHash } from 'node:crypto';

import type { QueryClient } from './snapshot';
import {
  APPLICATION_TABLES,
  AUTH_RECOVERY_CLASS,
  AUTH_TABLES,
  RecoveryError,
  UNSUPPORTED_DURABLE_AUTH_TABLES,
  classifyAuthTable,
  isPostgresConnectionLoss,
  isPostgresTimeout,
  postgresDiagnostic,
} from './contracts';

export type QualifiedTable = `auth.${string}` | `public.${string}`;
export type ForeignKey = {
  source: QualifiedTable;
  target: QualifiedTable;
  sourceColumns: string[];
  targetColumns: string[];
};
export type TableFingerprint = {
  table: QualifiedTable;
  rowCount: number;
  primaryKeySha256: string;
  contentSha256: string;
  primaryKeyColumns: string[];
};
export type AuthColumnContract = {
  table: 'users' | 'identities';
  ordinal: number;
  column: string;
  dataType: string;
  udtName: string;
  nullable: boolean;
};

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const PAGE_SIZE = 1_000;

async function inventoryQuery<T>(
  phase: 'application_inventory' | 'auth_inventory' | 'fingerprint',
  client: QueryClient,
  sql: string,
  values: unknown[] = [],
) {
  try {
    return await client.query<T & import('pg').QueryResultRow>(sql, values);
  } catch (error) {
    if (error instanceof RecoveryError) throw error;
    throw new RecoveryError(
      isPostgresTimeout(error)
        ? 'BACKUP_OPERATION_TIMEOUT'
        : isPostgresConnectionLoss(error)
        ? 'BACKUP_SNAPSHOT_COORDINATOR_LOST'
        : phase === 'application_inventory'
          ? 'BACKUP_APPLICATION_INVENTORY_FAILED'
          : phase === 'auth_inventory'
            ? 'BACKUP_AUTH_INVENTORY_FAILED'
            : 'BACKUP_FINGERPRINT_FAILED',
      'Recovery inventory metadata could not be read.',
      postgresDiagnostic(error, phase),
    );
  }
}

function quoteIdentifier(value: string): string {
  if (!IDENTIFIER.test(value)) {
    throw new RecoveryError('BACKUP_FINGERPRINT_FAILED', 'Unsafe database identifier.');
  }
  return `"${value}"`;
}

function frame(hash: ReturnType<typeof createHash>, value: string): void {
  const bytes = Buffer.from(value, 'utf8');
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(bytes.length);
  hash.update(length);
  hash.update(bytes);
}

export async function assertRecoveryInventory(client: QueryClient): Promise<void> {
  const publicRows = await inventoryQuery<{ table_name: string }>(
    'application_inventory',
    client,
    `select table_name from information_schema.tables
     where table_schema='public' and table_type='BASE TABLE' order by table_name`,
  );
  const actual = publicRows.rows.map((row) => row.table_name);
  if (JSON.stringify(actual) !== JSON.stringify([...APPLICATION_TABLES])) {
    throw new RecoveryError(
      'BACKUP_INVENTORY_VALIDATION_FAILED',
      'Application table inventory differs from the reviewed recovery allowlist.',
      { phase: 'application_inventory', timeout: false },
    );
  }
  const authRows = await inventoryQuery<{ table_name: string }>(
    'auth_inventory',
    client,
    `select table_name from information_schema.tables
     where table_schema='auth' and table_name=any($1::text[]) order by table_name`,
    [[...AUTH_TABLES]],
  );
  if (
    JSON.stringify(authRows.rows.map((row) => row.table_name)) !==
    JSON.stringify([...AUTH_TABLES].sort())
  ) {
    throw new RecoveryError(
      'BACKUP_INVENTORY_VALIDATION_FAILED',
      'Required Auth tables are missing.',
      { phase: 'auth_inventory', timeout: false },
    );
  }
}

export async function assertSupportedAuthState(client: QueryClient): Promise<void> {
  let discovered;
  try {
    discovered = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema='auth' and table_type='BASE TABLE' order by table_name`,
    );
  } catch (error) {
    throw new RecoveryError(
      isPostgresTimeout(error)
        ? 'BACKUP_OPERATION_TIMEOUT'
        : isPostgresConnectionLoss(error)
        ? 'BACKUP_SNAPSHOT_COORDINATOR_LOST'
        : 'BACKUP_AUTH_INVENTORY_FAILED',
      'Auth recovery inventory could not be read.',
      postgresDiagnostic(error, 'auth_inventory'),
    );
  }
  if (
    discovered.rows.some(
      (row) => classifyAuthTable(row.table_name) === AUTH_RECOVERY_CLASS.UNKNOWN,
    )
  ) {
    throw new RecoveryError(
      'BACKUP_AUTH_FEATURE_STATE_UNSUPPORTED',
      'Auth contains an unclassified table.',
    );
  }
  const present = discovered.rows.filter(
    (row) =>
      classifyAuthTable(row.table_name) === AUTH_RECOVERY_CLASS.KNOWN_DURABLE_UNSUPPORTED,
  );
  for (const row of present) {
    if (!UNSUPPORTED_DURABLE_AUTH_TABLES.includes(row.table_name as never)) {
      throw new RecoveryError('BACKUP_AUTH_FEATURE_STATE_UNSUPPORTED', 'Unexpected Auth state.');
    }
    const count = await inventoryQuery<{ count: number }>(
      'auth_inventory',
      client,
      `select count(*)::int as count from auth.${quoteIdentifier(row.table_name)}`,
    );
    if ((count.rows[0]?.count ?? 0) > 0) {
      throw new RecoveryError(
        'BACKUP_AUTH_FEATURE_STATE_UNSUPPORTED',
        'Auth contains durable state outside the reviewed email/password recovery contract.',
      );
    }
  }
  const identityProviders = await inventoryQuery<{ count: number }>(
    'auth_inventory',
    client,
    "select count(*)::int as count from auth.identities where provider <> 'email'",
  );
  const userColumns = await inventoryQuery<{ column_name: string }>(
    'auth_inventory',
    client,
    `select column_name from information_schema.columns
     where table_schema='auth' and table_name='users' and column_name in ('phone','is_anonymous')`,
  );
  const columns = new Set(userColumns.rows.map((row) => row.column_name));
  const unsupportedUsers = columns.size
    ? await inventoryQuery<{ count: number }>(
        'auth_inventory',
        client,
        `select count(*)::int as count from auth.users where ${[
          columns.has('phone') ? 'phone is not null' : undefined,
          columns.has('is_anonymous') ? 'coalesce(is_anonymous, false)' : undefined,
        ]
          .filter(Boolean)
          .join(' or ')}`,
      )
    : { rows: [{ count: 0 }] };
  if ((identityProviders.rows[0]?.count ?? 0) > 0 || (unsupportedUsers.rows[0]?.count ?? 0) > 0) {
    throw new RecoveryError(
      'BACKUP_AUTH_FEATURE_STATE_UNSUPPORTED',
      'Auth contains durable state outside the reviewed email/password recovery contract.',
    );
  }
}

export async function loadAuthSchemaContract(client: QueryClient): Promise<AuthColumnContract[]> {
  const result = await client.query<{
    table_name: 'users' | 'identities';
    ordinal_position: number;
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: 'YES' | 'NO';
  }>(
    `select table_name,ordinal_position,column_name,data_type,udt_name,is_nullable
     from information_schema.columns
     where table_schema='auth' and table_name=any($1::text[])
     order by table_name,ordinal_position`,
    [[...AUTH_TABLES]],
  );
  return result.rows.map((row) => ({
    table: row.table_name,
    ordinal: row.ordinal_position,
    column: row.column_name,
    dataType: row.data_type,
    udtName: row.udt_name,
    nullable: row.is_nullable === 'YES',
  }));
}

export async function loadStatusAggregates(
  client: QueryClient,
): Promise<Record<string, Record<string, number>>> {
  const columns = await client.query<{ table_name: string }>(
    `select table_name from information_schema.columns
     where table_schema='public' and column_name='status' and table_name=any($1::text[])
     order by table_name`,
    [[...APPLICATION_TABLES]],
  );
  const aggregates: Record<string, Record<string, number>> = {};
  for (const row of columns.rows) {
    if (!APPLICATION_TABLES.includes(row.table_name as never)) {
      throw new RecoveryError('BACKUP_FINGERPRINT_FAILED', 'Unexpected lifecycle table.');
    }
    const result = await client.query<{ status: string | null; count: number }>(
      `select status::text,count(*)::int count from public.${quoteIdentifier(row.table_name)} group by status order by status`,
    );
    aggregates[`public.${row.table_name}`] = Object.fromEntries(
      result.rows.map((item) => [item.status ?? '<NULL>', item.count]),
    );
  }
  return aggregates;
}

export async function loadPrimaryKeyColumns(
  client: QueryClient,
  table: QualifiedTable,
): Promise<string[]> {
  const [schema, name] = table.split('.');
  const result = await client.query<{ column_name: string }>(
    `select a.attname as column_name
     from pg_index i
     join pg_class c on c.oid=i.indrelid
     join pg_namespace n on n.oid=c.relnamespace
     join unnest(i.indkey) with ordinality k(attnum, ord) on true
     join pg_attribute a on a.attrelid=c.oid and a.attnum=k.attnum
     where i.indisprimary and n.nspname=$1 and c.relname=$2
     order by k.ord`,
    [schema, name],
  );
  if (!result.rows.length) {
    throw new RecoveryError('BACKUP_FINGERPRINT_FAILED', 'A recovery table has no primary key.');
  }
  return result.rows.map((row) => row.column_name);
}

export async function fingerprintTable(
  client: QueryClient,
  table: QualifiedTable,
): Promise<TableFingerprint> {
  try {
    const [schema, name] = table.split('.');
    const columns = await loadPrimaryKeyColumns(client, table);
    const qualified = `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`;
    const pkExpression = columns.map((column) => `t.${quoteIdentifier(column)}`).join(', ');
    const order = columns.map((column) => `t.${quoteIdentifier(column)}`).join(', ');
    const pkHash = createHash('sha256');
    const contentHash = createHash('sha256');
    let rowCount = 0;
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const page = await client.query<{ pk: string; content: string }>(
        `select jsonb_build_array(${pkExpression})::text as pk,
                to_jsonb(t)::text as content
         from ${qualified} t order by ${order} limit $1 offset $2`,
        [PAGE_SIZE, offset],
      );
      for (const row of page.rows) {
        frame(pkHash, row.pk);
        frame(contentHash, row.content);
        rowCount += 1;
      }
      if (page.rows.length < PAGE_SIZE) break;
    }
    return {
      table,
      rowCount,
      primaryKeySha256: pkHash.digest('hex'),
      contentSha256: contentHash.digest('hex'),
      primaryKeyColumns: columns,
    };
  } catch (error) {
    if (error instanceof RecoveryError) throw error;
    throw new RecoveryError(
      isPostgresTimeout(error)
        ? 'BACKUP_OPERATION_TIMEOUT'
        : isPostgresConnectionLoss(error)
        ? 'BACKUP_SNAPSHOT_COORDINATOR_LOST'
        : 'BACKUP_FINGERPRINT_FAILED',
      `Recovery table fingerprint failed for ${table}.`,
      postgresDiagnostic(error, 'fingerprint'),
    );
  }
}

export async function loadForeignKeys(client: QueryClient): Promise<ForeignKey[]> {
  const result = await client.query<{
    source_schema: string;
    source_table: string;
    target_schema: string;
    target_table: string;
    source_columns: string[];
    target_columns: string[];
  }>(
    `select ns.nspname source_schema, cs.relname source_table,
            nt.nspname target_schema, ct.relname target_table,
            array_agg(sa.attname order by k.ord) source_columns,
            array_agg(ta.attname order by k.ord) target_columns
     from pg_constraint con
     join pg_class cs on cs.oid=con.conrelid join pg_namespace ns on ns.oid=cs.relnamespace
     join pg_class ct on ct.oid=con.confrelid join pg_namespace nt on nt.oid=ct.relnamespace
     join unnest(con.conkey, con.confkey) with ordinality k(sattnum,tattnum,ord) on true
     join pg_attribute sa on sa.attrelid=cs.oid and sa.attnum=k.sattnum
     join pg_attribute ta on ta.attrelid=ct.oid and ta.attnum=k.tattnum
     where con.contype='f' and ns.nspname in ('public','auth') and nt.nspname in ('public','auth')
     group by ns.nspname,cs.relname,nt.nspname,ct.relname
     order by ns.nspname,cs.relname,nt.nspname,ct.relname`,
  );
  return result.rows.map((row) => ({
    source: `${row.source_schema}.${row.source_table}` as QualifiedTable,
    target: `${row.target_schema}.${row.target_table}` as QualifiedTable,
    sourceColumns: row.source_columns,
    targetColumns: row.target_columns,
  }));
}

export function topologicalRestoreOrder(
  tables: readonly string[],
  foreignKeys: ForeignKey[],
): string[] {
  const allowed = new Set(tables);
  const incoming = new Map(tables.map((table) => [table, new Set<string>()]));
  for (const fk of foreignKeys) {
    if (allowed.has(fk.source) && allowed.has(fk.target) && fk.source !== fk.target) {
      incoming.get(fk.source)?.add(fk.target);
    }
  }
  const result: string[] = [];
  while (result.length < tables.length) {
    const ready = [...incoming.entries()]
      .filter(
        ([table, dependencies]) =>
          !result.includes(table) && [...dependencies].every((item) => result.includes(item)),
      )
      .map(([table]) => table)
      .sort();
    if (!ready.length) {
      throw new RecoveryError(
        'RESTORE_DATA_FAILED',
        'Recovery-table foreign keys contain an unsupported cycle.',
      );
    }
    result.push(...ready);
  }
  return result;
}
