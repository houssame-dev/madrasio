import { createHash } from 'node:crypto';
import { stat, writeFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import {
  cleanupRetrievedProductionRecovery,
  retrieveProductionRecoveryObject,
} from '@/scripts/recovery/retrieve-production-recovery';
import {
  cleanupRecoveryWorkDirectory,
  createRecoveryWorkDirectory,
} from '@/scripts/recovery/filesystem';

const objectKey =
  'frequent/2026/09/23/20260923T184801Z-b6b103893128-1c8113bc7dcfd798.age';

const ciphertext = Buffer.from('stage-5-production-recovery-ciphertext');
const ciphertextSha256 = createHash('sha256').update(ciphertext).digest('hex');

function environment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    RECOVERY_OBJECT_KEY: objectKey,
    RECOVERY_EXPECTED_CIPHERTEXT_BYTES: String(ciphertext.byteLength),
    RECOVERY_EXPECTED_CIPHERTEXT_SHA256: ciphertextSha256,
  };
}

describe('Production recovery ciphertext retrieval', () => {
  it('requires explicit accepted object identity before creating a workspace', async () => {
    const createWorkspace = vi.fn(createRecoveryWorkDirectory);

    await expect(
      retrieveProductionRecoveryObject(
        {
          ...environment(),
          RECOVERY_OBJECT_KEY: '../unexpected.age',
        },
        {
          createWorkspace,
          store: {
            head: vi.fn(),
            download: vi.fn(),
          },
        },
      ),
    ).rejects.toMatchObject({
      code: 'BACKUP_REMOTE_VERIFICATION_FAILED',
    });

    expect(createWorkspace).not.toHaveBeenCalled();
  });

  it('verifies remote metadata before download and independently verifies ciphertext', async () => {
    const head = vi.fn(async () => ({
      key: objectKey,
      bytes: ciphertext.byteLength,
      sha256: ciphertextSha256,
    }));

    const download = vi.fn(async (_key: string, destination: string) => {
      await writeFile(destination, ciphertext);
    });

    const result = await retrieveProductionRecoveryObject(environment(), {
      store: { head, download },
    });

    try {
      expect(head).toHaveBeenCalledWith(objectKey);
      expect(download).toHaveBeenCalledWith(objectKey, result.bundlePath);
      expect(head.mock.invocationCallOrder[0]).toBeLessThan(
        download.mock.invocationCallOrder[0]!,
      );

      expect(result).toMatchObject({
        objectKey,
        bytes: ciphertext.byteLength,
        ciphertextSha256,
      });

      expect(result).not.toHaveProperty('R2_ACCESS_KEY_ID');
      expect(result).not.toHaveProperty('R2_SECRET_ACCESS_KEY');

      await expect(stat(result.bundlePath)).resolves.toMatchObject({
        size: ciphertext.byteLength,
      });
    } finally {
      await cleanupRetrievedProductionRecovery(result);
    }

    await expect(stat(result.workspacePath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('fails closed and cleans the workspace when remote metadata differs', async () => {
    const workspacePath = await createRecoveryWorkDirectory();

    const createWorkspace = vi.fn(async () => workspacePath);

    try {
      await expect(
        retrieveProductionRecoveryObject(environment(), {
          createWorkspace,
          store: {
            head: vi.fn(async () => ({
              key: objectKey,
              bytes: ciphertext.byteLength + 1,
              sha256: ciphertextSha256,
            })),
            download: vi.fn(),
          },
        }),
      ).rejects.toMatchObject({
        code: 'BACKUP_REMOTE_VERIFICATION_FAILED',
      });

      await expect(stat(workspacePath)).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await cleanupRecoveryWorkDirectory(workspacePath).catch(() => undefined);
    }
  });

  it('fails closed and cleans the workspace when downloaded ciphertext differs', async () => {
    const workspacePath = await createRecoveryWorkDirectory();

    const createWorkspace = vi.fn(async () => workspacePath);

    try {
      await expect(
        retrieveProductionRecoveryObject(environment(), {
          createWorkspace,
          store: {
            head: vi.fn(async () => ({
              key: objectKey,
              bytes: ciphertext.byteLength,
              sha256: ciphertextSha256,
            })),
            download: vi.fn(async (_key: string, destination: string) => {
              await writeFile(destination, 'wrong-ciphertext');
            }),
          },
        }),
      ).rejects.toMatchObject({
        code: 'BACKUP_REMOTE_VERIFICATION_FAILED',
      });

      await expect(stat(workspacePath)).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await cleanupRecoveryWorkDirectory(workspacePath).catch(() => undefined);
    }
  });

  it('refuses success cleanup for a ciphertext path outside the generated artifact location', async () => {
    const workspacePath = await createRecoveryWorkDirectory();

    try {
      await expect(
        cleanupRetrievedProductionRecovery({
          workspacePath,
          bundlePath: `${workspacePath}-outside.age`,
        }),
      ).rejects.toMatchObject({
        code: 'BACKUP_PLAINTEXT_CLEANUP_FAILED',
      });
    } finally {
      await cleanupRecoveryWorkDirectory(workspacePath);
    }
  });
});
