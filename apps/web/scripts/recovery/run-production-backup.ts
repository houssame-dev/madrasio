import { resolve } from 'node:path';

import { appendSafeBackupSummary, executeVerifiedBackup, parseRetentionClass } from './automation';
import { safeRecoveryError } from './contracts';
import { createProductionRecoveryBundle } from './create-production-backup';
import { cleanupRecoveryWorkDirectory, createRecoveryWorkDirectory } from './filesystem';
import { CronitorRecoveryHeartbeat } from './heartbeat';
import { R2RecoveryObjectStore } from './r2';

async function main(): Promise<void> {
  const directory = await createRecoveryWorkDirectory();
  const outputPath = resolve(directory, 'production-recovery.age');
  const readbackPath = resolve(directory, 'production-recovery.readback.age');
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, RECOVERY_OUTPUT_PATH: outputPath };
    const result = await executeVerifiedBackup({
      retentionClass: parseRetentionClass(env.RECOVERY_RETENTION_CLASS),
      outputPath,
      readbackPath,
      createBundle: () => createProductionRecoveryBundle(env),
      store: new R2RecoveryObjectStore(env),
      heartbeat: new CronitorRecoveryHeartbeat(env.BACKUP_HEARTBEAT_URL),
    });
    await appendSafeBackupSummary(env.GITHUB_STEP_SUMMARY, env.RECOVERY_GIT_SHA ?? '', result);
    process.stdout.write(
      `${JSON.stringify({
        event: 'production_backup_verified',
        backupId: result.backupId,
        retentionClass: result.retentionClass,
        objectKey: result.objectKey,
        bytes: result.bytes,
        ciphertextSha256: result.ciphertextSha256,
        classification: result.classification,
      })}\n`,
    );
  } finally {
    await cleanupRecoveryWorkDirectory(directory);
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify(safeRecoveryError(error))}\n`);
  process.exitCode = 1;
});
