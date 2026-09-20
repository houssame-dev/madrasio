import { z } from 'zod';

import {
  DeploymentError,
  EXPECTED_LATEST_MIGRATION,
  EXPECTED_MIGRATION_COUNT,
  EXPECTED_TABLE_COUNT,
  STAGING_PROJECT_REF,
} from './contracts';

export { EXPECTED_LATEST_MIGRATION, EXPECTED_MIGRATION_COUNT, EXPECTED_TABLE_COUNT };

export const PRODUCTION_CONFIRMATION = 'DEPLOY_PRODUCTION';
export const PRODUCTION_CRON_CONFIRMATION = 'CONFIGURE_PRODUCTION_CRON';
export const PRODUCTION_CRON_SCHEDULE = '* * * * *';

export const PRODUCTION_CRON_JOBS = [
  {
    name: 'sms-production-process-scheduled-announcements',
    path: '/api/internal/jobs/process-scheduled-announcements',
  },
  { name: 'sms-production-process-outbox', path: '/api/internal/jobs/process-outbox' },
] as const;

export const PRODUCTION_VAULT_SECRET_NAMES = {
  origin: 'sms_production_app_origin',
  jobSecret: 'sms_production_cron_secret',
} as const;

function requiredProjectRef(env: NodeJS.ProcessEnv): string {
  const parsed = z
    .string()
    .regex(/^[a-z0-9]{20}$/)
    .safeParse(env.PRODUCTION_EXPECTED_PROJECT_REF);
  if (!parsed.success || parsed.data === STAGING_PROJECT_REF) {
    throw new DeploymentError(
      'PRODUCTION_TARGET_NOT_CONFIRMED',
      'A distinct exact Production Supabase project ref is required.',
    );
  }
  return parsed.data;
}

function targetsProject(value: string, projectRef: string): boolean {
  const url = new URL(value);
  return (
    url.hostname === `db.${projectRef}.supabase.co` ||
    decodeURIComponent(url.username) === `postgres.${projectRef}`
  );
}

function requireTrustedCa(env: NodeJS.ProcessEnv): void {
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    throw new DeploymentError(
      'PRODUCTION_TLS_NOT_CONFIRMED',
      'Insecure TLS overrides are forbidden for Production.',
    );
  }
  const ca = env.DATABASE_SSL_CA?.replace(/\\n/g, '\n').trim();
  if (
    !ca ||
    !ca.startsWith('-----BEGIN CERTIFICATE-----') ||
    !ca.endsWith('-----END CERTIFICATE-----')
  ) {
    throw new DeploymentError(
      'PRODUCTION_TLS_NOT_CONFIRMED',
      'Production database operations require the approved trusted CA.',
    );
  }
}

function assertProductionEnvironment(env: NodeJS.ProcessEnv): string {
  const projectRef = requiredProjectRef(env);
  if (env.DEPLOY_TARGET_ENV !== 'production' || env.DEPLOY_EXPECTED_PROJECT_REF !== projectRef) {
    throw new DeploymentError(
      'PRODUCTION_TARGET_NOT_CONFIRMED',
      'Deployment must explicitly target the exact Production project.',
    );
  }
  requireTrustedCa(env);
  return projectRef;
}

function assertPlausibleProductionDatabase(
  url: URL,
  projectRef: string,
  port: '5432' | '6543',
): void {
  const direct = url.hostname === `db.${projectRef}.supabase.co`;
  const frankfurtPooler = /^aws-\d+-eu-central-1\.pooler\.supabase\.com$/.test(url.hostname);
  if (
    url.protocol !== 'postgresql:' ||
    url.searchParams.get('sslmode') === 'disable' ||
    url.searchParams.get('ssl') === 'false' ||
    url.port !== port ||
    !targetsProject(url.toString(), projectRef) ||
    (port === '6543' ? !frankfurtPooler : !direct && !frankfurtPooler)
  ) {
    throw new DeploymentError(
      'PRODUCTION_TARGET_NOT_CONFIRMED',
      `Production database target must use the approved eu-central-1 connection on port ${port}.`,
    );
  }
}

export function assertProductionMigrationTarget(env: NodeJS.ProcessEnv): URL {
  const projectRef = assertProductionEnvironment(env);
  const value = z.string().url().safeParse(env.MIGRATION_DATABASE_URL);
  if (!value.success) {
    throw new DeploymentError('INVALID_DEPLOYMENT_CONFIG', 'MIGRATION_DATABASE_URL is required.');
  }
  const url = new URL(value.data);
  assertPlausibleProductionDatabase(url, projectRef, '5432');
  return url;
}

export function assertProductionRuntimeTarget(env: NodeJS.ProcessEnv): URL {
  const projectRef = assertProductionEnvironment(env);
  const value = z.string().url().safeParse(env.DATABASE_URL);
  if (!value.success) {
    throw new DeploymentError('INVALID_DEPLOYMENT_CONFIG', 'DATABASE_URL is required.');
  }
  const url = new URL(value.data);
  assertPlausibleProductionDatabase(url, projectRef, '6543');
  return url;
}

export function parseProductionOrigin(value: string | undefined): URL {
  const parsed = z.string().url().safeParse(value);
  if (!parsed.success) {
    throw new DeploymentError(
      'INVALID_PRODUCTION_ORIGIN',
      'A valid Production origin is required.',
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
    ['localhost', '127.0.0.1', '::1', 'madrasio-staging.vercel.app'].includes(
      url.hostname,
    )
  ) {
    throw new DeploymentError(
      'INVALID_PRODUCTION_ORIGIN',
      'Production origin must be a distinct credential-free HTTPS origin with no path.',
    );
  }
  return url;
}

export function buildProductionCronCommand(path: string): string {
  if (!PRODUCTION_CRON_JOBS.some((job) => job.path === path)) {
    throw new DeploymentError('INVALID_CRON_PATH', 'The Cron path is not approved.');
  }
  return `select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = '${PRODUCTION_VAULT_SECRET_NAMES.origin}') || '${path}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = '${PRODUCTION_VAULT_SECRET_NAMES.jobSecret}')
    ),
    body := '{}'::jsonb
  ) as request_id;`;
}

export function parseProductionCronConfiguration(env: NodeJS.ProcessEnv): {
  migrationUrl: URL;
  origin: URL;
  secret: string;
} {
  if (env.RUN_PRODUCTION_CRON_CONFIGURATION !== PRODUCTION_CRON_CONFIRMATION) {
    throw new DeploymentError(
      'PRODUCTION_CRON_OPT_IN_REQUIRED',
      `Set RUN_PRODUCTION_CRON_CONFIGURATION=${PRODUCTION_CRON_CONFIRMATION} for this operation.`,
    );
  }
  const migrationUrl = assertProductionMigrationTarget(env);
  const origin = parseProductionOrigin(env.PRODUCTION_APP_ORIGIN);
  const secret = env.CRON_SECRET?.trim();
  if (!secret || secret.length < 32 || secret === env.SUPABASE_SECRET_KEY?.trim()) {
    throw new DeploymentError(
      'INVALID_DEPLOYMENT_CONFIG',
      'A strong distinct server-only Production CRON_SECRET is required.',
    );
  }
  return { migrationUrl, origin, secret };
}
