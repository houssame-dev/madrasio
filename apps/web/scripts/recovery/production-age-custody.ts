import {
  realpath,
  stat,
} from 'node:fs/promises';
import {
  isAbsolute,
  relative,
  resolve,
} from 'node:path';

import {
  AGE_RUNTIME_VERSION,
  RecoveryError,
  type RecoveryDiagnostic,
} from './contracts';
import {
  readProductionAgeEscrowReceipt,
  sha256File,
  RECOVERY_EXPECTED_PRODUCTION_AGE_RECIPIENT,
  RECOVERY_PRODUCTION_AGE_ESCROW_PATH,
  RECOVERY_PRODUCTION_AGE_ESCROW_RECEIPT_PATH,
  RECOVERY_PRODUCTION_AGE_PRIMARY_IDENTITY_PATH,
} from './production-age-escrow';
import {
  ExternalToolError,
  RECOVERY_AGE_TOOL_DIRECTORY,
  runCommand,
  validateAgeRecipient,
  type CommandRunner,
} from './tools';

export {
  RECOVERY_EXPECTED_PRODUCTION_AGE_RECIPIENT,
  RECOVERY_PRODUCTION_AGE_ESCROW_PATH,
  RECOVERY_PRODUCTION_AGE_ESCROW_RECEIPT_PATH,
  RECOVERY_PRODUCTION_AGE_PRIMARY_IDENTITY_PATH,
} from './production-age-escrow';

export type ProductionAgeCustodyReadiness = {
  ageVersion: string;
  primaryOutsideRepository: true;
  primaryRecipientMatch: true;
  escrowOutsideRepository: true;
  escrowSha256Match: true;
  recoveryProofVerified: true;
  offDeviceRetrievalVerified: true;
};

export type ProductionAgeCustodyOptions = {
  runner?: CommandRunner;
  repositoryRoot?: string;
  ageToolDirectory?: string;
};

