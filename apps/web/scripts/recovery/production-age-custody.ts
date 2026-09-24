import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

import {
  AGE_RUNTIME_VERSION,
  RecoveryError,
  type RecoveryDiagnostic,
} from './contracts';
import {
  ExternalToolError,
  RECOVERY_AGE_TOOL_DIRECTORY,
  runCommand,
  validateAgeRecipient,
  type CommandRunner,
} from './tools';

export const RECOVERY_PRODUCTION_AGE_PRIMARY_IDENTITY_PATH =
  'RECOVERY_PRODUCTION_AGE_PRIMARY_IDENTITY_PATH';

export const RECOVERY_PRODUCTION_AGE_SECONDARY_IDENTITY_PATH =
  'RECOVERY_PRODUCTION_AGE_SECONDARY_IDENTITY_PATH';

export const RECOVERY_EXPECTED_PRODUCTION_AGE_RECIPIENT =
  'RECOVERY_EXPECTED_PRODUCTION_AGE_RECIPIENT';

export type ProductionAgeCustodyReadiness = {
  copyCount: 2;
  ageVersion: string;
  outsideRepository: true;
  distinctCopies: true;
  recipientsMatch: true;
  expectedRecipientMatch: true;
};

export type ProductionAgeCustodyOptions = {
  runner?: CommandRunner;
  repositoryRoot?: string;
  ageToolDirectory?: string;
};

function custodyDiagnostic(
  error: unknown,
  toolCause: RecoveryDiagnostic['toolCause'] = 'unknown',
): RecoveryDiagnostic {
  if (error instanceof ExternalToolError) {
    return {
      phase: 'tool_verification',
      toolCause: error.cause,
      ...(error.exitCode !== undefined ? { exitCode: error.exitCode } : {}),
      ...(error.signal ? { signal: error.signal } : {}),
      timeout: error.timeout,
    };
  }

  return {
    phase: 'tool_verification',
    toolCause,
    timeout: false,
  };
}

function custodyFailure(
  message: string,
  error?: unknown,
  toolCause: RecoveryDiagnostic['toolCause'] = 'unknown',
): RecoveryError {
  return new RecoveryError(
    'BACKUP_ENCRYPTION_FAILED',
    message,
    custodyDiagnostic(error, toolCause),
  );
}

async function resolveExternalIdentityFile(
  input: string | undefined,
  repositoryRoot: string,
): Promise<string> {
  const configured = input?.trim() ?? '';

  if (!configured || !isAbsolute(configured)) {
    throw custodyFailure(
      'An absolute external Production age identity path is required.',
      undefined,
      'filesystem',
    );
  }

  try {
    const [repository, identity] = await Promise.all([
      realpath(repositoryRoot),
      realpath(configured),
    ]);

    const identityStat = await stat(identity);

    if (!identityStat.isFile()) {
      throw custodyFailure(
        'The Production age custody identity must be a regular file.',
        undefined,
        'filesystem',
      );
    }

    const repositoryRelative = relative(repository, identity);

    if (
      !repositoryRelative.startsWith('..') &&
      !isAbsolute(repositoryRelative)
    ) {
      throw custodyFailure(
        'Production age custody identities must remain outside the repository.',
        undefined,
        'filesystem',
      );
    }

    return identity;
  } catch (error) {
    if (error instanceof RecoveryError) {
      throw error;
    }

    throw custodyFailure(
      'The external Production age custody identity could not be verified.',
      error,
      'filesystem',
    );
  }
}

function asCustodyVerificationError(error: unknown): RecoveryError {
  if (error instanceof RecoveryError && error.diagnostic) {
    return error;
  }

  return custodyFailure(
    'Production age identity custody verification failed.',
    error,
  );
}

export async function assertProductionAgeIdentityCustody(
  runtimeEnv: NodeJS.ProcessEnv = process.env,
  options: ProductionAgeCustodyOptions = {},
): Promise<ProductionAgeCustodyReadiness> {
  const runner = options.runner ?? runCommand;

  const repositoryRoot =
    options.repositoryRoot ?? resolve(process.cwd(), '../..');

  let expectedRecipient: string;

  try {
    expectedRecipient = validateAgeRecipient(
      runtimeEnv[RECOVERY_EXPECTED_PRODUCTION_AGE_RECIPIENT],
    );
  } catch (error) {
    throw asCustodyVerificationError(error);
  }

  const primaryIdentity = await resolveExternalIdentityFile(
    runtimeEnv[RECOVERY_PRODUCTION_AGE_PRIMARY_IDENTITY_PATH],
    repositoryRoot,
  );

  const secondaryIdentity = await resolveExternalIdentityFile(
    runtimeEnv[RECOVERY_PRODUCTION_AGE_SECONDARY_IDENTITY_PATH],
    repositoryRoot,
  );

  if (primaryIdentity === secondaryIdentity) {
    throw custodyFailure(
      'Two distinct Production age custody identity copies are required.',
      undefined,
      'filesystem',
    );
  }

  const ageToolDirectory =
    options.ageToolDirectory ??
    runtimeEnv[RECOVERY_AGE_TOOL_DIRECTORY]?.trim();

  const commandOptions = {
    timeoutMs: 30_000,
    ...(ageToolDirectory
      ? {
          env: {
            [RECOVERY_AGE_TOOL_DIRECTORY]: ageToolDirectory,
          },
        }
      : {}),
  };

  try {
    const version = await runner(
      'age-keygen',
      ['--version'],
      commandOptions,
    );

    if (version.stdout.trim() !== AGE_RUNTIME_VERSION) {
      throw custodyFailure(
        'The reviewed age-keygen runtime version is required.',
      );
    }

    const primaryResult = await runner(
      'age-keygen',
      ['-y', primaryIdentity],
      commandOptions,
    );

    const secondaryResult = await runner(
      'age-keygen',
      ['-y', secondaryIdentity],
      commandOptions,
    );

    const primaryRecipient =
      validateAgeRecipient(primaryResult.stdout);

    const secondaryRecipient =
      validateAgeRecipient(secondaryResult.stdout);

    if (primaryRecipient !== secondaryRecipient) {
      throw custodyFailure(
        'Production age custody copies derive different public recipients.',
      );
    }

    if (primaryRecipient !== expectedRecipient) {
      throw custodyFailure(
        'Production age custody does not match the expected public recipient.',
      );
    }

    return {
      copyCount: 2,
      ageVersion: AGE_RUNTIME_VERSION,
      outsideRepository: true,
      distinctCopies: true,
      recipientsMatch: true,
      expectedRecipientMatch: true,
    };
  } catch (error) {
    throw asCustodyVerificationError(error);
  }
}