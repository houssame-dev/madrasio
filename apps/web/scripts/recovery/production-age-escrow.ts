import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';

import { z } from 'zod';

import {
  AGE_RUNTIME_VERSION,
  RecoveryError,
  type RecoveryDiagnostic,
} from './contracts';
import {
  cleanupRecoveryWorkDirectory,
  createRecoveryWorkDirectory,
} from './filesystem';
import {
  ExternalToolError,
  RECOVERY_AGE_TOOL_DIRECTORY,
  classifySpawnFailureCause,
  resolveAgeToolInvocation,
  runCommand,
  validateAgeRecipient,
  type CommandRunner,
} from './tools';

export const RECOVERY_PRODUCTION_AGE_PRIMARY_IDENTITY_PATH =
  'RECOVERY_PRODUCTION_AGE_PRIMARY_IDENTITY_PATH';

export const RECOVERY_PRODUCTION_AGE_ESCROW_PATH =
  'RECOVERY_PRODUCTION_AGE_ESCROW_PATH';

export const RECOVERY_PRODUCTION_AGE_ESCROW_RECEIPT_PATH =
  'RECOVERY_PRODUCTION_AGE_ESCROW_RECEIPT_PATH';

export const RECOVERY_EXPECTED_PRODUCTION_AGE_RECIPIENT =
  'RECOVERY_EXPECTED_PRODUCTION_AGE_RECIPIENT';

export const RECOVERY_PRODUCTION_AGE_ESCROW_RETRIEVAL_CONFIRMATION =
  'RECOVERY_PRODUCTION_AGE_ESCROW_RETRIEVAL_CONFIRMATION';

export const PRODUCTION_AGE_ESCROW_RETRIEVAL_CONFIRMATION =
  'OFF_DEVICE_ESCROW_RETRIEVED';

export const PRODUCTION_AGE_ESCROW_RECEIPT_FORMAT =
  'madrasio-production-age-escrow-receipt-v1';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const productionAgeEscrowReceiptSchema = z
  .object({
    format: z.literal(PRODUCTION_AGE_ESCROW_RECEIPT_FORMAT),
    ageVersion: z.literal(AGE_RUNTIME_VERSION),
    expectedRecipient: z.string(),
    escrowSha256: z.string().regex(SHA256_PATTERN),
    probeSha256: z.string().regex(SHA256_PATTERN),
    recoveryProof: z.literal('PASS'),
    offDeviceRetrieved: z.literal(true),
  })
  .strict();

export type ProductionAgeEscrowReceipt = z.infer<
  typeof productionAgeEscrowReceiptSchema
>;

export type InteractiveAgeRunner = (
  args: string[],
  options?: {
    ageToolDirectory?: string;
    timeoutMs?: number;
  },
) => Promise<void>;

export type ProductionAgeEscrowOptions = {
  runner?: CommandRunner;
  interactiveRunner?: InteractiveAgeRunner;
  repositoryRoot?: string;
  ageToolDirectory?: string;
};

export type ProductionAgeEscrowCreationResult = {
  ageVersion: string;
  escrowCreated: true;
  escrowSha256: string;
  primaryRecipientMatch: true;
};

export type ProductionAgeEscrowVerificationResult = {
  ageVersion: string;
  escrowSha256: string;
  probeSha256: string;
  recoveryProof: 'PASS';
  offDeviceRetrieved: true;
};

