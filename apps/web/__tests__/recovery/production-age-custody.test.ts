import {
  createHash,
} from 'node:crypto';
import {
  mkdir,
  mkdtemp,
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
  safeRecoveryError,
} from '@/scripts/recovery/contracts';
import {
  RECOVERY_EXPECTED_PRODUCTION_AGE_RECIPIENT,
  RECOVERY_PRODUCTION_AGE_ESCROW_PATH,
  RECOVERY_PRODUCTION_AGE_ESCROW_RECEIPT_PATH,
  RECOVERY_PRODUCTION_AGE_PRIMARY_IDENTITY_PATH,
  assertProductionAgeIdentityCustody,
} from '@/scripts/recovery/production-age-custody';
import {
  PRODUCTION_AGE_ESCROW_RECEIPT_FORMAT,
} from '@/scripts/recovery/production-age-escrow';
import {
  ExternalToolError,
  RECOVERY_AGE_TOOL_DIRECTORY,
  type CommandRunner,
} from '@/scripts/recovery/tools';

async function createFixture(): Promise<{
  root: string;
  repositoryRoot: string;
  primary: string;
  escrow: string;
  receipt: string;
}> {
  const root =
    await mkdtemp(
      resolve(
        tmpdir(),
        'madrasio-production-age-custody-',
      ),
    );

  const repositoryRoot =
    resolve(
      root,
      'repository',
    );

  const custodyRoot =
    resolve(
      root,
      'external-custody',
    );

  await mkdir(
    repositoryRoot,
    {
      recursive: true,
    },
  );

  await mkdir(
    custodyRoot,
    {
      recursive: true,
    },
  );

  const primary =
    resolve(
      custodyRoot,
      'primary.age-identity',
    );

  const escrow =
    resolve(
      custodyRoot,
      'production-identity.age',
    );

  const receipt =
    resolve(
      custodyRoot,
      'production-identity.receipt.json',
    );

  await writeFile(
    primary,
    'AGE-SECRET-KEY-TEST-PRIMARY\n',
  );

  await writeFile(
    escrow,
    'synthetic-encrypted-age-escrow\n',
  );

  return {
    root,
    repositoryRoot,
    primary,
    escrow,
    receipt,
  };
}

function hash(
  value: string,
): string {
  return createHash('sha256')
    .update(value)
    .digest('hex');
}

async function writeReceipt(
  path: string,
  input: {
    recipient: string;
    escrowSha256: string;
    ageVersion?: string;
    recoveryProof?: 'PASS' | 'FAIL';
    offDeviceRetrieved?: boolean;
  },
): Promise<void> {
  await writeFile(
    path,
    `${JSON.stringify({
      format:
        PRODUCTION_AGE_ESCROW_RECEIPT_FORMAT,
      ageVersion:
        input.ageVersion ??
        AGE_RUNTIME_VERSION,
      expectedRecipient:
        input.recipient,
      escrowSha256:
        input.escrowSha256,
      probeSha256:
        'a'.repeat(64),
      recoveryProof:
        input.recoveryProof ??
        'PASS',
      offDeviceRetrieved:
        input.offDeviceRetrieved ??
        true,
    })}\n`,
  );
}

function custodyEnv(
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

function successfulRunner(
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

      throw new Error(
        'Unexpected synthetic custody invocation.',
      );
    },
  );
}

