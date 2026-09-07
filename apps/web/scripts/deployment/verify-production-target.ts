import { Pool } from 'pg';
import { postgresConnectionConfig } from '@school/database/connection';

import { safeDeploymentError } from './contracts';
import { assertProductionMigrationTarget } from './production-contracts';

async function main(): Promise<void> {
  const migrationUrl = assertProductionMigrationTarget(process.env);
  const pool = new Pool({
    ...postgresConnectionConfig(migrationUrl.toString(), process.env.DATABASE_SSL_CA),
    max: 1,
  });
  try {
    const client = await pool.connect();
    try {
      await client.query('begin read only');
      await client.query('select current_database()');
      await client.query('rollback');
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
  console.info(
    JSON.stringify({
      event: 'production_target_tls_preflight_passed',
      projectRef: process.env.PRODUCTION_EXPECTED_PROJECT_REF,
    }),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      event: 'production_target_tls_preflight_failed',
      ...safeDeploymentError(error),
    }),
  );
  process.exitCode = 1;
});
