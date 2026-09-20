import { z } from 'zod';

import { assertProductionMigrationTarget } from '../deployment/production-contracts';
import {
  DeploymentError,
  STAGING_PROJECT_REF,
  assertStagingMigrationTarget,
} from '../deployment/contracts';

export const RECOVERY_FORMAT = 'madrasio-recovery-v1' as const;
export const PROVIDER_CONTRACT_VERSION = 1 as const;
export const RESTORE_CONFIRMATION = 'RESTORE_ISOLATED_LOCAL' as const;
export const PRODUCTION_POSTGRES_MAJOR = 17;
export const PINNED_TOOLS = {
  postgres: '17.6',
  age: '1.3.1',
  supabaseCli: '2.111.0',
} as const;
export const AGE_RUNTIME_VERSION = `v${PINNED_TOOLS.age}`;

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

/** Durable Auth identity state included in the recovery archive. */
export const AUTH_TABLES = ['users', 'identities'] as const;
export const RECOVERY_TABLES = [
  ...AUTH_TABLES.map((table) => `auth.${table}`),
  ...APPLICATION_TABLES.map((table) => `public.${table}`),
] as const;

/** Known in-flight/session Auth state that is intentionally not disaster-recovered. */
export const TRANSIENT_AUTH_TABLES = [
  'flow_state',
  'mfa_amr_claims',
  'mfa_challenges',
  'oauth_client_states',
  'one_time_tokens',
  'refresh_tokens',
  'saml_relay_states',
  'sessions',
  'webauthn_challenges',
] as const;

/** Supabase-owned foundation/version/audit metadata outside application recovery authority. */
export const PLATFORM_MANAGED_AUTH_TABLES = [
  'audit_log_entries',
  'instances',
  'schema_migrations',
] as const;

/** Non-empty state here requires a reviewed extension of the recovery format. */
export const UNSUPPORTED_DURABLE_AUTH_TABLES = [
  'custom_oauth_providers',
  'hooks',
  'hook_payloads',
  'mfa_factors',
  'mfa_recovery_code_sets',
  'mfa_recovery_codes',
  'oauth_authorizations',
  'oauth_clients',
  'oauth_consents',
  'saml_providers',
  'scim_tokens',
  'scim_users',
  'sso_domains',
  'sso_providers',
  'webauthn_credentials',
] as const;

export const AUTH_RECOVERY_CLASS = {
  DURABLE_INCLUDED: 'DURABLE_INCLUDED',
  KNOWN_TRANSIENT_EXCLUDED: 'KNOWN_TRANSIENT_EXCLUDED',
  KNOWN_DURABLE_UNSUPPORTED: 'KNOWN_DURABLE_UNSUPPORTED',
  PLATFORM_MANAGED_EXCLUDED: 'PLATFORM_MANAGED_EXCLUDED',
  UNKNOWN: 'UNKNOWN',
} as const;

export type AuthRecoveryClass = (typeof AUTH_RECOVERY_CLASS)[keyof typeof AUTH_RECOVERY_CLASS];

export function classifyAuthTable(table: string): AuthRecoveryClass {
  if ((AUTH_TABLES as readonly string[]).includes(table))
    return AUTH_RECOVERY_CLASS.DURABLE_INCLUDED;
  if ((TRANSIENT_AUTH_TABLES as readonly string[]).includes(table))
    return AUTH_RECOVERY_CLASS.KNOWN_TRANSIENT_EXCLUDED;
  if ((UNSUPPORTED_DURABLE_AUTH_TABLES as readonly string[]).includes(table))
    return AUTH_RECOVERY_CLASS.KNOWN_DURABLE_UNSUPPORTED;
  if ((PLATFORM_MANAGED_AUTH_TABLES as readonly string[]).includes(table))
    return AUTH_RECOVERY_CLASS.PLATFORM_MANAGED_EXCLUDED;
  return AUTH_RECOVERY_CLASS.UNKNOWN;
}

