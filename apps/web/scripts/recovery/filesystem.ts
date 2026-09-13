import { chmod, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';

import { RecoveryError } from './contracts';

const PREFIX = 'madrasio-recovery-';

export async function createRecoveryWorkDirectory(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), PREFIX));
  await chmod(directory, 0o700).catch(() => undefined);
  return directory;
}

export function assertRecoveryWorkDirectory(directory: string): string {
  const target = resolve(directory);
  const root = resolve(tmpdir());
  const child = relative(root, target);
  if (
    !isAbsolute(target) ||
    child.startsWith('..') ||
    child === '' ||
    !target.split(/[\\/]/).at(-1)?.startsWith(PREFIX)
  ) {
    throw new RecoveryError(
      'BACKUP_PLAINTEXT_CLEANUP_FAILED',
      'Refused cleanup outside a generated recovery work directory.',
      { phase: 'cleanup', timeout: false },
    );
  }
  return target;
}

export async function cleanupRecoveryWorkDirectory(
  directory: string,
  remove: typeof rm = rm,
): Promise<void> {
  const target = assertRecoveryWorkDirectory(directory);
  try {
    await stat(target);
    await remove(target, { recursive: true, force: false, maxRetries: 2 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw new RecoveryError(
      'BACKUP_PLAINTEXT_CLEANUP_FAILED',
      'Temporary plaintext recovery material could not be removed.',
      { phase: 'cleanup', timeout: false },
    );
  }
}