function custodyDiagnostic(
  error: unknown,
  toolCause: RecoveryDiagnostic['toolCause'] =
    'unknown',
): RecoveryDiagnostic {
  if (
    error instanceof ExternalToolError
  ) {
    return {
      phase: 'tool_verification',
      toolCause: error.cause,
      ...(error.exitCode !== undefined
        ? { exitCode: error.exitCode }
        : {}),
      ...(error.signal
        ? { signal: error.signal }
        : {}),
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
  toolCause: RecoveryDiagnostic['toolCause'] =
    'unknown',
): RecoveryError {
  return new RecoveryError(
    'BACKUP_ENCRYPTION_FAILED',
    message,
    custodyDiagnostic(
      error,
      toolCause,
    ),
  );
}

async function resolveExternalFile(
  input: string | undefined,
  repositoryRoot: string,
  label: string,
): Promise<string> {
  const configured =
    input?.trim() ?? '';

  if (
    !configured ||
    !isAbsolute(configured)
  ) {
    throw custodyFailure(
      `An absolute external ${label} path is required.`,
      undefined,
      'filesystem',
    );
  }

  try {
    const [
      repository,
      file,
    ] =
      await Promise.all([
        realpath(
          repositoryRoot,
        ),
        realpath(
          configured,
        ),
      ]);

    const metadata =
      await stat(file);

    if (!metadata.isFile()) {
      throw custodyFailure(
        `The ${label} must be a regular file.`,
        undefined,
        'filesystem',
      );
    }

    const repositoryRelative =
      relative(
        repository,
        file,
      );

    if (
      !repositoryRelative.startsWith(
        '..',
      ) &&
      !isAbsolute(
        repositoryRelative,
      )
    ) {
      throw custodyFailure(
        `The ${label} must remain outside the repository.`,
        undefined,
        'filesystem',
      );
    }

    return file;
  } catch (error) {
    if (
      error instanceof RecoveryError
    ) {
      throw error;
    }

    throw custodyFailure(
      `The external ${label} could not be verified.`,
      error,
      'filesystem',
    );
  }
}

function asCustodyVerificationError(
  error: unknown,
): RecoveryError {
  if (
    error instanceof RecoveryError &&
    error.diagnostic
  ) {
    return error;
  }

  return custodyFailure(
    'Production age identity custody verification failed.',
    error,
  );
}

export async function assertProductionAgeIdentityCustody(
  runtimeEnv: NodeJS.ProcessEnv =
    process.env,
  options: ProductionAgeCustodyOptions = {},
): Promise<ProductionAgeCustodyReadiness> {
  const runner =
    options.runner ?? runCommand;

  const repositoryRoot =
    options.repositoryRoot ??
    resolve(
      process.cwd(),
      '../..',
    );

  let expectedRecipient: string;

  try {
    expectedRecipient =
      validateAgeRecipient(
        runtimeEnv[
          RECOVERY_EXPECTED_PRODUCTION_AGE_RECIPIENT
        ],
      );
  } catch (error) {
    throw asCustodyVerificationError(
      error,
    );
  }

  const primaryIdentity =
    await resolveExternalFile(
      runtimeEnv[
        RECOVERY_PRODUCTION_AGE_PRIMARY_IDENTITY_PATH
      ],
      repositoryRoot,
      'Production age primary identity',
    );

  const escrow =
    await resolveExternalFile(
      runtimeEnv[
        RECOVERY_PRODUCTION_AGE_ESCROW_PATH
      ],
      repositoryRoot,
      'Production age encrypted escrow',
    );

  const receiptPath =
    await resolveExternalFile(
      runtimeEnv[
        RECOVERY_PRODUCTION_AGE_ESCROW_RECEIPT_PATH
      ],
      repositoryRoot,
      'Production age escrow verification receipt',
    );

  const ageToolDirectory =
    options.ageToolDirectory ??
    runtimeEnv[
      RECOVERY_AGE_TOOL_DIRECTORY
    ]?.trim();

  const commandOptions = {
    timeoutMs: 30_000,
    ...(ageToolDirectory
      ? {
          env: {
            [RECOVERY_AGE_TOOL_DIRECTORY]:
              ageToolDirectory,
          },
        }
      : {}),
  };

  try {
    const [
      ageVersion,
      ageKeygenVersion,
    ] =
      await Promise.all([
        runner(
          'age',
          ['--version'],
          commandOptions,
        ),
        runner(
          'age-keygen',
          ['--version'],
          commandOptions,
        ),
      ]);

    if (
      ageVersion.stdout.trim() !==
        AGE_RUNTIME_VERSION ||
      ageKeygenVersion.stdout.trim() !==
        AGE_RUNTIME_VERSION
    ) {
      throw custodyFailure(
        'The reviewed age 1.3.1 runtime is required.',
      );
    }

    const primaryResult =
      await runner(
        'age-keygen',
        [
          '-y',
          primaryIdentity,
        ],
        commandOptions,
      );

    const primaryRecipient =
      validateAgeRecipient(
        primaryResult.stdout,
      );

    if (
      primaryRecipient !==
      expectedRecipient
    ) {
      throw custodyFailure(
        'Production age primary identity does not match the expected public recipient.',
      );
    }

    const [
      escrowSha256,
      receipt,
    ] =
      await Promise.all([
        sha256File(
          escrow,
        ),
        readProductionAgeEscrowReceipt(
          receiptPath,
        ),
      ]);

    if (
      receipt.ageVersion !==
      AGE_RUNTIME_VERSION
    ) {
      throw custodyFailure(
        'Production age escrow verification evidence uses an unexpected age runtime.',
      );
    }

    if (
      receipt.expectedRecipient !==
      expectedRecipient
    ) {
      throw custodyFailure(
        'Production age escrow verification evidence does not match the expected recipient.',
      );
    }

    if (
      receipt.escrowSha256 !==
      escrowSha256
    ) {
      throw custodyFailure(
        'Production age escrow verification evidence does not match the encrypted escrow artifact.',
      );
    }

    if (
      receipt.recoveryProof !==
        'PASS' ||
      receipt.offDeviceRetrieved !==
        true
    ) {
      throw custodyFailure(
        'Production age escrow recovery evidence is incomplete.',
      );
    }

    return {
      ageVersion:
        AGE_RUNTIME_VERSION,
      primaryOutsideRepository:
        true,
      primaryRecipientMatch:
        true,
      escrowOutsideRepository:
        true,
      escrowSha256Match:
        true,
      recoveryProofVerified:
        true,
      offDeviceRetrievalVerified:
        true,
    };
  } catch (error) {
    throw asCustodyVerificationError(
      error,
    );
  }
}