import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  AGE_RUNTIME_VERSION,
  safeRecoveryError,
} from '@/scripts/recovery/contracts';
import {
  RECOVERY_EXPECTED_PRODUCTION_AGE_RECIPIENT,
  RECOVERY_PRODUCTION_AGE_PRIMARY_IDENTITY_PATH,
  RECOVERY_PRODUCTION_AGE_SECONDARY_IDENTITY_PATH,
  assertProductionAgeIdentityCustody,
} from '@/scripts/recovery/production-age-custody';
import {
  ExternalToolError,
  RECOVERY_AGE_TOOL_DIRECTORY,
  type CommandRunner,
} from '@/scripts/recovery/tools';

async function createFixture(): Promise<{
  root: string;
  repositoryRoot: string;
  primary: string;
  secondary: string;
}> {
  const root = await mkdtemp(
    resolve(tmpdir(), 'madrasio-production-age-custody-'),
  );

  const repositoryRoot = resolve(root, 'repository');
  const custodyRoot = resolve(root, 'external-custody');

  await mkdir(repositoryRoot, { recursive: true });
  await mkdir(custodyRoot, { recursive: true });

  const primary =
    resolve(custodyRoot, 'primary.age-identity');

  const secondary =
    resolve(custodyRoot, 'secondary.age-identity');

  await writeFile(
    primary,
    'AGE-SECRET-KEY-TEST-PRIMARY\n',
  );

  await writeFile(
    secondary,
    'AGE-SECRET-KEY-TEST-SECONDARY\n',
  );

  return {
    root,
    repositoryRoot,
    primary,
    secondary,
  };
}

