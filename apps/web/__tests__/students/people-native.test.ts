// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import * as s from '@school/database';
import {
  createStudentsTestContext,
  createActor,
  seedStudent,
  type StudentsTestContext,
} from '../students/test-helpers';
import * as students from '@/lib/modules/students/application';
import * as teachers from '@/lib/modules/teachers/application';
import * as parents from '@/lib/modules/parents/application';
import {
  assertRecoveryInventory,
  fingerprintTable,
  loadForeignKeys,
  type QualifiedTable,
} from '@/scripts/recovery/inventory';
import { buildRestoreOrder } from '@/scripts/recovery/restore';
import type { QueryClient } from '@/scripts/recovery/snapshot';
import { seedSchool } from '../auth/test-helpers';
const port = process.env.PEOPLE_LOCAL_PG_PORT;
describe.skipIf(!port)('native PostgreSQL People concurrency and historical integrity', () => {
  const pool = new Pool({
    host: '127.0.0.1',
    port: Number(port),
    database: 'people_test',
    user: 'postgres',
    ssl: false,
    max: 6,
    options: '-c timezone=UTC',
    connectionTimeoutMillis: 5000,
    statement_timeout: 20000,
  });
  const db = drizzle(pool, { schema: s });
  let source: StudentsTestContext;
  let studentId: string, teacherId: string, parentId: string;
  let teacherActor: students.Actor, parentActor: students.Actor, foreignActor: students.Actor;
  let order: QualifiedTable[];
  beforeAll(async () => {
    if (!/^\d{4,5}$/.test(port!) || Number(port) < 1024 || Number(port) > 65535)
      throw Error('Invalid owned local port');
    expect(
      (await pool.query('select current_database() name,version() version')).rows[0],
    ).toMatchObject({ name: 'people_test', version: expect.stringContaining('17.6') });
    expect(
      (await pool.query("select tablename from pg_tables where schemaname='public'")).rows,
    ).toEqual([]);
    await pool.query(
      'create schema auth;create table auth.users(id uuid primary key,email varchar(255),phone text unique,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,last_sign_in_at timestamptz,created_at timestamptz,updated_at timestamptz);create table auth.identities(id uuid primary key,user_id uuid references auth.users(id));create role anon;create role authenticated;create role service_role;',
    );
    await migrate(db, {
      migrationsFolder: path.resolve(process.cwd(), '../../database/drizzle/migrations'),
    });
    source = await createStudentsTestContext();
    await source.test.client.exec(
      "set time zone 'UTC';create table auth.identities(id uuid primary key,user_id uuid references auth.users(id));",
    );
    studentId = (await seedStudent(source.test, source.schoolId, 'NATIVE')).id;
    await students.createEnrollment(source.db, source.admin, studentId, {
      academicYearId: source.yearId,
      classId: source.classAId,
      effectiveFrom: '2025-09-01',
    });
    teacherActor = await createActor(source.test, source.schoolId, 'TEACHER');
    parentActor = await createActor(source.test, source.schoolId, 'PARENT');
    teacherId = (
      await source.test.seed
        .insert(s.teachers)
        .values({
          schoolId: source.schoolId,
          userId: teacherActor.userId,
          firstName: 'Teacher',
          lastName: 'Fixture',
        })
        .returning()
    )[0].id;
    parentId = (
      await source.test.seed
        .insert(s.parents)
        .values({
          schoolId: source.schoolId,
          userId: parentActor.userId,
          firstName: 'Parent',
          lastName: 'Fixture',
        })
        .returning()
    )[0].id;
    foreignActor = await createActor(
      source.test,
      (await seedSchool(source.test.seed)).id,
      'SCHOOL_ADMIN',
    );
    const reader = source.test.client as unknown as QueryClient;
    await assertRecoveryInventory(reader);
    order = buildRestoreOrder(await loadForeignKeys(reader));
    expect(order).toHaveLength(59);
    for (const table of order) {
      const rows = (
        await reader.query<{ row: unknown }>(`select to_jsonb(t) row from ${table} t`)
      ).rows.map((r) => r.row);
      if (rows.length)
        await pool.query(
          `insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`,
          [JSON.stringify(rows)],
        );
    }
    for (const table of order)
      expect(await fingerprintTable(pool, table)).toEqual(await fingerprintTable(reader, table));
  }, 60000);
  afterAll(async () => {
    await source?.test.client.close();
    await pool.end();
  });
  it('allows only one competing atomic transfer and preserves the preceding inclusive date and historical source', async () => {
    const command = {
      academicYearId: source.yearId,
      toClassId: source.classBId,
      effectiveDate: '2025-10-01',
    };
    const results = await Promise.allSettled([
      students.transferStudent(db, source.admin, studentId, command),
      students.transferStudent(db, source.admin, studentId, command),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const records = (
      await pool.query(
        'select class_id,status,effective_from::text,effective_until::text from student_enrollments order by effective_from',
      )
    ).rows;
    expect(records).toEqual([
      {
        class_id: source.classAId,
        status: 'ENDED',
        effective_from: '2025-09-01',
        effective_until: '2025-09-30',
      },
      {
        class_id: source.classBId,
        status: 'ACTIVE',
        effective_from: '2025-10-01',
        effective_until: null,
      },
    ]);
    await expect(students.getStudent(db, foreignActor, studentId)).rejects.toBeDefined();
  });
  it('serializes duplicate logical assignments and revokes operational scope without rewriting ended rows', async () => {
    const command = {
      academicYearId: source.yearId,
      classId: source.classBId,
      subjectId: source.subjectId,
      effectiveFrom: '2025-09-01',
    };
    const results = await Promise.allSettled([
      teachers.createAssignment(db, source.admin, teacherId, command),
      teachers.createAssignment(db, source.admin, teacherId, command),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await students.getStudent(db, teacherActor, studentId)).id).toBe(studentId);
    const original = (await pool.query('select id from teacher_assignments')).rows[0].id;
    await teachers.endAssignment(db, source.admin, original, { effectiveUntil: '2025-10-20' });
    await expect(students.getStudent(db, teacherActor, studentId)).rejects.toBeDefined();
    const next = await teachers.createAssignment(db, source.admin, teacherId, {
      ...command,
      effectiveFrom: '2025-10-21',
    });
    expect(next.id).not.toBe(original);
    expect(
      (
        await pool.query(
          'select status,effective_until::text from teacher_assignments where id=$1',
          [original],
        )
      ).rows,
    ).toEqual([{ status: 'ENDED', effective_until: '2025-10-20' }]);
    await teachers.patchTeacher(db, source.admin, teacherId, { status: 'INACTIVE' });
    await expect(students.getStudent(db, teacherActor, studentId)).rejects.toBeDefined();
    expect((await pool.query('select count(*)::int n from teacher_assignments')).rows[0].n).toBe(2);
  });
  it('handles relationship races, idempotent ending and explicit relinking while preserving unrelated historical data', async () => {
    const command = { studentId };
    const results = await Promise.allSettled([
      parents.createRelationship(db, source.admin, parentId, command),
      parents.createRelationship(db, source.admin, parentId, command),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await parents.listSelfParentProfiles(db, parentActor)).data[0].children).toHaveLength(
      1,
    );
    const original = (await pool.query('select id from parent_students')).rows[0].id;
    await parents.endRelationship(db, source.admin, original);
    await parents.endRelationship(db, source.admin, original);
    expect((await parents.listSelfParentProfiles(db, parentActor)).data[0].children).toHaveLength(
      0,
    );
    const linked = await parents.createRelationship(db, source.admin, parentId, command);
    expect(linked.id).not.toBe(original);
    expect(
      (await pool.query('select status from parent_students where id=$1', [original])).rows[0]
        .status,
    ).toBe('ENDED');
    await parents.patchParent(db, source.admin, parentId, { status: 'INACTIVE' });
    expect((await parents.listSelfParentProfiles(db, parentActor)).data).toHaveLength(0);
    await expect(
      parents.createRelationship(db, foreignActor, parentId, command),
    ).rejects.toBeDefined();
    await assertRecoveryInventory(pool);
    const changed = new Set([
      'public.students',
      'public.student_enrollments',
      'public.teachers',
      'public.teacher_assignments',
      'public.parents',
      'public.parent_students',
    ]);
    for (const table of order)
      if (!changed.has(table))
        expect(await fingerprintTable(pool, table)).toEqual(
          await fingerprintTable(source.test.client as unknown as QueryClient, table),
        );
  });
});
