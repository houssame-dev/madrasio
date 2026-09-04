import { z } from 'zod';

export const STAGING_PROJECT_REF = 'cqeaxlttezunirsmkrxz';
export const EXPECTED_MIGRATION_COUNT = 16;
export const EXPECTED_TABLE_COUNT = 39;
export const EXPECTED_LATEST_MIGRATION = '0015_data-api-grants-hardening';
export const STAGING_VERCEL_PROJECT = 'school-management-system-staging';
export const CRON_SCHEDULE = '* * * * *';

export const CRON_JOBS = [
  {
    name: 'sms-staging-process-scheduled-announcements',
    path: '/api/internal/jobs/process-scheduled-announcements',
  },
  { name: 'sms-staging-process-outbox', path: '/api/internal/jobs/process-outbox' },
] as const;

export const VAULT_SECRET_NAMES = {
  origin: 'sms_staging_app_origin',
  jobSecret: 'sms_staging_cron_secret',
} as const;

export class DeploymentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DeploymentError';
  }
}

function targetsProject(value: string, projectRef: string): boolean {
  const url = new URL(value);
  return url.hostname.includes(projectRef) || decodeURIComponent(url.username).includes(projectRef);
}

export function assertStagingMigrationTarget(env: NodeJS.ProcessEnv): URL {
  if (
    env.DEPLOY_TARGET_ENV !== 'staging' ||
    env.DEPLOY_EXPECTED_PROJECT_REF !== STAGING_PROJECT_REF
  ) {
    throw new DeploymentError(
      'STAGING_TARGET_NOT_CONFIRMED',
      'Deployment target must be the approved STAGING environment and project.',
    );
  }
  const value = z.string().url().safeParse(env.MIGRATION_DATABASE_URL);
  if (!value.success) {
    throw new DeploymentError('INVALID_DEPLOYMENT_CONFIG', 'MIGRATION_DATABASE_URL is required.');
  }
  const url = new URL(value.data);
  if (!targetsProject(value.data, STAGING_PROJECT_REF) || url.port !== '5432') {
    throw new DeploymentError(
      'STAGING_TARGET_NOT_CONFIRMED',
      'Migration must use the approved STAGING Session Pooler on port 5432.',
    );
  }
  return url;
}

export function parseStagingOrigin(value: string | undefined): URL {
  const parsed = z.string().url().safeParse(value);
  if (!parsed.success) {
    throw new DeploymentError(
      'INVALID_STAGING_ORIGIN',
      'A valid STAGING application origin is required.',
    );
  }
  const url = new URL(parsed.data);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  ) {
    throw new DeploymentError(
      'INVALID_STAGING_ORIGIN',
      'STAGING origin must be a credential-free public HTTPS origin with no path.',
    );
  }
  return url;
}

export function buildCronCommand(path: string): string {
  if (!CRON_JOBS.some((job) => job.path === path)) {
    throw new DeploymentError(
      'INVALID_CRON_PATH',
      'Cron path is not an approved internal job route.',
    );
  }
  return `select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = '${VAULT_SECRET_NAMES.origin}') || '${path}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = '${VAULT_SECRET_NAMES.jobSecret}')
    ),
    body := '{}'::jsonb
  ) as request_id;`;
}

export function parseCronConfiguration(env: NodeJS.ProcessEnv): {
  migrationUrl: URL;
  origin: URL;
  secret: string;
} {
  if (env.RUN_STAGING_CRON_CONFIGURATION !== '1') {
    throw new DeploymentError(
      'STAGING_CRON_OPT_IN_REQUIRED',
      'Set RUN_STAGING_CRON_CONFIGURATION=1 for the explicit STAGING infrastructure operation.',
    );
  }
  const migrationUrl = assertStagingMigrationTarget(env);
  const origin = parseStagingOrigin(env.STAGING_APP_ORIGIN);
  const secret = env.CRON_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new DeploymentError(
      'INVALID_DEPLOYMENT_CONFIG',
      'A strong server-only CRON_SECRET is required.',
    );
  }
  if (secret === env.SUPABASE_SECRET_KEY?.trim()) {
    throw new DeploymentError(
      'INVALID_DEPLOYMENT_CONFIG',
      'CRON_SECRET must be distinct from the Supabase Auth Admin credential.',
    );
  }
  return { migrationUrl, origin, secret };
}

export function safeDeploymentError(error: unknown): { code: string; message: string } {
  if (error instanceof DeploymentError) return { code: error.code, message: error.message };
  return { code: 'DEPLOYMENT_OPERATION_FAILED', message: 'The deployment operation failed.' };
}
