import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createTestDb, createSupabaseAuth, migrationsFolder } from './helpers';
import * as schema from '../drizzle/schema';

let client: PGlite;
afterEach(async () => {
  await client?.close();
});
const userId = '05400000-0000-4000-8000-000000000001';
const schoolId = '05400000-0000-4000-8000-000000000002';
async function seed() {
  await client.query('insert into auth.users(id,email) values ($1,$2)', [
    userId,
    'audit@test.invalid',
  ]);
  await client.query('insert into public.users(id,email) values ($1,$2)', [
    userId,
    'audit@test.invalid',
  ]);
  await client.query('insert into schools(id,name) values ($1,$2)', [schoolId, 'Audit School']);
  await client.query(
    "insert into school_memberships(school_id,user_id,role) values ($1,$2,'SCHOOL_ADMIN')",
    [schoolId, userId],
  );
}

it('fresh replay creates the constrained, indexed, RLS-protected audit table without events', async () => {
  const test = await createTestDb();
  client = test.client;
  expect((await client.query('select * from audit_events')).rows).toEqual([]);
  expect(
    (
      await client.query<{ count: number }>(
        'select count(*)::int count from drizzle.__drizzle_migrations',
      )
    ).rows[0].count,
  ).toBe(17);
  expect(
    (
      await client.query<{ relrowsecurity: boolean }>(
        "select relrowsecurity from pg_class where oid='audit_events'::regclass",
      )
    ).rows[0].relrowsecurity,
  ).toBe(true);
  expect(
    (await client.query("select * from pg_policy where polrelid='audit_events'::regclass")).rows,
  ).toHaveLength(0);
  const indexes = (
    await client.query<{ indexname: string }>(
      "select indexname from pg_indexes where tablename='audit_events'",
    )
  ).rows.map((row) => row.indexname);
  expect(indexes.sort()).toEqual([
    'audit_events_pkey',
    'audit_events_resource_idx',
    'audit_events_school_occurred_idx',
  ]);
  await seed();
  const base = {
    action: 'ClassCurriculumChanged',
    scope: 'SCHOOL' as const,
    schoolId,
    actorKind: 'USER' as const,
    actorUserId: userId,
    resourceType: 'Class',
    metadata: {},
  };
  await expect(test.db.insert(schema.auditEvents).values(base)).resolves.toBeDefined();
  await expect(
    test.db.insert(schema.auditEvents).values({ ...base, schoolId: null }),
  ).rejects.toThrow();
  await expect(
    test.db.insert(schema.auditEvents).values({ ...base, scope: 'PLATFORM' }),
  ).rejects.toThrow();
  await expect(
    test.db.insert(schema.auditEvents).values({ ...base, actorUserId: null }),
  ).rejects.toThrow();
  await expect(
    test.db.insert(schema.auditEvents).values({ ...base, actorKind: 'SYSTEM', actorUserId: null }),
  ).rejects.toThrow();
  await expect(
    test.db
      .insert(schema.auditEvents)
      .values({ ...base, actorKind: 'SYSTEM', systemActor: 'SCHEDULER' }),
  ).rejects.toThrow();
  await expect(
    test.db.insert(schema.auditEvents).values({ ...base, metadata: { text: 'x'.repeat(1025) } }),
  ).rejects.toThrow();
  const otherSchool = '05400000-0000-4000-8000-000000000003';
  await client.query('insert into schools(id,name) values ($1,$2)', [otherSchool, 'Other']);
  await expect(
    test.db.insert(schema.auditEvents).values({ ...base, schoolId: otherSchool }),
  ).rejects.toThrow();
  await expect(
    test.db.insert(schema.auditEvents).values({ ...base, scope: 'PLATFORM', schoolId: null }),
  ).resolves.toBeDefined();
  await expect(
    test.db
      .insert(schema.auditEvents)
      .values({ ...base, actorKind: 'SYSTEM', actorUserId: null, systemActor: 'SCHEDULER' }),
  ).resolves.toBeDefined();
  await expect(client.query('delete from users where id=$1', [userId])).rejects.toThrow();
  await expect(client.query('delete from schools where id=$1', [schoolId])).rejects.toThrow();
}, 30_000);

it('upgrades populated 0000–0015 unchanged, without fabricated historical events or API grants', async () => {
  client = new PGlite();
  await createSupabaseAuth(client);
  await client.exec('create role anon; create role authenticated; create role service_role;');
  for (const file of (await readdir(migrationsFolder))
    .filter((file) => /^\d{4}_.*\.sql$/.test(file) && !file.startsWith('0016'))
    .sort()) {
    for (const sql of (await readFile(join(migrationsFolder, file), 'utf8')).split(
      '--> statement-breakpoint',
    ))
      if (sql.trim()) await client.exec(sql);
  }
  await seed();
  const before = (await client.query('select * from users')).rows;
  const migration = await readFile(join(migrationsFolder, '0016_audit-events.sql'), 'utf8');
  await client.exec('begin');
  for (const sql of migration.split('--> statement-breakpoint'))
    if (sql.trim()) await client.exec(sql);
  await client.exec('commit');
  expect((await client.query('select * from users')).rows).toEqual(before);
  expect((await client.query('select * from audit_events')).rows).toEqual([]);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    expect(
      (
        await client.query<{ allowed: boolean }>(
          "select has_table_privilege($1,'audit_events','SELECT,INSERT,UPDATE,DELETE') allowed",
          [role],
        )
      ).rows[0].allowed,
    ).toBe(false);
  }
}, 30_000);
