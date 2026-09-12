import { z } from 'zod';

import { assertProductionMigrationTarget } from '../deployment/production-contracts';
import { DeploymentError, STAGING_PROJECT_REF } from '../deployment/contracts';

export const RECOVERY_FORMAT = 'madrasio-recovery-v1' as const;
export const PROVIDER_CONTRACT_VERSION = 1 as const;
export const RESTORE_CONFIRMATION = 'RESTORE_ISOLATED_LOCAL' as const;
export const PRODUCTION_POSTGRES_MAJOR = 17;
export const PINNED_TOOLS = {
  postgres: '17.6',
  age: '1.3.1',
  supabaseCli: '2.111.0',
} as const;

/** One authoritative durable application-data allowlist (migration 0015 parity). */
export const APPLICATION_TABLES = [
  'academic_periods',
  'academic_years',
  'announcement_publications',
  'announcement_targets',
  'announcement_versions',
  'announcements',
  'annual_results',
  'assessments',
  'attendance_records',
  'classes',
  'curricula',
  'curriculum_subjects',
  'curriculum_versions',
  'gradebooks',
  'grades',
  'grading_configuration_versions',
  'grading_configurations',
  'homework',
  'homework_submissions',
  'homework_targets',
  'levels',
  'notifications',
  'outbox_events',
  'parent_students',
  'parents',
  'period_results',
  'publication_recipient_snapshots',
  'result_publications',
  'school_memberships',
  'schools',
  'stages',
  'student_enrollments',
  'students',
  'subject_results',
  'subjects',
  'teacher_assignments',
  'teachers',
  'tracks',
  'users',
] as const;

export const AUTH_TABLES = ['users', 'identities'] as const;
export const RECOVERY_TABLES = [
  ...AUTH_TABLES.map((table) => `auth.${table}`),
  ...APPLICATION_TABLES.map((table) => `public.${table}`),
] as const;

export const EXCLUDED_AUTH_TABLES = [
  'audit_log_entries',
  'flow_state',
  'mfa_amr_claims',
  'mfa_challenges',
  'one_time_tokens',
  'refresh_tokens',
  'sessions',
  'webauthn_challenges',
] as const;

/** Supabase-owned empty/version foundation, recreated by the target platform. */
export const AUTH_FOUNDATION_TABLES = ['instances', 'schema_migrations'] as const;

/** Non-empty state here requires a reviewed extension of the recovery format. */
export const UNSUPPORTED_DURABLE_AUTH_TABLES = [
  'custom_oauth_providers',
  'hooks',
  'hook_payloads',
  'mfa_factors',
  'oauth_authorizations',
  'oauth_clients',
  'oauth_consents',
  'saml_providers',
  'sso_domains',
  'sso_providers',
  'webauthn_credentials',
] as const;

export type RecoveryFailureCode =
  | 'BACKUP_TARGET_VERIFICATION_FAILED'
  | 'BACKUP_SNAPSHOT_FAILED'
  | 'BACKUP_APPLICATION_EXPORT_FAILED'
  | 'BACKUP_AUTH_EXPORT_FAILED'
  | 'BACKUP_AUTH_FEATURE_STATE_UNSUPPORTED'
  | 'BACKUP_INVENTORY_VALIDATION_FAILED'
  | 'BACKUP_FINGERPRINT_FAILED'
  | 'BACKUP_MANIFEST_FAILED'
  | 'BACKUP_ENCRYPTION_FAILED'
  | 'BACKUP_UPLOAD_FAILED'
  | 'BACKUP_REMOTE_VERIFICATION_FAILED'
  | 'BACKUP_HEARTBEAT_FAILED'
  | 'BACKUP_PLAINTEXT_CLEANUP_FAILED'
  | 'BACKUP_RECOVERY_POINT_STALE'
  | 'RESTORE_TARGET_REJECTED'
  | 'RESTORE_MANIFEST_INVALID'
  | 'RESTORE_DECRYPTION_FAILED'
  | 'RESTORE_AUTH_SCHEMA_INCOMPATIBLE'
  | 'RESTORE_DATA_FAILED'
  | 'RESTORE_RECONCILIATION_FAILED'
  | 'RESTORE_SECURITY_VERIFICATION_FAILED';

export class RecoveryError extends Error {
  constructor(
    public readonly code: RecoveryFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'RecoveryError';
  }
}

export function assertProductionBackupTarget(env: NodeJS.ProcessEnv): URL {
  try {
    return assertProductionMigrationTarget(env);
  } catch {
    throw new RecoveryError(
      'BACKUP_TARGET_VERIFICATION_FAILED',
      'The exact verified-TLS Production Session Pooler target is required.',
    );
  }
}

export function assertIsolatedRestoreTarget(env: NodeJS.ProcessEnv): URL {
  const parsed = z.string().url().safeParse(env.RESTORE_DATABASE_URL);
  let url: URL;
  try {
    url = parsed.success ? new URL(parsed.data) : new URL('invalid:');
  } catch {
    url = new URL('invalid:');
  }
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
  const containsProviderRef = [env.PRODUCTION_EXPECTED_PROJECT_REF, STAGING_PROJECT_REF]
    .filter(Boolean)
    .some((ref) => url.href.includes(String(ref)));
  if (
    env.RESTORE_TARGET_ENV !== 'isolated-local' ||
    env.RESTORE_CONFIRMATION !== RESTORE_CONFIRMATION ||
    env.DEPLOY_TARGET_ENV === 'production' ||
    env.DEPLOY_TARGET_ENV === 'staging' ||
    url.protocol !== 'postgresql:' ||
    !localHosts.has(url.hostname) ||
    containsProviderRef ||
    url.hostname.endsWith('.supabase.com') ||
    url.hostname.endsWith('.supabase.co')
  ) {
    throw new RecoveryError(
      'RESTORE_TARGET_REJECTED',
      'Restore is permitted only for an explicitly confirmed isolated local target.',
    );
  }
  return url;
}

export function safeRecoveryError(error: unknown): { code: string; message: string } {
  if (error instanceof RecoveryError) return { code: error.code, message: error.message };
  if (error instanceof DeploymentError) return { code: error.code, message: error.message };
  return { code: 'RECOVERY_OPERATION_FAILED', message: 'The recovery operation failed.' };
}
