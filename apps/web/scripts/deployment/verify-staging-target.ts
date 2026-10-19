import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { postgresConnectionConfig } from '@school/database/connection';
import { assertStagingMigrationTarget, assertStagingPreMigrationChain, safeDeploymentError, STAGING_PROJECT_REF, EXPECTED_TABLE_COUNT } from './contracts';

async function main(): Promise<void> {
  const url = assertStagingMigrationTarget(process.env);
  if (!process.env.DATABASE_SSL_CA?.trim()) {
    throw new Error('Trusted STAGING database CA is required before migrations.');
  }
  const journal: unknown = JSON.parse(await readFile(
    new URL('../../../../database/drizzle/migrations/meta/_journal.json', import.meta.url), 'utf8',
  ));
  let appliedMigrationCount = 0;
  const pool = new Pool({
    ...postgresConnectionConfig(url.toString(), process.env.DATABASE_SSL_CA),
    max: 1,
    connectionTimeoutMillis: 15000,
  });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      try {
        const migrations = await client.query<{ created_at: string }>(
          'SELECT created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at ASC',
        );
        assertStagingPreMigrationChain(journal, migrations.rows.map(row => row.created_at));
        appliedMigrationCount = migrations.rows.length;
        const tables = await client.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
        );
        const finance = await client.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name LIKE 'finance_%'",
        );
        const missingRls = await client.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity",
        );
        if (
          tables.rows[0]?.count !== EXPECTED_TABLE_COUNT ||
          finance.rows[0]?.count !== 8 ||
          missingRls.rows[0]?.count !== 0
        ) {
          throw new Error('STAGING pre-migration schema differs from the verified Finance inventory.');
        }
      } finally {
        await client.query('ROLLBACK');
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
  console.info(JSON.stringify({
    event: 'staging_pre_migration_target_verified',
    projectRef: STAGING_PROJECT_REF,
    migrations: appliedMigrationCount,
    applicationTables: EXPECTED_TABLE_COUNT,
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({
    event: 'staging_pre_migration_target_failed',
    ...safeDeploymentError(error),
  }));
  process.exitCode = 1;
});