describe(
  'Production age encrypted escrow custody readiness',
  () => {
    it(
      'accepts a primary identity plus artifact-bound off-device escrow proof',
      async () => {
        const fixture =
          await createFixture();

        const recipient =
          `age1${'q'.repeat(
            58,
          )}`;

        const escrowContent =
          'synthetic-encrypted-age-escrow\n';

        const escrowSha256 =
          hash(
            escrowContent,
          );

        await writeReceipt(
          fixture.receipt,
          {
            recipient,
            escrowSha256,
          },
        );

        const toolDirectory =
          resolve(
            fixture.root,
            'age-v1.3.1',
          );

        const runner =
          successfulRunner(
            recipient,
          );

        try {
          const result =
            await assertProductionAgeIdentityCustody(
              custodyEnv(
                fixture,
                recipient,
                toolDirectory,
              ),
              {
                runner,
                repositoryRoot:
                  fixture.repositoryRoot,
              },
            );

          expect(
            result,
          ).toEqual({
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
          });

          expect(
            runner,
          ).toHaveBeenCalledTimes(
            3,
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
            fixture.escrow,
          );

          expect(
            serialized,
          ).not.toContain(
            fixture.receipt,
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
      'rejects a relative primary identity path before tool invocation',
      async () => {
        const fixture =
          await createFixture();

        const recipient =
          `age1${'q'.repeat(
            58,
          )}`;

        const runner =
          vi.fn<CommandRunner>();

        try {
          await expect(
            assertProductionAgeIdentityCustody(
              {
                ...custodyEnv(
                  fixture,
                  recipient,
                ),
                [RECOVERY_PRODUCTION_AGE_PRIMARY_IDENTITY_PATH]:
                  'relative.agekey',
              },
              {
                runner,
                repositoryRoot:
                  fixture.repositoryRoot,
              },
            ),
          ).rejects.toMatchObject({
            code:
              'BACKUP_ENCRYPTION_FAILED',
            diagnostic: {
              phase:
                'tool_verification',
              toolCause:
                'filesystem',
              timeout: false,
            },
          });

          expect(
            runner,
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
      'rejects a primary identity contained inside the repository',
      async () => {
        const fixture =
          await createFixture();

        const recipient =
          `age1${'q'.repeat(
            58,
          )}`;

        const inside =
          resolve(
            fixture.repositoryRoot,
            'private.agekey',
          );

        await writeFile(
          inside,
          'AGE-SECRET-KEY-TEST-INSIDE\n',
        );

        const runner =
          vi.fn<CommandRunner>();

        try {
          await expect(
            assertProductionAgeIdentityCustody(
              {
                ...custodyEnv(
                  fixture,
                  recipient,
                ),
                [RECOVERY_PRODUCTION_AGE_PRIMARY_IDENTITY_PATH]:
                  inside,
              },
              {
                runner,
                repositoryRoot:
                  fixture.repositoryRoot,
              },
            ),
          ).rejects.toMatchObject({
            code:
              'BACKUP_ENCRYPTION_FAILED',
            diagnostic: {
              toolCause:
                'filesystem',
            },
          });

          expect(
            runner,
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
      'rejects a missing encrypted escrow artifact',
      async () => {
        const fixture =
          await createFixture();

        const recipient =
          `age1${'q'.repeat(
            58,
          )}`;

        const runner =
          vi.fn<CommandRunner>();

        try {
          await expect(
            assertProductionAgeIdentityCustody(
              {
                ...custodyEnv(
                  fixture,
                  recipient,
                ),
                [RECOVERY_PRODUCTION_AGE_ESCROW_PATH]:
                  resolve(
                    fixture.root,
                    'missing.age',
                  ),
              },
              {
                runner,
                repositoryRoot:
                  fixture.repositoryRoot,
              },
            ),
          ).rejects.toMatchObject({
            code:
              'BACKUP_ENCRYPTION_FAILED',
          });

          expect(
            runner,
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
      'rejects an escrow artifact inside the repository',
      async () => {
        const fixture =
          await createFixture();

        const recipient =
          `age1${'q'.repeat(
            58,
          )}`;

        const inside =
          resolve(
            fixture.repositoryRoot,
            'escrow.age',
          );

        await writeFile(
          inside,
          'synthetic-ciphertext',
        );

        const runner =
          vi.fn<CommandRunner>();

        try {
          await expect(
            assertProductionAgeIdentityCustody(
              {
                ...custodyEnv(
                  fixture,
                  recipient,
                ),
                [RECOVERY_PRODUCTION_AGE_ESCROW_PATH]:
                  inside,
              },
              {
                runner,
                repositoryRoot:
                  fixture.repositoryRoot,
              },
            ),
          ).rejects.toMatchObject({
            code:
              'BACKUP_ENCRYPTION_FAILED',
          });

          expect(
            runner,
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
      'rejects missing escrow verification evidence',
      async () => {
        const fixture =
          await createFixture();

        const recipient =
          `age1${'q'.repeat(
            58,
          )}`;

        const runner =
          vi.fn<CommandRunner>();

        try {
          await expect(
            assertProductionAgeIdentityCustody(
              custodyEnv(
                fixture,
                recipient,
              ),
              {
                runner,
                repositoryRoot:
                  fixture.repositoryRoot,
              },
            ),
          ).rejects.toMatchObject({
            code:
              'BACKUP_ENCRYPTION_FAILED',
          });

          expect(
            runner,
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
      'fails closed when the receipt escrow hash differs from the artifact',
      async () => {
        const fixture =
          await createFixture();

        const recipient =
          `age1${'q'.repeat(
            58,
          )}`;

        await writeReceipt(
          fixture.receipt,
          {
            recipient,
            escrowSha256:
              'b'.repeat(64),
          },
        );

        const runner =
          successfulRunner(
            recipient,
          );

        try {
          await expect(
            assertProductionAgeIdentityCustody(
              custodyEnv(
                fixture,
                recipient,
              ),
              {
                runner,
                repositoryRoot:
                  fixture.repositoryRoot,
              },
            ),
          ).rejects.toMatchObject({
            code:
              'BACKUP_ENCRYPTION_FAILED',
          });
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
      'fails closed when receipt recipient differs from expected recipient',
      async () => {
        const fixture =
          await createFixture();

        const recipient =
          `age1${'q'.repeat(
            58,
          )}`;

        const otherRecipient =
          `age1${'p'.repeat(
            58,
          )}`;

        await writeReceipt(
          fixture.receipt,
          {
            recipient:
              otherRecipient,
            escrowSha256:
              hash(
                'synthetic-encrypted-age-escrow\n',
              ),
          },
        );

        const runner =
          successfulRunner(
            recipient,
          );

        try {
          await expect(
            assertProductionAgeIdentityCustody(
              custodyEnv(
                fixture,
                recipient,
              ),
              {
                runner,
                repositoryRoot:
                  fixture.repositoryRoot,
              },
            ),
          ).rejects.toMatchObject({
            code:
              'BACKUP_ENCRYPTION_FAILED',
          });
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
      'fails closed when primary identity derives a different recipient',
      async () => {
        const fixture =
          await createFixture();

        const expectedRecipient =
          `age1${'q'.repeat(
            58,
          )}`;

        const derivedRecipient =
          `age1${'p'.repeat(
            58,
          )}`;

        await writeReceipt(
          fixture.receipt,
          {
            recipient:
              expectedRecipient,
            escrowSha256:
              hash(
                'synthetic-encrypted-age-escrow\n',
              ),
          },
        );

        const runner =
          successfulRunner(
            derivedRecipient,
          );

        try {
          await expect(
            assertProductionAgeIdentityCustody(
              custodyEnv(
                fixture,
                expectedRecipient,
              ),
              {
                runner,
                repositoryRoot:
                  fixture.repositoryRoot,
              },
            ),
          ).rejects.toMatchObject({
            code:
              'BACKUP_ENCRYPTION_FAILED',
          });
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
      'requires the reviewed age runtime version',
      async () => {
        const fixture =
          await createFixture();

        const recipient =
          `age1${'q'.repeat(
            58,
          )}`;

        await writeReceipt(
          fixture.receipt,
          {
            recipient,
            escrowSha256:
              hash(
                'synthetic-encrypted-age-escrow\n',
              ),
          },
        );

        const runner =
          vi.fn<CommandRunner>(
            async () => ({
              stdout:
                'v0.0.0',
            }),
          );

        try {
          await expect(
            assertProductionAgeIdentityCustody(
              custodyEnv(
                fixture,
                recipient,
              ),
              {
                runner,
                repositoryRoot:
                  fixture.repositoryRoot,
              },
            ),
          ).rejects.toMatchObject({
            code:
              'BACKUP_ENCRYPTION_FAILED',
          });
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
      'maps unavailable tooling to bounded secret-safe diagnostics',
      async () => {
        const fixture =
          await createFixture();

        const recipient =
          `age1${'q'.repeat(
            58,
          )}`;

        await writeReceipt(
          fixture.receipt,
          {
            recipient,
            escrowSha256:
              hash(
                'synthetic-encrypted-age-escrow\n',
              ),
          },
        );

        const runner =
          vi
            .fn<CommandRunner>()
            .mockRejectedValue(
              new ExternalToolError(
                'spawn',
                undefined,
                undefined,
                false,
                'unavailable',
              ),
            );

        try {
          let captured:
            unknown;

          try {
            await assertProductionAgeIdentityCustody(
              custodyEnv(
                fixture,
                recipient,
              ),
              {
                runner,
                repositoryRoot:
                  fixture.repositoryRoot,
              },
            );
          } catch (error) {
            captured =
              error;
          }

          const safe =
            safeRecoveryError(
              captured,
            );

          expect(
            safe,
          ).toMatchObject({
            code:
              'BACKUP_ENCRYPTION_FAILED',
            phase:
              'tool_verification',
            toolCause:
              'unavailable',
            timeout:
              false,
          });

          const serialized =
            JSON.stringify(
              safe,
            );

          expect(
            serialized,
          ).not.toContain(
            fixture.primary,
          );

          expect(
            serialized,
          ).not.toContain(
            fixture.escrow,
          );

          expect(
            serialized,
          ).not.toContain(
            fixture.receipt,
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
      'rejects malformed expected recipient before tool invocation',
      async () => {
        const fixture =
          await createFixture();

        const runner =
          vi.fn<CommandRunner>();

        try {
          await expect(
            assertProductionAgeIdentityCustody(
              custodyEnv(
                fixture,
                'not-an-age-recipient',
              ),
              {
                runner,
                repositoryRoot:
                  fixture.repositoryRoot,
              },
            ),
          ).rejects.toMatchObject({
            code:
              'BACKUP_ENCRYPTION_FAILED',
          });

          expect(
            runner,
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
  },
);