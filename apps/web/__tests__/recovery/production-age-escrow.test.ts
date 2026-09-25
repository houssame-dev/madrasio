import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import {
  tmpdir,
} from 'node:os';
import {
  resolve,
} from 'node:path';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  AGE_RUNTIME_VERSION,
} from '@/scripts/recovery/contracts';
import {
  PRODUCTION_AGE_ESCROW_RECEIPT_FORMAT,
  PRODUCTION_AGE_ESCROW_RETRIEVAL_CONFIRMATION,
  RECOVERY_EXPECTED_PRODUCTION_AGE_RECIPIENT,
  RECOVERY_PRODUCTION_AGE_ESCROW_PATH,
  RECOVERY_PRODUCTION_AGE_ESCROW_RECEIPT_PATH,
  RECOVERY_PRODUCTION_AGE_ESCROW_RETRIEVAL_CONFIRMATION,
  RECOVERY_PRODUCTION_AGE_PRIMARY_IDENTITY_PATH,
  createProductionAgeEscrow,
  verifyProductionAgeEscrowRecovery,
  type InteractiveAgeRunner,
} from '@/scripts/recovery/production-age-escrow';
import {
  RECOVERY_AGE_TOOL_DIRECTORY,
  type CommandRunner,
} from '@/scripts/recovery/tools';

async function createFixture(): Promise<{
  root: string;
  repositoryRoot: string;
  externalRoot: string;
  primary: string;
  escrow: string;
  receipt: string;
}> {
  const root =
    await mkdtemp(
      resolve(
        tmpdir(),
        'madrasio-production-age-escrow-',
      ),
    );

  const repositoryRoot =
    resolve(
      root,
      'repository',
    );

  const externalRoot =
    resolve(
      root,
      'external',
    );

  await mkdir(
    repositoryRoot,
    {
      recursive: true,
    },
  );

  await mkdir(
    externalRoot,
    {
      recursive: true,
    },
  );

  const primary =
    resolve(
      externalRoot,
      'production.agekey',
    );

  const escrow =
    resolve(
      externalRoot,
      'production.age',
    );

  const receipt =
    resolve(
      externalRoot,
      'production.receipt.json',
    );

  await writeFile(
    primary,
    'AGE-SECRET-KEY-TEST-PRIMARY\n',
  );

  return {
    root,
    repositoryRoot,
    externalRoot,
    primary,
    escrow,
    receipt,
  };
}

function envFor(
  fixture: {
    primary: string;
    escrow: string;
    receipt: string;
  },
  recipient: string,
  toolDirectory?: string,
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    [RECOVERY_PRODUCTION_AGE_PRIMARY_IDENTITY_PATH]:
      fixture.primary,
    [RECOVERY_PRODUCTION_AGE_ESCROW_PATH]:
      fixture.escrow,
    [RECOVERY_PRODUCTION_AGE_ESCROW_RECEIPT_PATH]:
      fixture.receipt,
    [RECOVERY_EXPECTED_PRODUCTION_AGE_RECIPIENT]:
      recipient,
    ...(toolDirectory
      ? {
          [RECOVERY_AGE_TOOL_DIRECTORY]:
            toolDirectory,
        }
      : {}),
  };
}

function toolRunner(
  recipient: string,
): ReturnType<
  typeof vi.fn<CommandRunner>
> {
  return vi.fn<CommandRunner>(
    async (
      command,
      args,
    ) => {
      if (
        args[0] ===
        '--version'
      ) {
        return {
          stdout:
            `${AGE_RUNTIME_VERSION}\n`,
        };
      }

      if (
        command ===
          'age-keygen' &&
        args[0] === '-y'
      ) {
        return {
          stdout:
            `${recipient}\n`,
        };
      }

      if (
        command ===
          'age' &&
        args[0] === '--encrypt'
      ) {
        const outputIndex =
          args.indexOf(
            '--output',
          );

        const output =
          args[
            outputIndex + 1
          ]!;

        const input =
          args.at(-1)!;

        await copyFile(
          input,
          output,
        );

        return {
          stdout: '',
        };
      }

      throw new Error(
        'Unexpected synthetic age invocation.',
      );
    },
  );
}

