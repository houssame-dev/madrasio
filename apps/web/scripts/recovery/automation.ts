import { appendFile } from 'node:fs/promises';

import { RecoveryError, safeRecoveryError, withRecoveryOperationState } from './contracts';
import type { ProductionRecoveryBundle } from './create-production-backup';
import type { RecoveryHeartbeat, RecoveryObjectStore } from './operations';
import { uploadAndVerify } from './operations';

export type RetentionClass = 'frequent' | 'weekly';
export type VerifiedRecoveryPoint = ProductionRecoveryBundle & {
  objectKey: string;
  retentionClass: RetentionClass;
  classification: 'PRODUCTION_BACKUP_RECOVERY_POINT_VERIFIED';
};

export function parseRetentionClass(value: string | undefined): RetentionClass {
  if (value !== 'frequent' && value !== 'weekly') {
    throw new RecoveryError('BACKUP_MANIFEST_FAILED', 'A reviewed retention class is required.');
  }
  return value;
}

export function createRecoveryObjectKey(
  retentionClass: RetentionClass,
  bundle: Pick<ProductionRecoveryBundle, 'backupId' | 'snapshotAt'>,
): string {
  const date = new Date(bundle.snapshotAt);
  if (!Number.isFinite(date.valueOf()) || !/^\d{8}T\d{6}Z-[a-f0-9-]+$/.test(bundle.backupId)) {
    throw new RecoveryError('BACKUP_MANIFEST_FAILED', 'Recovery object metadata is invalid.');
  }
  const [year, month, day] = date.toISOString().slice(0, 10).split('-');
  return `${retentionClass}/${year}/${month}/${day}/${bundle.backupId}.age`;
}

export async function executeVerifiedBackup(input: {
  retentionClass: RetentionClass;
  outputPath: string;
  readbackPath: string;
  createBundle: () => Promise<ProductionRecoveryBundle>;
  store: RecoveryObjectStore;
  heartbeat: RecoveryHeartbeat;
  now?: () => Date;
}): Promise<VerifiedRecoveryPoint> {
  const now = input.now ?? (() => new Date());
  let recoveryPointVerified = false;
  let r2UploadBegan = false;
  let heartbeatSuccessSent = false;
  let failureHeartbeatSent = false;
  try {
    const bundle = await input.createBundle();
    const objectKey = createRecoveryObjectKey(input.retentionClass, bundle);
    r2UploadBegan = true;
    await uploadAndVerify(
      input.store,
      {
        key: objectKey,
        bodyPath: input.outputPath,
        bytes: bundle.bytes,
        sha256: bundle.ciphertextSha256,
      },
      input.readbackPath,
    );
    recoveryPointVerified = true;
    try {
      await input.heartbeat.success({
        backupId: bundle.backupId,
        ciphertextSha256: bundle.ciphertextSha256,
        completedAt: now().toISOString(),
      });
      heartbeatSuccessSent = true;
    } catch {
      throw new RecoveryError(
        'BACKUP_HEARTBEAT_FAILED',
        'The recovery point is verified, but monitoring telemetry failed.',
      );
    }
    return {
      ...bundle,
      objectKey,
      retentionClass: input.retentionClass,
      classification: 'PRODUCTION_BACKUP_RECOVERY_POINT_VERIFIED',
    };
  } catch (error) {
    const safe = safeRecoveryError(error);
    const enriched = withRecoveryOperationState(error, {
      dbAccessBegan:
        safe.dbAccessBegan ??
        (!!safe.phase && !['target_verification', 'tool_verification'].includes(safe.phase)),
      r2UploadBegan,
      heartbeatSuccessSent,
    });
    if (!recoveryPointVerified) {
      const code = enriched.code;
      if (!failureHeartbeatSent) {
        failureHeartbeatSent = true;
        await input.heartbeat.failure({ code, failedAt: now().toISOString() }).catch(() => undefined);
      }
    }
    throw enriched;
  }
}

export async function appendSafeBackupFailureSummary(
  path: string | undefined,
  gitSha: string,
  error: unknown,
): Promise<void> {
  if (!path) return;
  const safe = safeRecoveryError(error);
  const lines = [
    '## Failed Production recovery attempt',
    '',
    `- Candidate SHA: \`${/^[a-f0-9]{40}$/.test(gitSha) ? gitSha : '<invalid>'}\``,
    `- Classification: \`${safe.code}\``,
    `- Phase: \`${safe.phase ?? 'unknown'}\``,
    ...(safe.sqlState ? [`- SQLSTATE: \`${safe.sqlState}\``] : []),
    ...(safe.exitCode !== undefined ? [`- Exit code: \`${safe.exitCode}\``] : []),
    ...(safe.signal ? [`- Signal: \`${safe.signal}\``] : []),
    `- Timeout: \`${safe.timeout ?? false}\``,
    `- Database access began: \`${safe.dbAccessBegan ?? false}\``,
    `- R2 upload began: \`${safe.r2UploadBegan ?? false}\``,
    `- Heartbeat success sent: \`${safe.heartbeatSuccessSent ?? false}\``,
    ...(safe.cleanupWarning ? [`- Cleanup warning: \`${safe.cleanupWarning}\``] : []),
    '',
  ];
  await appendFile(path, lines.join('\n'), { encoding: 'utf8' });
}

export async function appendSafeBackupSummary(
  path: string | undefined,
  gitSha: string,
  result: VerifiedRecoveryPoint,
): Promise<void> {
  if (!path) return;
  const lines = [
    '## Verified Production recovery point',
    '',
    `- Backup ID: \`${result.backupId}\``,
    `- Retention class: \`${result.retentionClass}\``,
    `- Source Git SHA: \`${gitSha}\``,
    `- Snapshot UTC: \`${result.snapshotAt}\``,
    `- Application tables: \`${result.applicationTableCount}\``,
    `- Auth users: \`${result.authUserCount}\``,
    `- Encrypted bytes: \`${result.bytes}\``,
    `- Ciphertext SHA-256: \`${result.ciphertextSha256}\``,
    `- R2 object: \`${result.objectKey}\``,
    `- Result: \`${result.classification}\``,
    '',
  ];
  await appendFile(path, lines.join('\n'), { encoding: 'utf8' });
}
