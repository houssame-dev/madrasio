import { Pool } from 'pg';
import { postgresConnectionConfig } from '@school/database/connection';

import {
  assertStagingMigrationTarget,
  buildCronCommand,
  CRON_JOBS,
  CRON_SCHEDULE,
  safeDeploymentError,
  VAULT_SECRET_NAMES,
} from './contracts';

async function main(): Promise<void> {
  const migrationUrl = assertStagingMigrationTarget(process.env);
  const pool = new Pool({ ...postgresConnectionConfig(migrationUrl.toString(), process.env.DATABASE_SSL_CA), max: 1 });
  let latestRuns: Array<{ jobname: string; status: string }> = [];
  try {
    const client = await pool.connect();
    try {
      await client.query('begin read only');
      const extensions = await client.query<{ extname: string }>(
        "select extname from pg_extension where extname in ('pg_cron', 'pg_net') order by extname",
      );
      if (extensions.rows.map((row) => row.extname).join(',') !== 'pg_cron,pg_net') {
        throw new Error('Required STAGING scheduler extensions are not installed.');
      }
      const secrets = await client.query<{ name: string }>(
        'select name from vault.secrets where name = any($1::text[]) order by name',
        [Object.values(VAULT_SECRET_NAMES)],
      );
      if (secrets.rows.length !== Object.values(VAULT_SECRET_NAMES).length) {
        throw new Error('Required scheduler Vault secret names are not configured.');
      }
      const jobs = await client.query<{
        jobid: number;
        jobname: string;
        schedule: string;
        command: string;
      }>(
        'select jobid, jobname, schedule, command from cron.job where jobname = any($1::text[]) order by jobname',
        [CRON_JOBS.map((job) => job.name)],
      );
      if (jobs.rows.length !== CRON_JOBS.length)
        throw new Error('The exact two STAGING Cron jobs are not configured.');
      for (const expected of CRON_JOBS) {
        const actual = jobs.rows.find((job) => job.jobname === expected.name);
        if (
          !actual ||
          actual.schedule !== CRON_SCHEDULE ||
          actual.command !== buildCronCommand(expected.path)
        ) {
          throw new Error(`Cron job contract mismatch: ${expected.name}`);
        }
      }
      const runs = await client.query<{ jobname: string; status: string }>(
        `select distinct on (j.jobname) j.jobname, d.status
         from cron.job j
         left join cron.job_run_details d on d.jobid = j.jobid
         where j.jobname = any($1::text[])
         order by j.jobname, d.start_time desc nulls last`,
        [CRON_JOBS.map((job) => job.name)],
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
      event: 'staging_cron_verified',
      extensions: ['pg_cron', 'pg_net'],
      jobs: CRON_JOBS.map((job) => job.name),
      latestRuns,
    }),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({ event: 'staging_cron_verification_failed', ...safeDeploymentError(error) }),
  );
  process.exitCode = 1;
});
