// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import * as s from '@school/database';
import { sessionFixture, sessionNow } from './session-fixture';
import { createAuthTestDb } from '../auth/test-helpers';
import { putSessionAttendance } from '@/lib/modules/attendance/application/session-service';
import { assertRecoveryInventory, fingerprintTable, loadForeignKeys } from '@/scripts/recovery/inventory';
import { buildRestoreOrder } from '@/scripts/recovery/restore';
import type { QueryClient } from '@/scripts/recovery/snapshot';
const port = process.env.ATTENDANCE_LOCAL_PG_PORT;
describe.skipIf(!port)('local PostgreSQL Attendance concurrency and recovery', () => {
  const pool = new Pool({ host: '127.0.0.1', port: Number(port), database: 'attendance_test', user: 'postgres', ssl: false, max: 6, options: '-c timezone=UTC', connectionTimeoutMillis: 5000, statement_timeout: 15000 });
  const db = drizzle(pool, { schema: s }); let f: Awaited<ReturnType<typeof sessionFixture>>;
  beforeAll(async () => {
    if (!/^\d{4,5}$/.test(port!) || Number(port) < 1024 || Number(port) > 65535) throw Error('Invalid owned local test port');
    expect((await pool.query('select current_database() name,version() version')).rows[0]).toMatchObject({ name: 'attendance_test', version: expect.stringContaining('17.6') });
    expect((await pool.query("select tablename from pg_tables where schemaname='public'")).rows).toEqual([]);
    await pool.query('create schema auth;create table auth.users(id uuid primary key,email varchar(255),phone text unique,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,last_sign_in_at timestamptz,created_at timestamptz,updated_at timestamptz);create table auth.identities(id uuid primary key,user_id uuid references auth.users(id));create role anon;create role authenticated;create role service_role;');
    await migrate(db, { migrationsFolder: path.resolve(process.cwd(), '../../database/drizzle/migrations') });
    f = await sessionFixture(); await f.test.client.exec("set time zone 'UTC';create table auth.identities(id uuid primary key,user_id uuid references auth.users(id))"); const source = f.test.client as unknown as QueryClient;
    await assertRecoveryInventory(source); const order = buildRestoreOrder(await loadForeignKeys(source)); expect(order).toHaveLength(59);
    expect(order.indexOf('public.attendance_records')).toBeGreaterThan(order.indexOf('public.timetable_publications'));
    for (const table of order) { const rows = (await source.query<{ row: unknown }>(`select to_jsonb(t) row from ${table} t`)).rows.map(r => r.row); if (rows.length) await pool.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`, [JSON.stringify(rows)]); }
    for (const table of order) expect(await fingerprintTable(pool, table)).toEqual(await fingerprintTable(source, table));
  }, 60000);
  afterAll(async () => { await f?.test.client.close(); await pool.end(); });
  const body = (status: 'PRESENT' | 'ABSENT' | 'LATE', expectedVersion: number | null) => ({ records: [{ studentId: f.student.id, status, expectedVersion }] });
  it('serializes simultaneous creates and stale corrections without lost updates', async () => {
    const same = await Promise.all([putSessionAttendance(db, f.teacherActor, f.identity, body('PRESENT', null), sessionNow), putSessionAttendance(db, f.teacherActor, f.identity, body('PRESENT', null), sessionNow)]);
    expect(same[0].records[0].id).toBe(same[1].records[0].id);
    const corrections = await Promise.allSettled([putSessionAttendance(db, f.teacherActor, f.identity, body('ABSENT', 1), sessionNow), putSessionAttendance(db, f.teacherActor, f.identity, body('LATE', 1), sessionNow)]);
    expect(corrections.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(corrections.filter(r => r.status === 'rejected')).toHaveLength(1);
    const rows = await db.select().from(s.attendanceRecords); expect(rows).toHaveLength(1); expect(rows[0].version).toBe(2);
    await expect(db.insert(s.attendanceRecords).values({ ...rows[0], id: crypto.randomUUID() })).rejects.toBeDefined();
  });
  it('waits for an assignment lifecycle change and denies the now-ended scope', async () => {
    const blocker = await pool.connect();
    try {
      await blocker.query('begin'); await blocker.query("update teacher_assignments set status='ENDED' where id=$1", [f.scope.assignment.id]);
      const pending = putSessionAttendance(db, f.teacherActor, f.identity, body('PRESENT', 2), sessionNow);
      // Establish that a separate backend is actually waiting on the row lock.
      let waiting = false;
      for (let i = 0; i < 50; i++) { const r = await pool.query("select count(*)::int n from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and pid<>pg_backend_pid()"); if (r.rows[0].n > 0) { waiting = true; break; } await new Promise(r => setTimeout(r, 20)); }
      expect(waiting).toBe(true); await blocker.query('commit'); await expect(pending).rejects.toMatchObject({ code: 'NOT_FOUND' });
    } finally { await blocker.query('rollback'); blocker.release(); }
    expect((await db.select().from(s.attendanceRecords))[0].version).toBe(2);
    await db.update(s.teacherAssignments).set({ status: 'ACTIVE' }).where(eq(s.teacherAssignments.id, f.scope.assignment.id));
  });
  it('restores and fingerprints all 59 tables including session metadata and correction audit history', async () => {
    const target = await createAuthTestDb();
    try {
      await target.client.exec("set time zone 'UTC';create table auth.identities(id uuid primary key,user_id uuid references auth.users(id))");
      const destination = target.client as unknown as QueryClient;
      await assertRecoveryInventory(pool); await assertRecoveryInventory(destination);
      const order = buildRestoreOrder(await loadForeignKeys(pool));
      for (const table of order) { const rows = (await pool.query(`select to_jsonb(t) row from ${table} t`)).rows.map(r => r.row); if (rows.length) await destination.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`, [JSON.stringify(rows)]); }
      for (const table of order) expect(await fingerprintTable(destination, table)).toEqual(await fingerprintTable(pool, table));
      const before = await fingerprintTable(destination, 'public.attendance_records');
      await target.client.exec("update attendance_records set note='altered recovery history'");
      expect(await fingerprintTable(destination, 'public.attendance_records')).not.toEqual(before);
    } finally { await target.client.close(); }
  }, 30000);
  it('rechecks applicability after a concurrent replacement holding the shared School lock', async () => {
    const blocker = await pool.connect();
    try {
      await blocker.query('begin'); await blocker.query('select id from schools where id=$1 for update', [f.schoolId]);
      await blocker.query("insert into timetable_publications(id,school_id,academic_year_id,class_id,draft_id,sequence,effective_from,valid_until,snapshot,request_key,request_hash,published_by)select gen_random_uuid(),school_id,academic_year_id,class_id,draft_id,2,'2025-10-10',valid_until,jsonb_set(snapshot,'{lessons}','[]'),gen_random_uuid(),'concurrent replacement',published_by from timetable_publications where id=$1", [f.publication.id]);
      const pending = putSessionAttendance(db, f.teacherActor, f.identity, body('PRESENT', 2), sessionNow).then(value => ({ value, error: null }), error => ({ value: null, error }));
      let waiting = false;
      for (let i = 0; i < 50; i++) { const r = await pool.query("select count(*)::int n from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and pid<>pg_backend_pid()"); if (r.rows[0].n > 0) { waiting = true; break; } await new Promise(r => setTimeout(r, 20)); }
      expect(waiting).toBe(true); await blocker.query('commit'); expect((await pending).error).toMatchObject({ code: 'NOT_FOUND' });
    } finally { await blocker.query('rollback'); blocker.release(); }
    expect((await db.select().from(s.attendanceRecords))[0].version).toBe(2);
  });
});
