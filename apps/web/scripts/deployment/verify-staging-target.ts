import { Pool } from 'pg';
import { postgresConnectionConfig } from '@school/database/connection';
import { assertStagingMigrationTarget, safeDeploymentError, STAGING_PROJECT_REF, EXPECTED_MIGRATION_COUNT, EXPECTED_TABLE_COUNT } from './contracts';

async function main(): Promise<void> {
  const url = assertStagingMigrationTarget(process.env);
  if (!process.env.DATABASE_SSL_CA?.trim()) {
    throw new Error('Trusted STAGING database CA is required before migrations.');
  }
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
        const migrations = await client.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations',
        );
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
          migrations.rows[0]?.count !== EXPECTED_MIGRATION_COUNT - 1 ||
          tables.rows[0]?.count !== EXPECTED_TABLE_COUNT ||
          finance.rows[0]?.count !== 8 ||
          missingRls.rows[0]?.count !== 0
        ) {
          throw new Error('STAGING pre-migration schema differs from the verified 0024 checkpoint.');
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
    migrations: EXPECTED_MIGRATION_COUNT - 1,
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