describe(
  'Production age encrypted escrow ceremony',
  () => {
    it(
      'creates an encrypted escrow through the interactive age boundary without exposing private material',
      async () => {
        const fixture =
          await createFixture();

        const recipient =
          `age1${'q'.repeat(
            58,
          )}`;

        const toolDirectory =
          resolve(
            fixture.root,
            'age-v1.3.1',
          );

        const runner =
          toolRunner(
            recipient,
          );

        const interactiveRunner =
          vi.fn<InteractiveAgeRunner>(
            async (
              args,
            ) => {
              expect(
                args.slice(
                  0,
                  2,
                ),
              ).toEqual([
                '--encrypt',
                '--passphrase',
              ]);

              const outputIndex =
                args.indexOf(
                  '--output',
                );

              const output =
                args[
                  outputIndex + 1
                ]!;

              await writeFile(
                output,
                'synthetic-passphrase-encrypted-age-identity\n',
              );
            },
          );

        try {
          const result =
            await createProductionAgeEscrow(
              envFor(
                fixture,
                recipient,
                toolDirectory,
              ),
              {
                runner,
                interactiveRunner,
                repositoryRoot:
                  fixture.repositoryRoot,
              },
            );

          expect(
            result,
          ).toMatchObject({
            ageVersion:
              AGE_RUNTIME_VERSION,
            escrowCreated:
              true,
            primaryRecipientMatch:
              true,
          });

          expect(
            result.escrowSha256,
          ).toMatch(
            /^[a-f0-9]{64}$/,
          );

          expect(
            interactiveRunner,
          ).toHaveBeenCalledTimes(
            1,
          );

          const serialized =
            JSON.stringify(
              result,
            );

          expect(
            serialized,
          ).not.toContain(
            fixture.primary,
          );

          expect(
            serialized,
          ).not.toContain(
            recipient,
          );

          expect(
            serialized,
          ).not.toContain(
            'AGE-SECRET-KEY',
          );
        } finally {
          await rm(
            fixture.root,
            {
              recursive: true,
              force: true,
            },
          );
        }
      },
    );

    it(
      'refuses to overwrite an existing escrow artifact before interactive passphrase handling',
      async () => {
        const fixture =
          await createFixture();

        const recipient =
          `age1${'q'.repeat(
            58,
          )}`;

        await writeFile(
          fixture.escrow,
          'existing',
        );

        const interactiveRunner =
          vi.fn<InteractiveAgeRunner>();

        try {
          await expect(
            createProductionAgeEscrow(
              envFor(
                fixture,
                recipient,
              ),
              {
                runner:
                  toolRunner(
                    recipient,
                  ),
                interactiveRunner,
                repositoryRoot:
                  fixture.repositoryRoot,
              },
            ),
          ).rejects.toMatchObject({
            code:
              'BACKUP_ENCRYPTION_FAILED',
          });

          expect(
            interactiveRunner,
          ).not.toHaveBeenCalled();
        } finally {
          await rm(
            fixture.root,
            {
              recursive: true,
              force: true,
            },
          );
        }
      },
    );

    it(
      'requires explicit off-device retrieval confirmation before interactive recovery verification',
      async () => {
        const fixture =
          await createFixture();

        const recipient =
          `age1${'q'.repeat(
            58,
          )}`;

        await writeFile(
          fixture.escrow,
          'synthetic-passphrase-encrypted-age-identity\n',
        );

        const interactiveRunner =
          vi.fn<InteractiveAgeRunner>();

        try {
          await expect(
            verifyProductionAgeEscrowRecovery(
              envFor(
                fixture,
                recipient,
              ),
              {
                runner:
                  toolRunner(
                    recipient,
                  ),
                interactiveRunner,
                repositoryRoot:
                  fixture.repositoryRoot,
              },
            ),
          ).rejects.toMatchObject({
            code:
              'BACKUP_ENCRYPTION_FAILED',
          });

          expect(
            interactiveRunner,
          ).not.toHaveBeenCalled();
        } finally {
          await rm(
            fixture.root,
            {
              recursive: true,
              force: true,
            },
          );
        }
      },
    );

    it(
      'verifies an off-device retrieved escrow by decrypting a non-secret probe and emits artifact-bound evidence',
      async () => {
        const fixture =
          await createFixture();

        const recipient =
          `age1${'q'.repeat(
            58,
          )}`;

        await writeFile(
          fixture.escrow,
          'synthetic-passphrase-encrypted-age-identity\n',
        );

        const runner =
          toolRunner(
            recipient,
          );

        const interactiveRunner =
          vi.fn<InteractiveAgeRunner>(
            async (
              args,
            ) => {
              expect(
                args[0],
              ).toBe(
                '--decrypt',
              );

              expect(
                args,
              ).toContain(
                '--identity',
              );

              const outputIndex =
                args.indexOf(
                  '--output',
                );

              const output =
                args[
                  outputIndex + 1
                ]!;

              const input =
                args.at(-1)!;

              await copyFile(
                input,
                output,
              );
            },
          );

        const runtimeEnv = {
          ...envFor(
            fixture,
            recipient,
          ),
          [RECOVERY_PRODUCTION_AGE_ESCROW_RETRIEVAL_CONFIRMATION]:
            PRODUCTION_AGE_ESCROW_RETRIEVAL_CONFIRMATION,
        };

        try {
          const result =
            await verifyProductionAgeEscrowRecovery(
              runtimeEnv,
              {
                runner,
                interactiveRunner,
                repositoryRoot:
                  fixture.repositoryRoot,
              },
            );

          expect(
            result,
          ).toMatchObject({
            ageVersion:
              AGE_RUNTIME_VERSION,
            recoveryProof:
              'PASS',
            offDeviceRetrieved:
              true,
          });

          expect(
            result.escrowSha256,
          ).toMatch(
            /^[a-f0-9]{64}$/,
          );

          expect(
            result.probeSha256,
          ).toMatch(
            /^[a-f0-9]{64}$/,
          );

          const receipt =
            JSON.parse(
              await readFile(
                fixture.receipt,
                'utf8',
              ),
            );

          expect(
            receipt,
          ).toMatchObject({
            format:
              PRODUCTION_AGE_ESCROW_RECEIPT_FORMAT,
            ageVersion:
              AGE_RUNTIME_VERSION,
            expectedRecipient:
              recipient,
            escrowSha256:
              result.escrowSha256,
            probeSha256:
              result.probeSha256,
            recoveryProof:
              'PASS',
            offDeviceRetrieved:
              true,
          });

          const serialized =
            JSON.stringify(
              result,
            );

          expect(
            serialized,
          ).not.toContain(
            fixture.primary,
          );

          expect(
            serialized,
          ).not.toContain(
            recipient,
          );

          expect(
            serialized,
          ).not.toContain(
            'AGE-SECRET-KEY',
          );
        } finally {
          await rm(
            fixture.root,
            {
              recursive: true,
              force: true,
            },
          );
        }
      },
    );

    it(
      'fails closed when the recovered probe does not reconcile',
      async () => {
        const fixture =
          await createFixture();

        const recipient =
          `age1${'q'.repeat(
            58,
          )}`;

        await writeFile(
          fixture.escrow,
          'synthetic-passphrase-encrypted-age-identity\n',
        );

        const interactiveRunner =
          vi.fn<InteractiveAgeRunner>(
            async (
              args,
            ) => {
              const outputIndex =
                args.indexOf(
                  '--output',
                );

              await writeFile(
                args[
                  outputIndex + 1
                ]!,
                'wrong-recovered-content',
              );
            },
          );

        const runtimeEnv = {
          ...envFor(
            fixture,
            recipient,
          ),
          [RECOVERY_PRODUCTION_AGE_ESCROW_RETRIEVAL_CONFIRMATION]:
            PRODUCTION_AGE_ESCROW_RETRIEVAL_CONFIRMATION,
        };

        try {
          await expect(
            verifyProductionAgeEscrowRecovery(
              runtimeEnv,
              {
                runner:
                  toolRunner(
                    recipient,
                  ),
                interactiveRunner,
                repositoryRoot:
                  fixture.repositoryRoot,
              },
            ),
          ).rejects.toMatchObject({
            code:
              'BACKUP_ENCRYPTION_FAILED',
          });

          expect(
            await readFile(
              fixture.primary,
              'utf8',
            ),
          ).toContain(
            'AGE-SECRET-KEY-TEST',
          );
        } finally {
          await rm(
            fixture.root,
            {
              recursive: true,
              force: true,
            },
          );
        }
      },
    );
  },
);