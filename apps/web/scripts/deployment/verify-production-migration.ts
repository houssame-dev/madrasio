import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';
import { postgresConnectionConfig } from '@school/database/connection';
import { applicationSecurityAuditSql, assertApplicationSecurity } from '@school/database/security';

import { safeDeploymentError } from './contracts';
import {
  assertProductionMigrationTarget,
  EXPECTED_LATEST_MIGRATION,
  EXPECTED_MIGRATION_COUNT,
  EXPECTED_TABLE_COUNT,
} from './production-contracts';

type Journal = { entries: Array<{ tag: string; when: number }> };

async function main(): Promise<void> {
  const migrationUrl = assertProductionMigrationTarget(process.env);
  const journalPath = fileURLToPath(
    new URL('../../../../database/drizzle/migrations/meta/_journal.json', import.meta.url),
  );
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as Journal;
  if (
    journal.entries.length !== EXPECTED_MIGRATION_COUNT ||
    journal.entries.at(-1)?.tag !== EXPECTED_LATEST_MIGRATION
  ) {
    throw new Error('The repository migration journal is not the reviewed Production chain.');
  }

  const pool = new Pool({
    ...postgresConnectionConfig(migrationUrl.toString(), process.env.DATABASE_SSL_CA),
    max: 1,
  });
  try {
    const client = await pool.connect();
    try {
      await client.query('begin read only');
      const migrations = await client.query<{ created_at: string }>(
        'select created_at::text from drizzle.__drizzle_migrations order by created_at asc',
      );
      const tables = await client.query<{ count: number }>(
        "select count(*)::int as count from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
      );
      const auth = await client.query<{ exists: boolean }>(
        "select to_regclass('auth.users') is not null as exists",
      );
      const emailColumn = await client.query<{ data_type: string; is_nullable: string }>(
        "select data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'email'",
      );
      const constraints = await client.query<{ conname: string }>(
        "select conname from pg_constraint where conrelid = 'public.users'::regclass and conname in ('users_email_unique', 'users_email_canonical_check') order by conname",
      );
      const expectedTimestamps = journal.entries.map((entry) => String(entry.when));
      if (
        JSON.stringify(migrations.rows.map((row) => row.created_at)) !==
        JSON.stringify(expectedTimestamps)
      ) {
        throw new Error('The Production migration journal does not match the repository journal.');
      }
      if (tables.rows[0]?.count !== EXPECTED_TABLE_COUNT || !auth.rows[0]?.exists) {
        throw new Error('The Production schema inventory is not the reviewed application schema.');
      }
      if (
        emailColumn.rows.length !== 1 ||
        emailColumn.rows[0].data_type !== 'text' ||
        emailColumn.rows[0].is_nullable !== 'NO' ||
        constraints.rows.map((row) => row.conname).join(',') !==
          'users_email_canonical_check,users_email_unique'
      ) {
        throw new Error('The canonical public.users email schema is incomplete.');
      }
      const security = await client.query<{ violation: string }>(applicationSecurityAuditSql);
      assertApplicationSecurity(security.rows);
      await client.query('rollback');
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }

  console.info(
    JSON.stringify({
      event: 'production_migration_security_verified',
      projectRef: process.env.PRODUCTION_EXPECTED_PROJECT_REF,
      migrations: EXPECTED_MIGRATION_COUNT,
      latestMigration: EXPECTED_LATEST_MIGRATION,
      applicationTables: EXPECTED_TABLE_COUNT,
    }),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      event: 'production_migration_verification_failed',
      ...safeDeploymentError(error),
    }),
  );
  process.exitCode = 1;
});
