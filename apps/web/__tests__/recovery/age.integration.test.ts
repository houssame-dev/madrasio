import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AGE_RUNTIME_VERSION } from '@/scripts/recovery/contracts';
import {
  decryptBundle,
  encryptBundle,
  runCommand,
  validateAgeRecipient,
} from '@/scripts/recovery/tools';

const enabled = process.env.RECOVERY_TEST_AGE === '1';

describe.skipIf(!enabled)('age recovery encryption (real binary opt-in)', () => {
  it('round-trips a bundle using an ephemeral local identity', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'recovery-age-test-'));
    try {
      const identity = join(directory, 'identity.txt');
      const plaintext = join(directory, 'plain.bundle');
      const encrypted = join(directory, 'plain.bundle.age');
      const decrypted = join(directory, 'decrypted.bundle');
      const version = await runCommand('age', ['--version']);
      expect(version.stdout.trim()).toBe(AGE_RUNTIME_VERSION);
      await runCommand('age-keygen', ['--output', identity]);
      const derived = await runCommand('age-keygen', ['-y', identity]);
      const recipient = validateAgeRecipient(derived.stdout);
      await writeFile(plaintext, 'local fixture only');
      await encryptBundle(plaintext, encrypted, recipient);
      await decryptBundle(encrypted, decrypted, identity);
      expect(await readFile(decrypted, 'utf8')).toBe('local fixture only');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
