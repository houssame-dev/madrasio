import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  appendSafeBackupFailureSummary,
  appendSafeBackupSummary,
  executeVerifiedBackup,
  parseRetentionClass,
} from './automation';
import { preservePrimaryWithCleanupFailure, safeRecoveryError } from './contracts';
import { createProductionRecoveryBundle } from './create-production-backup';
import { cleanupRecoveryWorkDirectory, createRecoveryWorkDirectory } from './filesystem';
import { CronitorRecoveryHeartbeat } from './heartbeat';
import { R2RecoveryObjectStore } from './r2';

/** Attribution is allowlisted metadata, never authentication or arbitrary log text. */
export function backupTriggerMetadata(env: Readonly<Record<string, string | undefined>>): {
  triggerSource: 'manual' | 'github-schedule' | 'cloudflare-cron-v1';
  scheduledForUtc: string | null;
} {
  const triggerSource = env.RECOVERY_TRIGGER_SOURCE ?? 'manual';
  const timestamp = env.RECOVERY_SCHEDULED_FOR_UTC ?? '';
  if (!['manual', 'github-schedule', 'cloudflare-cron-v1'].includes(triggerSource)) {
    throw new Error('Invalid backup trigger metadata.');
  }
  if (triggerSource === 'cloudflare-cron-v1') {
    const date = new Date(timestamp);
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString() !== timestamp ||
      env.RECOVERY_RETENTION_CLASS !== 'frequent'
    )
      throw new Error('Invalid backup trigger metadata.');
  } else if (timestamp !== '') {
    throw new Error('Invalid backup trigger metadata.');
  }
  return {
    triggerSource: triggerSource as 'manual' | 'github-schedule' | 'cloudflare-cron-v1',
    scheduledForUtc: timestamp || null,
  };
}

async function main(): Promise<void> {
  const metadata = backupTriggerMetadata(process.env);
  const directory = await createRecoveryWorkDirectory();
  const outputPath = resolve(directory, 'production-recovery.age');
  const readbackPath = resolve(directory, 'production-recovery.readback.age');
  let primaryError: unknown;
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
        ...metadata,
        backupId: result.backupId,
        retentionClass: result.retentionClass,
        objectKey: result.objectKey,
        bytes: result.bytes,
        ciphertextSha256: result.ciphertextSha256,
        classification: result.classification,
      })}\n`,
    );
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      await cleanupRecoveryWorkDirectory(directory);
    } catch (cleanupError) {
      primaryError = primaryError
        ? preservePrimaryWithCleanupFailure(primaryError, cleanupError)
        : cleanupError;
    }
  }
  if (primaryError) throw primaryError;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(async (error) => {
    await appendSafeBackupFailureSummary(
      process.env.GITHUB_STEP_SUMMARY,
      process.env.RECOVERY_GIT_SHA ?? '',
      error,
    ).catch(() => undefined);
    process.stderr.write(`${JSON.stringify(safeRecoveryError(error))}\n`);
    process.exitCode = 1;
  });
}