function custodyEnv(
  primary: string,
  secondary: string,
  recipient: string,
  toolDirectory?: string,
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',

    [RECOVERY_PRODUCTION_AGE_PRIMARY_IDENTITY_PATH]:
      primary,

    [RECOVERY_PRODUCTION_AGE_SECONDARY_IDENTITY_PATH]:
      secondary,

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

describe('Production age identity custody readiness', () => {
  it('accepts two distinct external copies that derive the expected recipient', async () => {
    const fixture = await createFixture();
    const recipient = `age1${'q'.repeat(58)}`;
    const toolDirectory =
      resolve(fixture.root, 'age-v1.3.1');

    const runner = vi.fn<CommandRunner>(
      async (_command, args) => {
        if (args[0] === '--version') {
          return {
            stdout: `${AGE_RUNTIME_VERSION}\n`,
          };
        }

        if (args[0] === '-y') {
          return {
            stdout: `${recipient}\n`,
          };
        }

        throw new Error(
          'Unexpected synthetic age-keygen invocation.',
        );
      },
    );

    try {
      const result =
        await assertProductionAgeIdentityCustody(
          custodyEnv(
            fixture.primary,
            fixture.secondary,
            recipient,
            toolDirectory,
          ),
          {
            runner,
            repositoryRoot: fixture.repositoryRoot,
          },
        );

      expect(result).toEqual({
        copyCount: 2,
        ageVersion: AGE_RUNTIME_VERSION,
        outsideRepository: true,
        distinctCopies: true,
        recipientsMatch: true,
        expectedRecipientMatch: true,
      });

      expect(runner).toHaveBeenCalledTimes(3);

      for (const call of runner.mock.calls) {
        expect(call[0]).toBe('age-keygen');

        expect(call[2]).toEqual({
          timeoutMs: 30_000,
          env: {
            RECOVERY_AGE_TOOL_DIRECTORY:
              toolDirectory,
          },
        });
      }

      const serialized =
        JSON.stringify(result);

      expect(serialized).not.toContain(
        fixture.primary,
      );

      expect(serialized).not.toContain(
        fixture.secondary,
      );

      expect(serialized).not.toContain(
        recipient,
      );

      expect(serialized).not.toContain(
        'AGE-SECRET-KEY',
      );
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });

  it('rejects a relative identity path before invoking age-keygen', async () => {
    const fixture = await createFixture();
    const recipient = `age1${'q'.repeat(58)}`;
    const runner = vi.fn<CommandRunner>();

    try {
      await expect(
        assertProductionAgeIdentityCustody(
          custodyEnv(
            'relative-primary.age-identity',
            fixture.secondary,
            recipient,
          ),
          {
            runner,
            repositoryRoot: fixture.repositoryRoot,
          },
        ),
      ).rejects.toMatchObject({
        code: 'BACKUP_ENCRYPTION_FAILED',
        diagnostic: {
          phase: 'tool_verification',
          toolCause: 'filesystem',
          timeout: false,
        },
      });

      expect(runner).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });

  it('rejects a missing external identity before invoking age-keygen', async () => {
    const fixture = await createFixture();
    const recipient = `age1${'q'.repeat(58)}`;

    const missing =
      resolve(
        fixture.root,
        'external-custody',
        'missing.age-identity',
      );

    const runner = vi.fn<CommandRunner>();

    try {
      await expect(
        assertProductionAgeIdentityCustody(
          custodyEnv(
            missing,
            fixture.secondary,
            recipient,
          ),
          {
            runner,
            repositoryRoot: fixture.repositoryRoot,
          },
        ),
      ).rejects.toMatchObject({
        code: 'BACKUP_ENCRYPTION_FAILED',
        diagnostic: {
          phase: 'tool_verification',
          toolCause: 'filesystem',
          timeout: false,
        },
      });

      expect(runner).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });

  it('rejects a custody identity contained inside the repository', async () => {
    const fixture = await createFixture();
    const recipient = `age1${'q'.repeat(58)}`;

    const inside =
      resolve(
        fixture.repositoryRoot,
        'private.age-identity',
      );

    await writeFile(
      inside,
      'AGE-SECRET-KEY-TEST-INSIDE\n',
    );

    const runner = vi.fn<CommandRunner>();

    try {
      await expect(
        assertProductionAgeIdentityCustody(
          custodyEnv(
            inside,
            fixture.secondary,
            recipient,
          ),
          {
            runner,
            repositoryRoot: fixture.repositoryRoot,
          },
        ),
      ).rejects.toMatchObject({
        code: 'BACKUP_ENCRYPTION_FAILED',
        diagnostic: {
          phase: 'tool_verification',
          toolCause: 'filesystem',
          timeout: false,
        },
      });

      expect(runner).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });

  it('rejects the same canonical file as both custody copies', async () => {
    const fixture = await createFixture();
    const recipient = `age1${'q'.repeat(58)}`;
    const runner = vi.fn<CommandRunner>();

    try {
      await expect(
        assertProductionAgeIdentityCustody(
          custodyEnv(
            fixture.primary,
            fixture.primary,
            recipient,
          ),
          {
            runner,
            repositoryRoot: fixture.repositoryRoot,
          },
        ),
      ).rejects.toMatchObject({
        code: 'BACKUP_ENCRYPTION_FAILED',
        diagnostic: {
          phase: 'tool_verification',
          toolCause: 'filesystem',
          timeout: false,
        },
      });

      expect(runner).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });

  it('fails closed when the two copies derive different recipients', async () => {
    const fixture = await createFixture();

    const primaryRecipient =
      `age1${'q'.repeat(58)}`;

    const secondaryRecipient =
      `age1${'p'.repeat(58)}`;

    const runner = vi.fn<CommandRunner>(
      async (_command, args) => {
        if (args[0] === '--version') {
          return {
            stdout: AGE_RUNTIME_VERSION,
          };
        }

        if (args[1] === fixture.primary) {
          return {
            stdout: primaryRecipient,
          };
        }

        return {
          stdout: secondaryRecipient,
        };
      },
    );

    try {
      await expect(
        assertProductionAgeIdentityCustody(
          custodyEnv(
            fixture.primary,
            fixture.secondary,
            primaryRecipient,
          ),
          {
            runner,
            repositoryRoot: fixture.repositoryRoot,
          },
        ),
      ).rejects.toMatchObject({
        code: 'BACKUP_ENCRYPTION_FAILED',
        diagnostic: {
          phase: 'tool_verification',
          timeout: false,
        },
      });
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });

  it('fails closed when both copies differ from the expected recipient', async () => {
    const fixture = await createFixture();

    const derivedRecipient =
      `age1${'q'.repeat(58)}`;

    const expectedRecipient =
      `age1${'p'.repeat(58)}`;

    const runner = vi.fn<CommandRunner>(
      async (_command, args) => {
        if (args[0] === '--version') {
          return {
            stdout: AGE_RUNTIME_VERSION,
          };
        }

        return {
          stdout: derivedRecipient,
        };
      },
    );

    try {
      await expect(
        assertProductionAgeIdentityCustody(
          custodyEnv(
            fixture.primary,
            fixture.secondary,
            expectedRecipient,
          ),
          {
            runner,
            repositoryRoot: fixture.repositoryRoot,
          },
        ),
      ).rejects.toMatchObject({
        code: 'BACKUP_ENCRYPTION_FAILED',
        diagnostic: {
          phase: 'tool_verification',
          timeout: false,
        },
      });
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });

  it('requires the reviewed age-keygen runtime version', async () => {
    const fixture = await createFixture();
    const recipient = `age1${'q'.repeat(58)}`;

    const runner = vi.fn<CommandRunner>(
      async () => ({
        stdout: 'v0.0.0',
      }),
    );

    try {
      await expect(
        assertProductionAgeIdentityCustody(
          custodyEnv(
            fixture.primary,
            fixture.secondary,
            recipient,
          ),
          {
            runner,
            repositoryRoot: fixture.repositoryRoot,
          },
        ),
      ).rejects.toMatchObject({
        code: 'BACKUP_ENCRYPTION_FAILED',
        diagnostic: {
          phase: 'tool_verification',
          timeout: false,
        },
      });

      expect(runner).toHaveBeenCalledTimes(1);
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });

  it('maps unavailable age-keygen to bounded secret-safe diagnostics', async () => {
    const fixture = await createFixture();
    const recipient = `age1${'q'.repeat(58)}`;

    const runner = vi
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
      let captured: unknown;

      try {
        await assertProductionAgeIdentityCustody(
          custodyEnv(
            fixture.primary,
            fixture.secondary,
            recipient,
          ),
          {
            runner,
            repositoryRoot: fixture.repositoryRoot,
          },
        );
      } catch (error) {
        captured = error;
      }

      const safe =
        safeRecoveryError(captured);

      expect(safe).toMatchObject({
        code: 'BACKUP_ENCRYPTION_FAILED',
        phase: 'tool_verification',
        toolCause: 'unavailable',
        timeout: false,
      });

      const serialized =
        JSON.stringify(safe);

      expect(serialized).not.toContain(
        fixture.primary,
      );

      expect(serialized).not.toContain(
        fixture.secondary,
      );

      expect(serialized).not.toContain(
        recipient,
      );

      expect(serialized).not.toContain(
        'AGE-SECRET-KEY',
      );
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });

  it('rejects a malformed expected recipient before invoking age-keygen', async () => {
    const fixture = await createFixture();
    const runner = vi.fn<CommandRunner>();

    try {
      await expect(
        assertProductionAgeIdentityCustody(
          custodyEnv(
            fixture.primary,
            fixture.secondary,
            'not-an-age-recipient',
          ),
          {
            runner,
            repositoryRoot: fixture.repositoryRoot,
          },
        ),
      ).rejects.toMatchObject({
        code: 'BACKUP_ENCRYPTION_FAILED',
        diagnostic: {
          phase: 'tool_verification',
          timeout: false,
        },
      });

      expect(runner).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    }
  });
});