export type RecoveryFailureCode =
  | 'BACKUP_TARGET_VERIFICATION_FAILED'
  | 'BACKUP_SNAPSHOT_FAILED'
  | 'BACKUP_DB_CONNECTION_FAILED'
  | 'BACKUP_READ_ONLY_TRANSACTION_FAILED'
  | 'BACKUP_SNAPSHOT_EXPORT_FAILED'
  | 'BACKUP_SNAPSHOT_IMPORT_FAILED'
  | 'BACKUP_SNAPSHOT_COORDINATOR_LOST'
  | 'BACKUP_SNAPSHOT_CONSUMER_FAILED'
  | 'BACKUP_AUTH_INVENTORY_FAILED'
  | 'BACKUP_APPLICATION_INVENTORY_FAILED'
  | 'BACKUP_PG_DUMP_START_FAILED'
  | 'BACKUP_PG_DUMP_CONNECTION_FAILED'
  | 'BACKUP_PG_DUMP_SNAPSHOT_FAILED'
  | 'BACKUP_ARCHIVE_CREATION_FAILED'
  | 'BACKUP_ARCHIVE_INSPECTION_FAILED'
  | 'BACKUP_MIGRATION_METADATA_FAILED'
  | 'BACKUP_SERVER_METADATA_FAILED'
  | 'BACKUP_MANIFEST_VALIDATION_FAILED'
  | 'BACKUP_MANIFEST_WRITE_FAILED'
  | 'BACKUP_BUNDLE_CHECKSUM_FAILED'
  | 'BACKUP_BUNDLE_WRITE_FAILED'
  | 'BACKUP_OPERATION_TIMEOUT'
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
  | 'RESTORE_PACKAGE_MANAGER_LAUNCH_FAILED'
  | 'RESTORE_DATA_FAILED'
  | 'RESTORE_RECONCILIATION_FAILED'
  | 'RESTORE_SECURITY_VERIFICATION_FAILED'
  | 'LOCAL_RESTORE_TARGET_BROAD_BINDING';

export const RECOVERY_PHASES = [
  'target_verification',
  'tool_verification',
  'coordinator_connection',
  'read_only_transaction',
  'snapshot_export',
  'snapshot_consumer_connection',
  'snapshot_import',
  'snapshot_consumer_query',
  'coordinator_commit',
  'application_inventory',
  'auth_inventory',
  'fingerprint',
  'pg_dump_start',
  'pg_dump_connection',
  'pg_dump_snapshot',
  'archive_creation',
  'archive_inspection',
  'archive_inventory',
  'migration_launch',
  'manifest_metadata',
  'server_metadata',
  'manifest_validation',
  'manifest_write',
  'bundle_checksum',
  'bundle_write',
  'encryption',
  'r2_upload',
  'r2_readback',
  'heartbeat',
  'cleanup',
] as const;

export type RecoveryPhase = (typeof RECOVERY_PHASES)[number];
export type RecoveryDiagnostic = {
  phase: RecoveryPhase;
  sqlState?: string;
  exitCode?: number;
  signal?: string;
  timeout?: boolean;
  cleanupWarning?: 'BACKUP_PLAINTEXT_CLEANUP_FAILED';
  dbAccessBegan?: boolean;
  r2UploadBegan?: boolean;
  heartbeatSuccessSent?: boolean;
};

export class RecoveryError extends Error {
  constructor(
    public readonly code: RecoveryFailureCode,
    message: string,
    public readonly diagnostic?: RecoveryDiagnostic,
  ) {
    super(message);
    this.name = 'RecoveryError';
  }
}

export function postgresDiagnostic(error: unknown, phase: RecoveryPhase): RecoveryDiagnostic {
  const code = (error as { code?: unknown } | null)?.code;
  return {
    phase,
    ...(typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? { sqlState: code } : {}),
    timeout: isPostgresTimeout(error),
  };
}

export function isPostgresTimeout(error: unknown): boolean {
  const candidate = error as { code?: unknown; name?: unknown; message?: unknown } | null;
  return (
    candidate?.code === '57014' ||
    candidate?.name === 'QueryReadTimeoutError' ||
    (typeof candidate?.message === 'string' &&
      /(?:connection|query|statement).*timed? ?out/i.test(candidate.message))
  );
}

export function isPostgresConnectionLoss(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && (/^08[A-Z0-9]{3}$/.test(code) || code === '57P01');
}

export function preservePrimaryWithCleanupFailure(
  primary: unknown,
  cleanup: unknown,
): RecoveryError {
  if (!(primary instanceof RecoveryError)) {
    return cleanup instanceof RecoveryError
      ? cleanup
      : new RecoveryError('BACKUP_PLAINTEXT_CLEANUP_FAILED', 'Temporary recovery cleanup failed.', {
          phase: 'cleanup',
          timeout: false,
        });
  }
  return new RecoveryError(primary.code, primary.message, {
    phase: primary.diagnostic?.phase ?? 'cleanup',
    ...(primary.diagnostic ?? {}),
    cleanupWarning: 'BACKUP_PLAINTEXT_CLEANUP_FAILED',
  });
}

