// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createAuthTestDb, seedUser } from './test-helpers';
import { normalizeEmail } from '@/lib/auth/email';
import { findUserByNormalizedEmail } from '@/lib/auth/user-repository';

describe('canonical application User email', () => {
  it('normalizes only surrounding whitespace and case', () => {
    expect(normalizeEmail('  Person+tag@Example.COM  ')).toBe('person+tag@example.com');
  });

  it('finds the exact application User through case and whitespace variants', async () => {
    const test = await createAuthTestDb();
    try {
      const userId = await seedUser(test.seed, undefined, 'person@example.com');
      await expect(
        findUserByNormalizedEmail(test.seed as never, '  PERSON@EXAMPLE.COM '),
      ).resolves.toMatchObject({ id: userId, email: 'person@example.com', status: 'ACTIVE' });
      await expect(
        findUserByNormalizedEmail(test.seed as never, 'unknown@example.com'),
      ).resolves.toBeNull();
    } finally {
      await test.client.close();
    }
  });
});
