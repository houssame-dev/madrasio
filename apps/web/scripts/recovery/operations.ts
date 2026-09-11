export type EncryptedBackupObject = { key: string; bytes: number; sha256: string };

/** Stage 2 boundary only; implementations arrive after provider provisioning. */
export interface RecoveryObjectStore {
  putImmutable(input: EncryptedBackupObject & { bodyPath: string }): Promise<void>;
  head(key: string): Promise<EncryptedBackupObject | null>;
}

export interface RecoveryHeartbeat {
  success(input: {
    backupId: string;
    ciphertextSha256: string;
    completedAt: string;
  }): Promise<void>;
  failure(input: { code: string; failedAt: string }): Promise<void>;
}

export async function uploadAndVerify(
  store: RecoveryObjectStore,
  heartbeat: RecoveryHeartbeat,
  object: EncryptedBackupObject & { bodyPath: string; backupId: string },
): Promise<void> {
  try {
    await store.putImmutable(object);
  } catch {
    await heartbeat.failure({
      code: 'BACKUP_UPLOAD_FAILED',
      failedAt: new Date().toISOString(),
    });
    throw new RecoveryError('BACKUP_UPLOAD_FAILED', 'Encrypted recovery upload failed.');
  }
  const remote = await store.head(object.key);
  if (!remote || remote.bytes !== object.bytes || remote.sha256 !== object.sha256) {
    await heartbeat.failure({
      code: 'BACKUP_REMOTE_VERIFICATION_FAILED',
      failedAt: new Date().toISOString(),
    });
    throw new RecoveryError(
      'BACKUP_REMOTE_VERIFICATION_FAILED',
      'Encrypted recovery object failed remote verification.',
    );
  }
  await heartbeat.success({
    backupId: object.backupId,
    ciphertextSha256: object.sha256,
    completedAt: new Date().toISOString(),
  });
}
import { RecoveryError } from './contracts';
