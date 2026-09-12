import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import { RecoveryError } from './contracts';

export type EncryptedBackupObject = { key: string; bytes: number; sha256: string };

/** Stage 2 boundary only; implementations arrive after provider provisioning. */
export interface RecoveryObjectStore {
  putImmutable(input: EncryptedBackupObject & { bodyPath: string }): Promise<void>;
  head(key: string): Promise<EncryptedBackupObject | null>;
  download(key: string, destination: string): Promise<void>;
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
  object: EncryptedBackupObject & { bodyPath: string },
  readbackPath: string,
): Promise<EncryptedBackupObject> {
  try {
    await store.putImmutable(object);
  } catch {
    throw new RecoveryError('BACKUP_UPLOAD_FAILED', 'Encrypted recovery upload failed.');
  }
  const remote = await store.head(object.key);
  if (!remote || remote.bytes !== object.bytes || remote.sha256 !== object.sha256) {
    throw new RecoveryError(
      'BACKUP_REMOTE_VERIFICATION_FAILED',
      'Encrypted recovery object failed remote verification.',
    );
  }
  try {
    await store.download(object.key, readbackPath);
    const downloaded = await stat(readbackPath);
    const hash = createHash('sha256');
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(readbackPath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', resolve);
    });
    if (downloaded.size !== object.bytes || hash.digest('hex') !== object.sha256) {
      throw new Error('mismatch');
    }
  } catch {
    throw new RecoveryError(
      'BACKUP_REMOTE_VERIFICATION_FAILED',
      'Encrypted recovery readback failed independent size or checksum verification.',
    );
  }
  return remote;
}
