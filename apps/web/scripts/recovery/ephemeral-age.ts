import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
  RecoveryError,
  preservePrimaryWithCleanupFailure,
  type RecoveryDiagnostic,
} from './contracts';
import {
  cleanupRecoveryWorkDirectory,
  createRecoveryWorkDirectory,
} from './filesystem';
import {
  ExternalToolError,
  runCommand,
  validateAgeRecipient,
  type CommandRunner,
} from './tools';

const IDENTITY_FILENAME = 'age-identity.txt';

export type EphemeralAgeIdentity = {
  workspacePath: string;
  identityPath: string;
  recipient: string;
};

function keyGenerationDiagnostic(error: unknown): RecoveryDiagnostic {
  if (!(error instanceof ExternalToolError)) {
    return { phase: 'key_generation', toolCause: 'unknown', timeout: false };
  }
  return {
    phase: 'key_generation',
    toolCause: error.cause,
    ...(error.exitCode !== undefined ? { exitCode: error.exitCode } : {}),
    ...(error.signal ? { signal: error.signal } : {}),
    timeout: error.timeout,
  };
}

function asKeyGenerationError(error: unknown): RecoveryError {
  if (error instanceof RecoveryError) return error;
  return new RecoveryError(
    'BACKUP_ENCRYPTION_FAILED',
    'Ephemeral age identity generation failed.',
    keyGenerationDiagnostic(error),
  );
}

/** Creates a temporary Stage-6 identity without returning or logging private key material. */
export async function createEphemeralAgeIdentity(
  runner: CommandRunner = runCommand,
): Promise<EphemeralAgeIdentity> {
  let workspacePath: string | undefined;
  try {
    workspacePath = await createRecoveryWorkDirectory();
    const identityPath = join(workspacePath, IDENTITY_FILENAME);
    await runner('age-keygen', ['--output', identityPath], { timeoutMs: 30_000 });
    const identity = await readFile(identityPath, 'utf8');
    const candidate = /^# public key: (age1\S+)$/m.exec(identity)?.[1];
    if (!candidate) {
      throw new RecoveryError(
        'BACKUP_ENCRYPTION_FAILED',
        'Ephemeral age identity did not contain a valid recipient.',
        { phase: 'key_generation', toolCause: 'unknown', timeout: false },
      );
    }
    const recipient = validateAgeRecipient(candidate);
    return { workspacePath, identityPath, recipient };
  } catch (error) {
    const primary = asKeyGenerationError(error);
    if (workspacePath) {
      try {
        await cleanupRecoveryWorkDirectory(workspacePath);
      } catch (cleanupError) {
        throw preservePrimaryWithCleanupFailure(primary, cleanupError);
      }
    }
    throw primary;
  }
}

export async function cleanupEphemeralAgeIdentity(
  identity: Pick<EphemeralAgeIdentity, 'workspacePath' | 'identityPath'>,
): Promise<void> {
  if (resolve(identity.identityPath) !== resolve(identity.workspacePath, IDENTITY_FILENAME)) {
    throw new RecoveryError(
      'BACKUP_PLAINTEXT_CLEANUP_FAILED',
      'Refused cleanup for an invalid ephemeral age identity location.',
      { phase: 'cleanup', timeout: false },
    );
  }
  await cleanupRecoveryWorkDirectory(identity.workspacePath);
}
