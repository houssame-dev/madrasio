import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createSupabaseAuth, migrationsFolder } from './helpers';

const USER_ONE = '00000000-0000-4000-8000-000000000101';
const USER_TWO = '00000000-0000-4000-8000-000000000102';

let client: PGlite | undefined;

async function executeMigrationFile(database: PGlite, fileName: string): Promise<void> {
  const sql = await readFile(path.join(migrationsFolder, fileName), 'utf8');
  for (const statement of sql.split('--> statement-breakpoint')) {
    if (statement.trim()) await database.exec(statement);
  }
}

async function createPre0014Database(): Promise<PGlite> {
  const database = new PGlite();
  await createSupabaseAuth(database);
  const files = (await readdir(migrationsFolder))
    .filter((file) => /^00(0\d|1[0-3])_.*\.sql$/.test(file))
    .sort();
  for (const file of files) await executeMigrationFile(database, file);
  return database;
}

async function seedIdentity(database: PGlite, id: string, email: string | null): Promise<void> {
  await database.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
  await database.query('insert into public.users (id) values ($1)', [id]);
}

async function apply0014(database: PGlite): Promise<void> {
  await database.exec('begin');
  try {
    await executeMigrationFile(database, '0014_canonical-user-email.sql');
    await database.exec('commit');
  } catch (error) {
    await database.exec('rollback');
    throw error;
  }
}

afterEach(async () => {
  await client?.close();
  client = undefined;
});

describe('0014 canonical User email migration', () => {
  it('replays on a fresh database with zero application Users', async () => {
    client = await createPre0014Database();
    await expect(apply0014(client)).resolves.toBeUndefined();
    const result = await client.query<{ count: number }>('select count(*)::int as count from users');
    expect(result.rows[0].count).toBe(0);
  }, 20_000);

  it('backfills a matching Auth email in canonical form', async () => {
    client = await createPre0014Database();
    await seedIdentity(client, USER_ONE, '  Existing.User@Example.COM  ');
    await apply0014(client);
    const result = await client.query<{ email: string }>('select email from users where id = $1', [USER_ONE]);
    expect(result.rows[0].email).toBe('existing.user@example.com');
  }, 20_000);

  it('fails closed when the application User has no matching Auth identity', async () => {
    client = await createPre0014Database();
    await client.exec('alter table public.users disable trigger all');
    await client.query('insert into public.users (id) values ($1)', [USER_ONE]);
    await client.exec('alter table public.users enable trigger all');
    await expect(apply0014(client)).rejects.toThrow(/missing Auth identity or non-usable Auth email/);
  }, 20_000);

  it('fails closed when the matching Auth email is null', async () => {
    client = await createPre0014Database();
    await seedIdentity(client, USER_ONE, null);
    await expect(apply0014(client)).rejects.toThrow(/missing Auth identity or non-usable Auth email/);
  }, 20_000);

  it('fails closed for duplicate normalized Auth emails', async () => {
    client = await createPre0014Database();
    await seedIdentity(client, USER_ONE, 'Same@Example.com');
    await seedIdentity(client, USER_TWO, ' same@example.COM ');
    await expect(apply0014(client)).rejects.toThrow(/duplicate normalized Auth email/);
  }, 20_000);
});
