import { appendFile } from 'node:fs/promises';

import { RecoveryError } from './contracts';
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
  try {
    const bundle = await input.createBundle();
    const objectKey = createRecoveryObjectKey(input.retentionClass, bundle);
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
    if (!recoveryPointVerified) {
      const code = error instanceof RecoveryError ? error.code : 'RECOVERY_OPERATION_FAILED';
      await input.heartbeat.failure({ code, failedAt: now().toISOString() }).catch(() => undefined);
    }
    throw error;
  }
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
