import { Pool } from 'pg';
import { postgresConnectionConfig } from '@school/database/connection';

import {
  assertStagingMigrationTarget,
  EXPECTED_LATEST_MIGRATION,
  EXPECTED_MIGRATION_COUNT,
  EXPECTED_TABLE_COUNT,
  STAGING_PROJECT_REF,
} from '../deployment/contracts';
import { collectOperationalStatus, operationalFindings } from './operational-status';

let stage = 'target_validation';
const STAGING_ORIGIN = new URL('https://madrasio-staging.vercel.app');

function deploymentEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...env,
    DEPLOY_TARGET_ENV: env.BOOTSTRAP_TARGET_ENV,
    DEPLOY_EXPECTED_PROJECT_REF: env.BOOTSTRAP_EXPECTED_PROJECT_REF,
  };
}

async function deployedCommitSha(origin: URL): Promise<string | null> {
  const response = await fetch(new URL('/api/health/deployment', origin), {
    redirect: 'error',
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error('STAGING deployment metadata is unavailable.');
  const body = await response.json() as { status?: unknown; commitSha?: unknown };
  return body.status === 'ok' && typeof body.commitSha === 'string' && /^[a-f0-9]{40}$/.test(body.commitSha)
    ? body.commitSha
    : null;
}

async function main(): Promise<void> {
  const migrationUrl = assertStagingMigrationTarget(deploymentEnvironment(process.env));
  stage = 'database_connectivity';
  const pool = new Pool({
    ...postgresConnectionConfig(migrationUrl.toString(), process.env.DATABASE_SSL_CA),
    max: 1,
  });
  try {
    const client = await pool.connect();
    try {
      await client.query('begin read only');
      stage = 'database_status';
      const status = await collectOperationalStatus(client);
      await client.query('rollback');
      stage = 'deployment_health';
      const deployedSha = await deployedCommitSha(STAGING_ORIGIN);
      const findings = operationalFindings(status);
      const schemaMatches =
        status.migration.count === EXPECTED_MIGRATION_COUNT &&
        status.applicationTables === EXPECTED_TABLE_COUNT;
      console.info(JSON.stringify({
        event: 'staging_operational_status',
        projectRef: STAGING_PROJECT_REF,
        expectedLatestMigration: EXPECTED_LATEST_MIGRATION,
        deployedCommitSha: deployedSha,
        schemaMatches,
        ...status,
        findings,
        healthy: schemaMatches && findings.length === 0,
      }));
      if (!schemaMatches || findings.length > 0) process.exitCode = 1;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  console.error(JSON.stringify({
    event: 'staging_operational_status_failed',
    code: 'OPERATIONAL_STATUS_UNAVAILABLE',
    stage,
  }));
  process.exitCode = 1;
});
