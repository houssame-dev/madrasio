// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import * as s from '@school/database';
import { applicationSecurityAuditSql } from '@school/database/security';
import { sessionFixture, sessionNow } from '../attendance/session-fixture';
import { assertRecoveryInventory, fingerprintTable, loadForeignKeys } from '@/scripts/recovery/inventory';
import { buildRestoreOrder } from '@/scripts/recovery/restore';
import type { QueryClient } from '@/scripts/recovery/snapshot';
import { mutateSchoolHoliday } from '@/lib/modules/school-holidays/service';
import { putSessionAttendance } from '@/lib/modules/attendance/application/session-service';
import type { AttendanceDb } from '@/lib/modules/attendance/infrastructure/repositories/attendance-repository';

const port = process.env.HOLIDAYS_LOCAL_PG_PORT;
describe.skipIf(!port)('native School Holiday versus Attendance School-lock serialization', () => {
  const pool = new Pool({ host: '127.0.0.1', port: Number(port), user: 'postgres', database: 'holidays_test', ssl: false, max: 8, statement_timeout: 20000 });
  const db = drizzle(pool, { schema: s });
  let f: Awaited<ReturnType<typeof sessionFixture>>;
  beforeAll(async () => {
    if (!/^\d{4,5}$/.test(port!) || Number(port) < 1024 || Number(port) > 65535) throw Error('Invalid owned local port');
    expect((await pool.query('select current_database() name,version() version')).rows[0]).toMatchObject({ name: 'holidays_test', version: expect.stringContaining('17.6') });
    expect((await pool.query("select tablename from pg_tables where schemaname='public'")).rows).toEqual([]);
    await pool.query('create schema auth;create table auth.users(id uuid primary key,email varchar(255),phone text unique,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,last_sign_in_at timestamptz,created_at timestamptz,updated_at timestamptz);create table auth.identities(id uuid primary key,user_id uuid references auth.users(id));create role anon;create role authenticated;create role service_role;');
    await migrate(db, { migrationsFolder: path.resolve(process.cwd(), '../../database/drizzle/migrations') });
    f = await sessionFixture();
    await f.test.client.exec("set time zone 'UTC';create table auth.identities(id uuid primary key,user_id uuid references auth.users(id));");
    const source = f.test.client as unknown as QueryClient;
    await assertRecoveryInventory(source);
    const order = buildRestoreOrder(await loadForeignKeys(source));
    expect(order).toHaveLength(60);
    for (const table of order) {
      const rows = (await source.query<{ row: unknown }>(`select to_jsonb(t) row from ${table} t`)).rows.map(r => r.row);
      if (rows.length) await pool.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`, [JSON.stringify(rows)]);
    }
    for (const table of order) expect(await fingerprintTable(pool, table)).toEqual(await fingerprintTable(source, table));
    expect((await pool.query(applicationSecurityAuditSql)).rows).toEqual([]);
  }, 60000);
  afterAll(async () => { await f?.test.client.close(); await pool.end(); });
  async function waitForLocks(count: number) {
    for (let i = 0; i < 80; i++) {
      const n = (await pool.query("select count(*)::int n from pg_stat_activity where datname='holidays_test' and wait_event_type='Lock'")).rows[0].n;
      if (n >= count) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw Error('Independent transactions did not contend on the School lock');
  }
  it.each(['attendance', 'holiday'] as const)('admits only the first %s transaction under actual contention', async first => {
    const date = first === 'attendance' ? '2025-10-10' : '2025-10-17';
    const locker = await pool.connect();
    await locker.query('begin');
    await locker.query('select id from schools where id=$1 for update', [f.schoolId]);
    const attendance = () => putSessionAttendance(db as unknown as AttendanceDb, f.teacherActor, { ...f.identity, date }, { records: [{ studentId: f.student.id, status: 'PRESENT', expectedVersion: null }] }, new Date(`${date}T12:00:00Z`));
    const holiday = () => mutateSchoolHoliday(db, f.admin, 'create', { name: 'Native closure', type: 'SCHOOL_HOLIDAY', startDate: date, endDate: date }, undefined, sessionNow);
    let results: PromiseSettledResult<unknown>[];
    try {
      const a = (first === 'attendance' ? attendance : holiday)();
      // Attach rejection handlers before releasing the serialization lock.
      const one = a.then(value => ({ status: 'fulfilled' as const, value }), reason => ({ status: 'rejected' as const, reason }));
      await waitForLocks(1);
      const b = (first === 'attendance' ? holiday : attendance)();
      const two = b.then(value => ({ status: 'fulfilled' as const, value }), reason => ({ status: 'rejected' as const, reason }));
      await waitForLocks(2);
      await locker.query('commit');
      results = await Promise.all([one, two]);
    } finally { await locker.query('rollback'); locker.release(); }
    expect(results.map(v => v.status)).toEqual(['fulfilled', 'rejected']);
    expect((await pool.query('select count(*)::int n from attendance_records where attendance_date=$1', [date])).rows[0].n).toBe(first === 'attendance' ? 1 : 0);
    expect((await pool.query('select count(*)::int n from school_holidays where start_date=$1', [date])).rows[0].n).toBe(first === 'holiday' ? 1 : 0);
    expect((await pool.query("select count(*)::int n from audit_events where action in ('SchoolHolidayCreated','AttendanceRecorded')")).rows[0].n).toBe(first === 'attendance' ? 1 : 2);
  }, 30000);
});
