import { Pool } from 'pg';
import { postgresConnectionConfig } from '@school/database/connection';

import { safeDeploymentError } from './contracts';
import {
  assertProductionMigrationTarget,
  buildProductionCronCommand,
  PRODUCTION_CRON_JOBS,
  PRODUCTION_CRON_SCHEDULE,
  PRODUCTION_VAULT_SECRET_NAMES,
} from './production-contracts';

async function main(): Promise<void> {
  const migrationUrl = assertProductionMigrationTarget(process.env);
  const pool = new Pool({
    ...postgresConnectionConfig(migrationUrl.toString(), process.env.DATABASE_SSL_CA),
    max: 1,
  });
  let latestRuns: Array<{ jobname: string; status: string }> = [];
  try {
    const client = await pool.connect();
    try {
      await client.query('begin read only');
      const extensions = await client.query<{ extname: string }>(
        "select extname from pg_extension where extname in ('pg_cron', 'pg_net') order by extname",
      );
      if (extensions.rows.map((row) => row.extname).join(',') !== 'pg_cron,pg_net') {
        throw new Error('Required Production scheduler extensions are not installed.');
      }
      const secrets = await client.query<{ name: string }>(
        'select name from vault.secrets where name = any($1::text[]) order by name',
        [Object.values(PRODUCTION_VAULT_SECRET_NAMES)],
      );
      if (secrets.rows.length !== Object.values(PRODUCTION_VAULT_SECRET_NAMES).length) {
        throw new Error('Required Production Vault secret names are not configured.');
      }
      const jobs = await client.query<{ jobname: string; schedule: string; command: string }>(
        'select jobname, schedule, command from cron.job where jobname = any($1::text[]) order by jobname',
        [PRODUCTION_CRON_JOBS.map((job) => job.name)],
      );
      if (jobs.rows.length !== PRODUCTION_CRON_JOBS.length) {
        throw new Error('The exact two Production Cron jobs are not configured.');
      }
      for (const expected of PRODUCTION_CRON_JOBS) {
        const actual = jobs.rows.find((job) => job.jobname === expected.name);
        if (
          !actual ||
          actual.schedule !== PRODUCTION_CRON_SCHEDULE ||
          actual.command !== buildProductionCronCommand(expected.path)
        ) {
          throw new Error(`Production Cron contract mismatch: ${expected.name}`);
        }
      }
      const runs = await client.query<{ jobname: string; status: string }>(
        `select distinct on (j.jobname) j.jobname, d.status
         from cron.job j left join cron.job_run_details d on d.jobid = j.jobid
         where j.jobname = any($1::text[])
         order by j.jobname, d.start_time desc nulls last`,
        [PRODUCTION_CRON_JOBS.map((job) => job.name)],
      );
      latestRuns = runs.rows;
      await client.query('rollback');
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
  console.info(
    JSON.stringify({
      event: 'production_cron_verified',
      jobs: PRODUCTION_CRON_JOBS.map((job) => job.name),
      latestRuns,
    }),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({ event: 'production_cron_verification_failed', ...safeDeploymentError(error) }),
  );
  process.exitCode = 1;
});
