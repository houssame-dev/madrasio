import type { QueryClient } from './snapshot';
import { AUTH_TABLES, RECOVERY_TABLES, RecoveryError, type RecoveryPhase } from './contracts';
import type { ForeignKey, QualifiedTable, TableFingerprint } from './inventory';
import {
  fingerprintTable,
  loadAuthSchemaContract,
  topologicalRestoreOrder,
  type AuthColumnContract,
  loadStatusAggregates,
} from './inventory';
import { canonicalJson } from './manifest';
import { compareFingerprints, type RecoveryManifest } from './manifest';

export function buildRestoreOrder(foreignKeys: ForeignKey[]): QualifiedTable[] {
  const publicTables = RECOVERY_TABLES.filter((table) => table.startsWith('public.'));
  return [
    ...AUTH_TABLES.map((table) => `auth.${table}` as QualifiedTable),
    ...topologicalRestoreOrder(publicTables, foreignKeys).map((table) => table as QualifiedTable),
  ];
}

export async function assertAuthSchemaCompatible(
  client: QueryClient,
  expected: AuthColumnContract[],
): Promise<void> {
  const actual = await loadAuthSchemaContract(client);
  if (canonicalJson(actual) !== canonicalJson(expected))
    throw new RecoveryError(
      'RESTORE_AUTH_SCHEMA_INCOMPATIBLE',
      'Target Auth schema is incompatible with this recovery format.',
    );
}

export async function assertEmptyRestoreFoundation(client: QueryClient): Promise<void> {
  const applicationNames = RECOVERY_TABLES.filter((table) => table.startsWith('public.')).map(
    (table) => table.slice(7),
  );
  const publicTables = await client.query<{ count: number }>(
    `select count(*)::int count from information_schema.tables
     where table_schema='public' and table_name=any($1::text[])`,
    [applicationNames],
  );
  const authRows = await client.query<{ count: number }>(
    'select ((select count(*) from auth.users)+(select count(*) from auth.identities))::int count',
  );
  const journal = await client.query<{ exists: boolean }>(
    "select to_regclass('drizzle.__drizzle_migrations') is not null as exists",
  );
  if (
    (publicTables.rows[0]?.count ?? 0) !== 0 ||
    (authRows.rows[0]?.count ?? 0) !== 0 ||
    journal.rows[0]?.exists
  ) {
    throw new RecoveryError(
      'RESTORE_TARGET_REJECTED',
      'Restore target is not an empty disposable foundation.',
    );
  }
}

export async function assertIdentityIntegrity(client: QueryClient): Promise<void> {
  const result = await client.query<{ violation: string }>(
    `select 'public_user_without_auth_user' violation where exists (
       select 1 from public.users u left join auth.users a on a.id=u.id where a.id is null)
     union all select 'auth_identity_without_auth_user' where exists (
       select 1 from auth.identities i left join auth.users a on a.id=i.user_id where a.id is null)
     union all select 'canonical_email_mismatch' where exists (
       select 1 from public.users u join auth.users a on a.id=u.id
       where u.email<>lower(trim(a.email)) or a.email is null)`,
  );
  if (result.rows.length)
    throw new RecoveryError(
      'RESTORE_RECONCILIATION_FAILED',
      'Restored identity relationships are invalid.',
    );
}

export async function assertForeignKeyIntegrity(client: QueryClient): Promise<void> {
  const result = await client.query<{ violation: string }>(
    `select con.conname violation
     from pg_constraint con
     join pg_class source on source.oid=con.conrelid
     join pg_namespace n on n.oid=source.relnamespace
     where con.contype='f' and n.nspname='public' and not con.convalidated`,
  );
  if (result.rows.length)
    throw new RecoveryError(
      'RESTORE_RECONCILIATION_FAILED',
      'Restored foreign keys are not valid.',
    );
}

export async function assertMigrationJournal(
  client: QueryClient,
  expectedCreatedAt: number[],
): Promise<void> {
  const result = await client.query<{ created_at: string }>(
    'select created_at::text from drizzle.__drizzle_migrations order by created_at asc',
  );
  if (
    JSON.stringify(result.rows.map((row) => row.created_at)) !==
    JSON.stringify(expectedCreatedAt.map(String))
  ) {
    throw new RecoveryError(
      'RESTORE_RECONCILIATION_FAILED',
      'Restored migration journal does not match the recovery manifest.',
    );
  }
}

export async function reconcileRestoredData(
  client: QueryClient,
  manifest: RecoveryManifest,
): Promise<void> {
  const restored: TableFingerprint[] = [];
  for (const expected of manifest.fingerprints)
    restored.push(await fingerprintTable(client, expected.table as QualifiedTable));
  compareFingerprints(manifest.fingerprints as TableFingerprint[], restored);
  if (
    canonicalJson(await loadStatusAggregates(client)) !==
    canonicalJson(manifest.lifecycleAggregates)
  ) {
    throw new RecoveryError(
      'RESTORE_RECONCILIATION_FAILED',
      'Restored lifecycle aggregates do not match the recovery manifest.',
    );
  }
  await assertIdentityIntegrity(client);
  await assertForeignKeyIntegrity(client);
}

export function buildSequenceReconciliationSql(schema = 'public'): string {
  if (schema !== 'public')
    throw new RecoveryError('RESTORE_DATA_FAILED', 'Sequence reconciliation is limited to public.');
  return `DO $$ DECLARE r record; BEGIN
    FOR r IN SELECT sequence_schema,sequence_name,table_schema,table_name,column_name
      FROM information_schema.sequences s
      JOIN LATERAL (SELECT ns.nspname table_schema,c.relname table_name,a.attname column_name
        FROM pg_class seq JOIN pg_depend d ON d.objid=seq.oid AND d.deptype='a'
        JOIN pg_class c ON c.oid=d.refobjid JOIN pg_namespace ns ON ns.oid=c.relnamespace
        JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=d.refobjsubid
        WHERE seq.relname=s.sequence_name AND s.sequence_schema='public') x ON true
      WHERE sequence_schema='public'
    LOOP EXECUTE format('select setval(%L,coalesce((select max(%I) from %I.%I),1),exists(select 1 from %I.%I))',
      r.sequence_schema||'.'||r.sequence_name,r.column_name,r.table_schema,r.table_name,r.table_schema,r.table_name); END LOOP;
  END $$;`;
}

export type RestorePhase =
  'foundation' | 'migrations' | 'auth' | 'application' | 'sequences' | 'verify';
export async function runFailClosedRestore(
  phases: Record<RestorePhase, () => Promise<void>>,
): Promise<void> {
  for (const phase of [
    'foundation',
    'migrations',
    'auth',
    'application',
    'sequences',
    'verify',
  ] as const) {
    try {
      await phases[phase]();
    } catch (error) {
      if (error instanceof RecoveryError && error.diagnostic) throw error;
      const diagnostics: Record<RestorePhase, RecoveryPhase> = {
        foundation: 'restore_foundation',
        migrations: 'migration_launch',
        auth: 'restore_auth',
        application: 'restore_application',
        sequences: 'restore_sequences',
        verify: 'restore_verification',
      };
      throw new RecoveryError(
        error instanceof RecoveryError ? error.code : 'RESTORE_DATA_FAILED',
        `Restore stopped during ${phase}.`,
        { phase: diagnostics[phase], timeout: false },
      );
    }
  }
}
