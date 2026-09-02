import { Pool, type PoolClient } from 'pg';

import {
  buildCronCommand,
  CRON_JOBS,
  CRON_SCHEDULE,
  parseCronConfiguration,
  safeDeploymentError,
  VAULT_SECRET_NAMES,
} from './contracts';

async function upsertVaultSecret(
  client: PoolClient,
  name: string,
  value: string,
  description: string,
): Promise<void> {
  const existing = await client.query<{ id: string }>(
    'select id::text from vault.secrets where name = $1 order by created_at',
    [name],
  );
  if (existing.rows.length > 1) {
    throw new Error('Ambiguous duplicate Vault secret names require operator reconciliation.');
  }
  if (existing.rows.length === 0) {
    await client.query('select vault.create_secret($1, $2, $3)', [value, name, description]);
  } else {
    await client.query('select vault.update_secret($1::uuid, $2, $3, $4)', [
      existing.rows[0].id,
      value,
      name,
      description,
    ]);
  }
}

async function main(): Promise<void> {
  const config = parseCronConfiguration(process.env);
  const pool = new Pool({ connectionString: config.migrationUrl.toString(), max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('create extension if not exists pg_cron with schema pg_catalog');
      await client.query('create extension if not exists pg_net with schema extensions');

      await upsertVaultSecret(
        client,
        VAULT_SECRET_NAMES.origin,
        config.origin.origin,
        'Stable Vercel STAGING application origin for scheduler HTTP jobs',
      );
      await upsertVaultSecret(
        client,
        VAULT_SECRET_NAMES.jobSecret,
        config.secret,
        'Bearer credential for Vercel STAGING internal job endpoints',
      );

      for (const job of CRON_JOBS) {
        const duplicates = await client.query<{ count: number }>(
          'select count(*)::int as count from cron.job where jobname = $1',
          [job.name],
        );
        if ((duplicates.rows[0]?.count ?? 0) > 1) {
          throw new Error(
            `Ambiguous duplicate Cron jobs require operator reconciliation: ${job.name}`,
          );
        }
        await client.query('select cron.schedule($1, $2, $3)', [
          job.name,
          CRON_SCHEDULE,
          buildCronCommand(job.path),
        ]);
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }

  console.info(
    JSON.stringify({
      event: 'staging_cron_configured',
      jobs: CRON_JOBS.map((job) => job.name),
      schedule: CRON_SCHEDULE,
      vaultSecrets: Object.values(VAULT_SECRET_NAMES),
    }),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({ event: 'staging_cron_configuration_failed', ...safeDeploymentError(error) }),
  );
  process.exitCode = 1;
});
