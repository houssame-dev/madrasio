import { afterEach, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createSupabaseAuth, createTestDb, migrationsFolder } from './helpers';
import { applicationSecurityAuditSql, assertApplicationSecurity } from '../security';
let client: PGlite;
afterEach(async () => {
  await client?.close();
});
it('fresh replay has 18 migrations, 40 protected tables and no implicit platform grant', async () => {
  const test = await createTestDb();
  client = test.client;
  expect(
    (await client.query<{ n: number }>('select count(*)::int n from drizzle.__drizzle_migrations'))
      .rows[0].n,
  ).toBe(18);
  const [column] = (
    await client.query<{ is_nullable: string; column_default: string; data_type: string }>(
      "select is_nullable,column_default,data_type from information_schema.columns where table_schema='public' and table_name='users' and column_name='is_platform_admin'",
    )
  ).rows;
  expect(column).toMatchObject({
    is_nullable: 'NO',
    column_default: 'false',
    data_type: 'boolean',
  });
  expect(
    (
      await client.query<{ n: number }>(
        "select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity",
      )
    ).rows[0].n,
  ).toBe(40);
  expect(
    (
      await client.query<{ n: number }>(
        "select count(*)::int n from pg_policies where schemaname='public'",
      )
    ).rows[0].n,
  ).toBe(0);
}, 30000);
it('upgrades populated users with false even for SUPER_ADMIN memberships; preserves rows, constraints and security', async () => {
  client = new PGlite();
  await createSupabaseAuth(client);
  await client.exec('create role anon; create role authenticated; create role service_role;');
  for (const file of (await readdir(migrationsFolder))
    .filter((p) => /^\d{4}_.+\.sql$/.test(p) && Number(p.slice(0, 4)) < 17)
    .sort()) {
    for (const statement of (await readFile(join(migrationsFolder, file), 'utf8')).split(
      '--> statement-breakpoint',
    ))
      if (statement.trim()) await client.exec(statement);
  }
  const id = '05800000-0000-4000-8000-000000000001';
  const schoolId = '05800000-0000-4000-8000-000000000002';
  await client.query('insert into auth.users(id,email) values ($1,$2)', [
    id,
    'operator@example.test',
  ]);
  await client.query('insert into users(id,email) values ($1,$2)', [id, 'operator@example.test']);
  await client.query('insert into schools(id,name) values ($1,$2)', [schoolId, 'Synthetic']);
  await client.query(
    "insert into school_memberships(school_id,user_id,role) values ($1,$2,'SUPER_ADMIN')",
    [schoolId, id],
  );
  const before = (await client.query('select * from school_memberships')).rows;
  await client.exec(await readFile(join(migrationsFolder, '0017_platform-authority.sql'), 'utf8'));
  expect((await client.query('select is_platform_admin from users')).rows).toEqual([
    { is_platform_admin: false },
  ]);
  expect((await client.query('select * from school_memberships')).rows).toEqual(before);
  await expect(client.query('update users set is_platform_admin=null')).rejects.toThrow();
  await client.query('update users set is_platform_admin=true where id=$1', [id]);
  expect((await client.query('select is_platform_admin from users')).rows).toEqual([
    { is_platform_admin: true },
  ]);
  const audit = await client.query<{ violation: string }>(applicationSecurityAuditSql);
  expect(() => assertApplicationSecurity(audit.rows)).not.toThrow();
}, 30000);
