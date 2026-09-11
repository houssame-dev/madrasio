import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { decryptBundle, encryptBundle, runCommand } from '@/scripts/recovery/tools';

const enabled = process.env.RECOVERY_TEST_AGE === '1';

describe.skipIf(!enabled)('age recovery encryption (real binary opt-in)', () => {
  it('round-trips a bundle using an ephemeral local identity', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'recovery-age-test-'));
    try {
      const identity = join(directory, 'identity.txt');
      const plaintext = join(directory, 'plain.bundle');
      const encrypted = join(directory, 'plain.bundle.age');
      const decrypted = join(directory, 'decrypted.bundle');
      const generated = await runCommand('age-keygen', ['--output', identity]);
      const recipient = /Public key: (age1\S+)/.exec(generated.stdout)?.[1];
      expect(recipient).toBeTruthy();
      await writeFile(plaintext, 'local fixture only');
      await encryptBundle(plaintext, encrypted, recipient!);
      await decryptBundle(encrypted, decrypted, identity);
      expect(await readFile(decrypted, 'utf8')).toBe('local fixture only');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
