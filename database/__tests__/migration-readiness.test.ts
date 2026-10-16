import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { users } from '../drizzle/schema';
import { createTestDb } from './helpers';

const migrationsFolder = fileURLToPath(new URL('../drizzle/migrations/', import.meta.url));
const journalPath = fileURLToPath(
  new URL('../drizzle/migrations/meta/_journal.json', import.meta.url),
);

type MigrationJournal = {
  entries: Array<{ idx: number; tag: string }>;
};

async function migrationInventory() {
  const files = (await readdir(migrationsFolder))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as MigrationJournal;
  const sql = (
    await Promise.all(files.map((file) => readFile(`${migrationsFolder}/${file}`, 'utf8')))
  ).join('\n');

  return { files, journal, sql };
}

describe('hosted migration readiness', () => {
  it('creates an application User through the ORM on 0022 without a locale column', async () => {
    const { client, db } = await createTestDb();
    try {
      expect((await client.query(`select column_name from information_schema.columns
        where table_schema='public' and table_name='users' and column_name='preferred_locale'`)).rows)
        .toEqual([]);
      expect((await client.query(`select conname from pg_constraint
        where conrelid='public.users'::regclass and conname='users_preferred_locale_check'`)).rows)
        .toEqual([]);
      const id = '06600000-0000-4000-8000-000000000006';
      const email = 'provisioning@example.test';
      await client.query('insert into auth.users(id,email) values ($1,$2)', [id, email]);
      const insert = db.insert(users).values({ id, email, status: 'ACTIVE' });
      expect(insert.toSQL().sql).not.toContain('preferred_locale');
      const [created] = await insert.returning();
      expect(created).toMatchObject({ id, email, status: 'ACTIVE', isPlatformAdmin: false });
    } finally {
      await client.close();
    }
  }, 20_000);

  it('keeps every migration file in one deterministic journal chain', async () => {
    const { files, journal } = await migrationInventory();

    expect(journal.entries.map((entry) => entry.idx)).toEqual(
      journal.entries.map((_, index) => index),
    );
    expect(journal.entries.map((entry) => `${entry.tag}.sql`)).toEqual(files);
    expect(new Set(journal.entries.map((entry) => entry.tag)).size).toBe(journal.entries.length);
    expect(files).toHaveLength(23);
    expect(files.at(-1)).toBe('0022_homework-actual-handin-attachments.sql');
  });

  it('references Supabase Auth without owning its managed schema or table', async () => {
    const { sql } = await migrationInventory();

    expect(sql).toContain('REFERENCES "auth"."users"("id") ON DELETE cascade');
    expect(sql).not.toMatch(/CREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?auth/i);
    expect(sql).not.toMatch(/CREATE\s+TABLE[^;]*["']?auth["']?\s*\.["']?users/i);
    expect(sql).not.toMatch(
      /(?:ALTER|DROP)\s+TABLE\s+(?:IF\s+EXISTS\s+)?["']?auth["']?\s*\.["']?users/i,
    );
    expect(sql).not.toMatch(/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+["']?auth["']?\s*\.["']?users/i);
  });

  it('does not introduce hosted extensions, RLS policies, or session-affine objects', async () => {
    const { sql } = await migrationInventory();

    expect(sql).not.toMatch(/CREATE\s+EXTENSION/i);
    expect(sql).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/i);
    expect(sql).not.toMatch(/CREATE\s+TRIGGER/i);
    expect(sql).not.toMatch(/CREATE\s+POLICY|DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(sql).not.toMatch(/pg_advisory|LISTEN\s+|NOTIFY\s+|CREATE\s+TEMP(?:ORARY)?\s+TABLE/i);
  });
});