export function withRecoveryOperationState(
  error: unknown,
  state: Pick<RecoveryDiagnostic, 'dbAccessBegan' | 'r2UploadBegan' | 'heartbeatSuccessSent'>,
): RecoveryError {
  const current =
    error instanceof RecoveryError
      ? error
      : new RecoveryError('BACKUP_SNAPSHOT_FAILED', 'The recovery operation failed.');
  return new RecoveryError(current.code, current.message, {
    phase: current.diagnostic?.phase ?? 'target_verification',
    ...(current.diagnostic ?? {}),
    ...state,
  });
}

export function assertProductionBackupTarget(env: NodeJS.ProcessEnv): URL {
  try {
    return assertProductionMigrationTarget(env);
  } catch {
    throw new RecoveryError(
      'BACKUP_TARGET_VERIFICATION_FAILED',
      'The exact verified-TLS Production Session Pooler target is required.',
      { phase: 'target_verification', timeout: false },
    );
  }
}

export function assertStagingRecoveryTarget(env: NodeJS.ProcessEnv): URL {
  try {
    if (
      env.DEPLOY_TARGET_ENV !== 'staging' ||
      env.STAGING_EXPECTED_PROJECT_REF !== STAGING_PROJECT_REF ||
      !env.DATABASE_SSL_CA?.trim()
    ) {
      throw new Error('STAGING recovery target is not confirmed.');
    }
    return assertStagingMigrationTarget({
      ...env,
      DEPLOY_EXPECTED_PROJECT_REF: env.STAGING_EXPECTED_PROJECT_REF,
    });
  } catch {
    throw new RecoveryError(
      'BACKUP_TARGET_VERIFICATION_FAILED',
      'The exact verified-TLS STAGING Session Pooler target is required.',
      { phase: 'target_verification', timeout: false, dbAccessBegan: false },
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

export function safeRecoveryError(error: unknown): {
  code: string;
  message: string;
  phase?: RecoveryPhase;
  sqlState?: string;
  exitCode?: number;
  signal?: string;
  timeout?: boolean;
  cleanupWarning?: 'BACKUP_PLAINTEXT_CLEANUP_FAILED';
  dbAccessBegan?: boolean;
  r2UploadBegan?: boolean;
  heartbeatSuccessSent?: boolean;
} {
  if (error instanceof RecoveryError) {
    const diagnostic = error.diagnostic;
    const phase =
      diagnostic && RECOVERY_PHASES.includes(diagnostic.phase as RecoveryPhase)
        ? diagnostic.phase
        : undefined;
    const sqlState =
      diagnostic?.sqlState && /^[0-9A-Z]{5}$/.test(diagnostic.sqlState)
        ? diagnostic.sqlState
        : undefined;
    const exitCode =
      diagnostic?.exitCode !== undefined &&
      Number.isSafeInteger(diagnostic.exitCode) &&
      diagnostic.exitCode >= 0 &&
      diagnostic.exitCode <= 255
        ? diagnostic.exitCode
        : undefined;
    const signal =
      diagnostic?.signal && /^SIG[A-Z0-9]+$/.test(diagnostic.signal)
        ? diagnostic.signal
        : undefined;
    return {
      code: error.code,
      message: 'The recovery operation failed.',
      ...(diagnostic
        ? {
            ...(phase ? { phase } : {}),
            ...(sqlState ? { sqlState } : {}),
            ...(exitCode !== undefined ? { exitCode } : {}),
            ...(signal ? { signal } : {}),
            timeout: diagnostic.timeout ?? false,
            ...(diagnostic.cleanupWarning ? { cleanupWarning: diagnostic.cleanupWarning } : {}),
            ...(diagnostic.dbAccessBegan !== undefined
              ? { dbAccessBegan: diagnostic.dbAccessBegan }
              : {}),
            ...(diagnostic.r2UploadBegan !== undefined
              ? { r2UploadBegan: diagnostic.r2UploadBegan }
              : {}),
            ...(diagnostic.heartbeatSuccessSent !== undefined
              ? { heartbeatSuccessSent: diagnostic.heartbeatSuccessSent }
              : {}),
          }
        : {}),
    };
  }
  if (error instanceof DeploymentError) return { code: error.code, message: error.message };
  return { code: 'RECOVERY_OPERATION_FAILED', message: 'The recovery operation failed.' };
}
