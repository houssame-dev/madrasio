import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { safeRecoveryError } from '@/scripts/recovery/contracts';
import {
  cleanupEphemeralAgeIdentity,
  createEphemeralAgeIdentity,
} from '@/scripts/recovery/ephemeral-age';
import { ExternalToolError, type CommandRunner } from '@/scripts/recovery/tools';

describe('ephemeral age identity orchestration', () => {
  it('returns only the recipient and external identity path, then cleans the workspace', async () => {
    const recipient = `age1${'q'.repeat(58)}`;
    const runner = vi.fn<CommandRunner>(async (_command, args) => {
      if (args[0] === '--output') {
        await writeFile(args[1]!, 'AGE-SECRET-KEY-TEST\n');
        return { stdout: '' };
      }
      return { stdout: `${recipient}\n` };
    });
    const identity = await createEphemeralAgeIdentity({ runner });
    expect(identity.recipient).toBe(recipient);
    expect(existsSync(identity.identityPath)).toBe(true);
    expect(runner).toHaveBeenCalledWith(
      'age-keygen',
      ['--output', identity.identityPath],
      { timeoutMs: 30_000 },
    );
    expect(runner).toHaveBeenCalledWith('age-keygen', ['-y', identity.identityPath], {
      timeoutMs: 30_000,
    });
    await cleanupEphemeralAgeIdentity(identity);
    expect(existsSync(identity.workspacePath)).toBe(false);
  });

  it('maps a missing key generator to a bounded phase-safe failure and cleans up', async () => {
    const runner = vi
      .fn<CommandRunner>()
      .mockRejectedValue(
        new ExternalToolError('spawn', undefined, undefined, false, 'unavailable'),
      );
    let captured: unknown;
    try {
      await createEphemeralAgeIdentity({ runner });
    } catch (error) {
      captured = error;
    }
    expect(safeRecoveryError(captured)).toEqual({
      code: 'BACKUP_ENCRYPTION_FAILED',
      message: 'The recovery operation failed.',
      phase: 'key_generation',
      toolCause: 'unavailable',
      timeout: false,
    });
  });

  it('passes an explicit reviewed tool directory to both key-generator launches', async () => {
    const recipient = `age1${'q'.repeat(58)}`;
    const toolDirectory = resolve('path with spaces', 'age-v1.3.1');
    const runner = vi.fn<CommandRunner>(async (_command, args) => {
      if (args[0] === '--output') {
        await writeFile(args[1]!, 'AGE-SECRET-KEY-TEST\n');
        return { stdout: '' };
      }
      return { stdout: recipient };
    });
    const identity = await createEphemeralAgeIdentity({ runner, ageToolDirectory: toolDirectory });
    expect(runner).toHaveBeenCalledTimes(2);
    for (const call of runner.mock.calls) {
      expect(call[2]).toEqual({
        timeoutMs: 30_000,
        env: { RECOVERY_AGE_TOOL_DIRECTORY: toolDirectory },
      });
    }
    await cleanupEphemeralAgeIdentity(identity);
  });

  it('classifies an unavailable explicitly resolved executable without exposing its path', async () => {
    let captured: unknown;
    try {
      await createEphemeralAgeIdentity({
        ageToolDirectory: resolve('definitely-missing-age-v1.3.1'),
      });
    } catch (error) {
      captured = error;
    }
    expect(safeRecoveryError(captured)).toEqual({
      code: 'BACKUP_ENCRYPTION_FAILED',
      message: 'The recovery operation failed.',
      phase: 'key_generation',
      toolCause: 'unavailable',
      timeout: false,
    });
  });

  it('rejects malformed key-generator output without exposing it', async () => {
    const runner = vi.fn<CommandRunner>(async (_command, args) => {
      await writeFile(args[1]!, 'private malformed output');
      return { stdout: '' };
    });
    await expect(createEphemeralAgeIdentity({ runner })).rejects.toMatchObject({
      code: 'BACKUP_ENCRYPTION_FAILED',
      diagnostic: { phase: 'key_generation' },
    });
  });
});