function diagnostic(
  error: unknown,
  toolCause: RecoveryDiagnostic['toolCause'] = 'unknown',
): RecoveryDiagnostic {
  if (error instanceof ExternalToolError) {
    return {
      phase: 'tool_verification',
      toolCause: error.cause,
      ...(error.exitCode !== undefined
        ? { exitCode: error.exitCode }
        : {}),
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

function escrowFailure(
  message: string,
  error?: unknown,
  toolCause: RecoveryDiagnostic['toolCause'] = 'unknown',
): RecoveryError {
  return new RecoveryError(
    'BACKUP_ENCRYPTION_FAILED',
    message,
    diagnostic(error, toolCause),
  );
}

function isContainedBy(parent: string, child: string): boolean {
  const candidate = relative(parent, child);

  return (
    !candidate.startsWith('..') &&
    !isAbsolute(candidate)
  );
}

async function resolveExistingExternalFile(
  input: string | undefined,
  repositoryRoot: string,
  label: string,
): Promise<string> {
  const configured = input?.trim() ?? '';

  if (!configured || !isAbsolute(configured)) {
    throw escrowFailure(
      `An absolute external ${label} path is required.`,
      undefined,
      'filesystem',
    );
  }

  try {
    const [repository, file] = await Promise.all([
      realpath(repositoryRoot),
      realpath(configured),
    ]);

    const metadata = await stat(file);

    if (!metadata.isFile()) {
      throw escrowFailure(
        `The ${label} must be a regular file.`,
        undefined,
        'filesystem',
      );
    }

    if (isContainedBy(repository, file)) {
      throw escrowFailure(
        `The ${label} must remain outside the repository.`,
        undefined,
        'filesystem',
      );
    }

    return file;
  } catch (error) {
    if (error instanceof RecoveryError) {
      throw error;
    }

    throw escrowFailure(
      `The external ${label} could not be verified.`,
      error,
      'filesystem',
    );
  }
}

async function resolvePlannedExternalFile(
  input: string | undefined,
  repositoryRoot: string,
  label: string,
): Promise<string> {
  const configured = input?.trim() ?? '';

  if (!configured || !isAbsolute(configured)) {
    throw escrowFailure(
      `An absolute external ${label} path is required.`,
      undefined,
      'filesystem',
    );
  }

  try {
    const [repository, parent] = await Promise.all([
      realpath(repositoryRoot),
      realpath(dirname(configured)),
    ]);

    const parentMetadata = await stat(parent);

    if (!parentMetadata.isDirectory()) {
      throw escrowFailure(
        `The ${label} parent must be a directory.`,
        undefined,
        'filesystem',
      );
    }

    const target = resolve(parent, basename(configured));

    if (isContainedBy(repository, target)) {
      throw escrowFailure(
        `The ${label} must remain outside the repository.`,
        undefined,
        'filesystem',
      );
    }

    try {
      await stat(target);

      throw escrowFailure(
        `The ${label} already exists and will not be overwritten.`,
        undefined,
        'filesystem',
      );
    } catch (error) {
      if (error instanceof RecoveryError) {
        throw error;
      }

      if (
        (error as NodeJS.ErrnoException | null)?.code !== 'ENOENT'
      ) {
        throw error;
      }
    }

    return target;
  } catch (error) {
    if (error instanceof RecoveryError) {
      throw error;
    }

    throw escrowFailure(
      `The planned external ${label} could not be verified.`,
      error,
      'filesystem',
    );
  }
}

function commandOptions(
  ageToolDirectory: string | undefined,
): Parameters<CommandRunner>[2] {
  return {
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
}

async function assertReviewedAgeTools(
  runner: CommandRunner,
  ageToolDirectory: string | undefined,
): Promise<void> {
  const options =
    commandOptions(ageToolDirectory);

  const [ageVersion, ageKeygenVersion] =
    await Promise.all([
      runner(
        'age',
        ['--version'],
        options,
      ),
      runner(
        'age-keygen',
        ['--version'],
        options,
      ),
    ]);

  if (
    ageVersion.stdout.trim() !==
      AGE_RUNTIME_VERSION ||
    ageKeygenVersion.stdout.trim() !==
      AGE_RUNTIME_VERSION
  ) {
    throw escrowFailure(
      'The reviewed age 1.3.1 runtime is required.',
    );
  }
}

async function deriveRecipient(
  identityPath: string,
  runner: CommandRunner,
  ageToolDirectory: string | undefined,
): Promise<string> {
  const result =
    await runner(
      'age-keygen',
      ['-y', identityPath],
      commandOptions(ageToolDirectory),
    );

  return validateAgeRecipient(
    result.stdout,
  );
}

export async function sha256File(
  path: string,
): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

export function parseProductionAgeEscrowReceipt(
  input: unknown,
): ProductionAgeEscrowReceipt {
  const parsed =
    productionAgeEscrowReceiptSchema.safeParse(
      input,
    );

  if (!parsed.success) {
    throw escrowFailure(
      'Production age escrow verification evidence is invalid.',
      undefined,
      'filesystem',
    );
  }

  const expectedRecipient =
    validateAgeRecipient(
      parsed.data.expectedRecipient,
    );

  return {
    ...parsed.data,
    expectedRecipient,
  };
}

export async function readProductionAgeEscrowReceipt(
  path: string,
): Promise<ProductionAgeEscrowReceipt> {
  try {
    return parseProductionAgeEscrowReceipt(
      JSON.parse(
        await readFile(path, 'utf8'),
      ),
    );
  } catch (error) {
    if (error instanceof RecoveryError) {
      throw error;
    }

    throw escrowFailure(
      'Production age escrow verification evidence could not be read.',
      error,
      'filesystem',
    );
  }
}

export const runInteractiveAge: InteractiveAgeRunner =
  async (
    args,
    options = {},
  ) => {
    const invocation =
      resolveAgeToolInvocation(
        'age',
        args,
        {
          toolDirectory:
            options.ageToolDirectory,
        },
      );

    const inherited =
      Object.fromEntries(
        [
          'PATH',
          'Path',
          'PATHEXT',
          'SYSTEMROOT',
          'SystemRoot',
          'COMSPEC',
          'TEMP',
          'TMP',
          'HOME',
          'USERPROFILE',
          'APPDATA',
          'LOCALAPPDATA',
        ].map(
          (key) => [
            key,
            process.env[key],
          ],
        ),
      ) as NodeJS.ProcessEnv;

    await new Promise<void>(
      (resolvePromise, rejectPromise) => {
        const child =
          spawn(
            invocation.command,
            invocation.args,
            {
              env: inherited,
              stdio: 'inherit',
              windowsHide: true,
            },
          );

        const timeoutMs =
          options.timeoutMs ??
          10 * 60_000;

        let timedOut = false;

        const timer =
          setTimeout(
            () => {
              timedOut = true;
              child.kill('SIGTERM');
            },
            timeoutMs,
          );

        timer.unref();

        child.on(
          'error',
          (error) => {
            clearTimeout(timer);

            rejectPromise(
              new ExternalToolError(
                'spawn',
                undefined,
                undefined,
                false,
                classifySpawnFailureCause(
                  error,
                ),
              ),
            );
          },
        );

        child.on(
          'close',
          (code, signal) => {
            clearTimeout(timer);

            if (code === 0) {
              resolvePromise();
              return;
            }

            rejectPromise(
              new ExternalToolError(
                'operation',
                code ?? undefined,
                signal ?? undefined,
                timedOut,
                'unknown',
              ),
            );
          },
        );
      },
    );
  };

export async function createProductionAgeEscrow(
  runtimeEnv: NodeJS.ProcessEnv =
    process.env,
  options: ProductionAgeEscrowOptions = {},
): Promise<ProductionAgeEscrowCreationResult> {
  const runner =
    options.runner ?? runCommand;

  const interactiveRunner =
    options.interactiveRunner ??
    runInteractiveAge;

  const repositoryRoot =
    options.repositoryRoot ??
    resolve(process.cwd(), '../..');

  const ageToolDirectory =
    options.ageToolDirectory ??
    runtimeEnv[
      RECOVERY_AGE_TOOL_DIRECTORY
    ]?.trim();

  let escrowPath: string | undefined;

  try {
    const expectedRecipient =
      validateAgeRecipient(
        runtimeEnv[
          RECOVERY_EXPECTED_PRODUCTION_AGE_RECIPIENT
        ],
      );

    const primaryIdentity =
      await resolveExistingExternalFile(
        runtimeEnv[
          RECOVERY_PRODUCTION_AGE_PRIMARY_IDENTITY_PATH
        ],
        repositoryRoot,
        'Production age primary identity',
      );

    escrowPath =
      await resolvePlannedExternalFile(
        runtimeEnv[
          RECOVERY_PRODUCTION_AGE_ESCROW_PATH
        ],
        repositoryRoot,
        'Production age encrypted escrow',
      );

    await assertReviewedAgeTools(
      runner,
      ageToolDirectory,
    );

    const primaryRecipient =
      await deriveRecipient(
        primaryIdentity,
        runner,
        ageToolDirectory,
      );

    if (
      primaryRecipient !==
      expectedRecipient
    ) {
      throw escrowFailure(
        'Production age primary identity does not match the expected public recipient.',
      );
    }

    await interactiveRunner(
      [
        '--encrypt',
        '--passphrase',
        '--output',
        escrowPath,
        primaryIdentity,
      ],
      {
        ageToolDirectory,
        timeoutMs:
          10 * 60_000,
      },
    );

    const escrowMetadata =
      await stat(escrowPath);

    if (
      !escrowMetadata.isFile() ||
      escrowMetadata.size <= 0
    ) {
      throw escrowFailure(
        'Production age encrypted escrow was not created correctly.',
        undefined,
        'filesystem',
      );
    }

    const ciphertext =
      await readFile(escrowPath);

    if (
      ciphertext
        .toString('utf8')
        .includes(
          'AGE-SECRET-KEY-',
        )
    ) {
      throw escrowFailure(
        'Production age encrypted escrow unexpectedly contains plaintext identity material.',
        undefined,
        'filesystem',
      );
    }

    return {
      ageVersion:
        AGE_RUNTIME_VERSION,
      escrowCreated: true,
      escrowSha256:
        createHash('sha256')
          .update(ciphertext)
          .digest('hex'),
      primaryRecipientMatch: true,
    };
  } catch (error) {
    if (escrowPath) {
      try {
        await rm(
          escrowPath,
          {
            force: true,
          },
        );
      } catch {
        // The primary failure remains authoritative.
      }
    }

    if (error instanceof RecoveryError) {
      throw error;
    }

    throw escrowFailure(
      'Production age encrypted escrow creation failed.',
      error,
    );
  }
}

export async function verifyProductionAgeEscrowRecovery(
  runtimeEnv: NodeJS.ProcessEnv =
    process.env,
  options: ProductionAgeEscrowOptions = {},
): Promise<ProductionAgeEscrowVerificationResult> {
  const runner =
    options.runner ?? runCommand;

  const interactiveRunner =
    options.interactiveRunner ??
    runInteractiveAge;

  const repositoryRoot =
    options.repositoryRoot ??
    resolve(process.cwd(), '../..');

  const ageToolDirectory =
    options.ageToolDirectory ??
    runtimeEnv[
      RECOVERY_AGE_TOOL_DIRECTORY
    ]?.trim();

  if (
    runtimeEnv[
      RECOVERY_PRODUCTION_AGE_ESCROW_RETRIEVAL_CONFIRMATION
    ] !==
    PRODUCTION_AGE_ESCROW_RETRIEVAL_CONFIRMATION
  ) {
    throw escrowFailure(
      'Explicit off-device escrow retrieval confirmation is required before recovery verification.',
    );
  }

  const expectedRecipient =
    validateAgeRecipient(
      runtimeEnv[
        RECOVERY_EXPECTED_PRODUCTION_AGE_RECIPIENT
      ],
    );

  const primaryIdentity =
    await resolveExistingExternalFile(
      runtimeEnv[
        RECOVERY_PRODUCTION_AGE_PRIMARY_IDENTITY_PATH
      ],
      repositoryRoot,
      'Production age primary identity',
    );

  const escrow =
    await resolveExistingExternalFile(
      runtimeEnv[
        RECOVERY_PRODUCTION_AGE_ESCROW_PATH
      ],
      repositoryRoot,
      'Production age retrieved encrypted escrow',
    );

  const receiptPath =
    await resolvePlannedExternalFile(
      runtimeEnv[
        RECOVERY_PRODUCTION_AGE_ESCROW_RECEIPT_PATH
      ],
      repositoryRoot,
      'Production age escrow verification receipt',
    );

  let workspacePath: string | undefined;
  let probeSha256: string | undefined;

  try {
    await assertReviewedAgeTools(
      runner,
      ageToolDirectory,
    );

    const primaryRecipient =
      await deriveRecipient(
        primaryIdentity,
        runner,
        ageToolDirectory,
      );

    if (
      primaryRecipient !==
      expectedRecipient
    ) {
      throw escrowFailure(
        'Production age primary identity does not match the expected public recipient.',
      );
    }

    const escrowSha256 =
      await sha256File(escrow);

    workspacePath =
      await createRecoveryWorkDirectory();

    const probePlaintext =
      join(
        workspacePath,
        'escrow-probe.txt',
      );

    const probeCiphertext =
      join(
        workspacePath,
        'escrow-probe.age',
      );

    const probeRecovered =
      join(
        workspacePath,
        'escrow-probe.recovered.txt',
      );

    const challenge =
      `madrasio-production-age-escrow-probe-v1:${randomBytes(
        32,
      ).toString('hex')}\n`;

    await writeFile(
      probePlaintext,
      challenge,
      {
        mode: 0o600,
      },
    );

    probeSha256 =
      createHash('sha256')
        .update(challenge)
        .digest('hex');

    await runner(
      'age',
      [
        '--encrypt',
        '--recipient',
        expectedRecipient,
        '--output',
        probeCiphertext,
        probePlaintext,
      ],
      commandOptions(
        ageToolDirectory,
      ),
    );

    await interactiveRunner(
      [
        '--decrypt',
        '--identity',
        escrow,
        '--output',
        probeRecovered,
        probeCiphertext,
      ],
      {
        ageToolDirectory,
        timeoutMs:
          10 * 60_000,
      },
    );

    const recovered =
      await readFile(
        probeRecovered,
        'utf8',
      );

    if (recovered !== challenge) {
      throw escrowFailure(
        'Production age encrypted escrow recovery proof did not reconcile.',
      );
    }

    await cleanupRecoveryWorkDirectory(
      workspacePath,
    );

    workspacePath = undefined;

    const receipt: ProductionAgeEscrowReceipt =
      {
        format:
          PRODUCTION_AGE_ESCROW_RECEIPT_FORMAT,
        ageVersion:
          AGE_RUNTIME_VERSION,
        expectedRecipient,
        escrowSha256,
        probeSha256,
        recoveryProof:
          'PASS',
        offDeviceRetrieved:
          true,
      };

    await writeFile(
      receiptPath,
      `${JSON.stringify(receipt)}\n`,
      {
        mode: 0o600,
      },
    );

    return {
      ageVersion:
        AGE_RUNTIME_VERSION,
      escrowSha256,
      probeSha256,
      recoveryProof:
        'PASS',
      offDeviceRetrieved:
        true,
    };
  } catch (error) {
    if (workspacePath) {
      try {
        await cleanupRecoveryWorkDirectory(
          workspacePath,
        );
      } catch {
        // Keep the primary verification failure authoritative.
      }
    }

    try {
      await rm(
        receiptPath,
        {
          force: true,
        },
      );
    } catch {
      // Receipt cleanup must not expose secret material.
    }

    if (error instanceof RecoveryError) {
      throw error;
    }

    throw escrowFailure(
      'Production age encrypted escrow recovery verification failed.',
      error,
    );
  }
}