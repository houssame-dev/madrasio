import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '@school/database';
import { sessionFixture, sessionNow } from '../attendance/session-fixture';
import { createActor, seedParentRelationship } from '../students/test-helpers';
import { seedSchool } from '../auth/test-helpers';
import { listSchoolHolidays, mutateSchoolHoliday, readSchoolHoliday, schoolHolidaysOnDate } from '@/lib/modules/school-holidays/service';
import { listSessions, putSessionAttendance } from '@/lib/modules/attendance/application/session-service';
import { readPublished } from '@/lib/modules/timetable/application/publication';
import type { TimetableDb } from '@/lib/modules/timetable/application/service';
import { createHolidaySchema } from '@/lib/modules/school-holidays/contracts';
import { adminOverview } from '@/lib/modules/dashboard/overview';
import { teacherWorkspace } from '@/lib/modules/dashboard/teacher-workspace';
import { getDailyAttendance } from '@/lib/modules/attendance/application/attendance-service';

let f: Awaited<ReturnType<typeof sessionFixture>>;
const input = (startDate = '2025-10-10', endDate = startDate) => ({ name: 'School break', type: 'SCHOOL_HOLIDAY' as const, startDate, endDate, description: 'Manually entered' });
const db = () => f.db as unknown as TimetableDb;
beforeEach(async () => { f = await sessionFixture(); }, 30000);
afterEach(async () => { await f.test.client.close(); });

describe('School Holidays: current scoped service and dated consumers', () => {
  it('keeps an empty calendar and validates actual civil dates, bounds, types and authority fields', async () => {
    expect((await listSchoolHolidays(db(), f.admin, {})).meta.total).toBe(0);
    for (const patch of [{ name: ' ' }, { startDate: '2025-02-29' }, { startDate: '2025-10-12', endDate: '2025-10-10' }, { type: 'HALF_DAY' }, { schoolId: f.schoolId }, { description: 'a'.repeat(2001) }]) expect(createHolidaySchema.safeParse({ ...input(), ...patch }).success).toBe(false);
  });
  it('resolves inclusive multi-day/overlapping closures once without duplicate lesson suppression', async () => {
    await mutateSchoolHoliday(db(), f.admin, 'create', input('2025-10-09', '2025-10-11'));
    await mutateSchoolHoliday(db(), f.admin, 'create', { ...input(), name: 'Public observance', type: 'PUBLIC_HOLIDAY' });
    for (const date of ['2025-10-09', '2025-10-11']) expect(await schoolHolidaysOnDate(db(), f.schoolId, date)).toHaveLength(1);
    expect(await schoolHolidaysOnDate(db(), f.schoolId, '2025-10-10')).toHaveLength(2);
    expect(await schoolHolidaysOnDate(db(), f.schoolId, '2025-10-12')).toHaveLength(0);
    expect((await listSessions(f.db, f.teacherActor, { date: '2025-10-10' }, sessionNow)).sessions).toHaveLength(0);
    expect((await listSessions(f.db, f.teacherActor, { date: '2025-10-17' }, sessionNow)).sessions).toHaveLength(2);
  });
  it('filters by literal name, type, pagination and overlap with each Year without splitting a record', async () => {
    const [next] = await db().insert(s.academicYears).values({ schoolId: f.schoolId, name: 'Next', startDate: '2026-09-01', endDate: '2027-06-30', status: 'PLANNED' }).returning();
    const holiday = await mutateSchoolHoliday(db(), f.admin, 'create', { ...input('2026-06-01', '2026-09-02'), name: 'Summer 100% break' });
    for (const academicYearId of [f.yearId, next.id]) expect((await listSchoolHolidays(db(), f.admin, { academicYearId })).data.map(v => v.id)).toContain(holiday.id);
    expect((await listSchoolHolidays(db(), f.admin, { search: '100%' })).meta.total).toBe(1);
    expect((await listSchoolHolidays(db(), f.admin, { type: 'PUBLIC_HOLIDAY' })).meta.total).toBe(0);
    expect((await listSchoolHolidays(db(), f.admin, { dateFrom: '2027-01-01' })).meta.total).toBe(0);
    expect((await listSchoolHolidays(db(), f.admin, { page: 2 })).data).toEqual([]);
  });
  it('retains School/Teacher/Parent boundaries and hides removed records from normal reads', async () => {
    const parent = await createActor(f.test, f.schoolId, 'PARENT');
    const foreign = await seedSchool(f.test.seed, 'Other');
    const otherAdmin = await createActor(f.test, foreign.id, 'SCHOOL_ADMIN');
    const row = await mutateSchoolHoliday(db(), f.admin, 'create', input());
    for (const actor of [parent, f.teacherActor]) {
      await expect(mutateSchoolHoliday(db(), actor, 'create', input())).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(listSchoolHolidays(db(), actor, {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    await expect(readSchoolHoliday(db(), otherAdmin, row.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(mutateSchoolHoliday(db(), otherAdmin, 'update', { ...input(), expectedRevision: 1 }, row.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await schoolHolidaysOnDate(db(), foreign.id, row.startDate)).toEqual([]);
    await mutateSchoolHoliday(db(), f.admin, 'remove', { confirmed: true, expectedRevision: 1 }, row.id);
    await expect(readSchoolHoliday(db(), f.admin, row.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await db().select().from(s.schoolHolidays))[0].removedAt).not.toBeNull();
    expect((await db().select().from(s.auditEvents).where(eq(s.auditEvents.resourceId, row.id))).map(e => e.action)).toEqual(expect.arrayContaining(['SchoolHolidayCreated', 'SchoolHolidayRemoved']));
  });
  it('serializes edits by revision, requires confirmed removal and keeps the audit atomic', async () => {
    const row = await mutateSchoolHoliday(db(), f.admin, 'create', input());
    const edited = await mutateSchoolHoliday(db(), f.admin, 'update', { ...input(), name: 'Edited', expectedRevision: 1 }, row.id);
    expect(edited.revision).toBe(2);
    await expect(mutateSchoolHoliday(db(), f.admin, 'update', { ...input(), expectedRevision: 1 }, row.id)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(mutateSchoolHoliday(db(), f.admin, 'remove', { confirmed: false, expectedRevision: 2 }, row.id)).rejects.toBeDefined();
    expect(await readSchoolHoliday(db(), f.admin, row.id)).toMatchObject({ name: 'Edited', revision: 2 });
    expect((await db().select().from(s.auditEvents).where(eq(s.auditEvents.resourceId, row.id)))).toHaveLength(2);
  });
  it('denies new session writes on holidays but restores eligibility after confirmed removal', async () => {
    const row = await mutateSchoolHoliday(db(), f.admin, 'create', input());
    const records = [{ studentId: f.student.id, status: 'PRESENT', expectedVersion: null }];
    await expect(putSessionAttendance(f.db, f.teacherActor, f.identity, { records }, sessionNow)).rejects.toBeDefined();
    expect(await db().select().from(s.attendanceRecords)).toHaveLength(0);
    await mutateSchoolHoliday(db(), f.admin, 'remove', { confirmed: true, expectedRevision: 1 }, row.id);
    expect((await putSessionAttendance(f.db, f.teacherActor, f.identity, { records }, sessionNow)).records).toHaveLength(1);
  });
  it.each(['session', 'legacy'] as const)('rejects creation and expansion over existing %s Attendance without changing it', async mode => {
    if (mode === 'session') await putSessionAttendance(f.db, f.teacherActor, f.identity, { records: [{ studentId: f.student.id, status: 'LATE', expectedVersion: null }] }, sessionNow);
    else await db().insert(s.attendanceRecords).values({ schoolId: f.schoolId, studentId: f.student.id, classId: f.classAId, academicYearId: f.yearId, attendanceDate: f.identity.date, status: 'EXCUSED' });
    const before = await db().select().from(s.attendanceRecords);
    await expect(mutateSchoolHoliday(db(), f.admin, 'create', input())).rejects.toMatchObject({ featureCode: 'HOLIDAY_ATTENDANCE_CONFLICT' });
    const row = await mutateSchoolHoliday(db(), f.admin, 'create', input('2025-10-09'));
    await expect(mutateSchoolHoliday(db(), f.admin, 'update', { ...input('2025-10-09', '2025-10-10'), expectedRevision: 1 }, row.id)).rejects.toMatchObject({ featureCode: 'HOLIDAY_ATTENDANCE_CONFLICT' });
    expect(await db().select().from(s.attendanceRecords)).toEqual(before);
    expect(await readSchoolHoliday(db(), f.admin, row.id)).toMatchObject({ endDate: '2025-10-09', revision: 1 });
    expect(await db().select().from(s.schoolHolidays)).toHaveLength(1);
  });
  it('permits metadata-only edits of a legacy closure without changing Attendance/history', async () => {
    const row = await mutateSchoolHoliday(db(), f.admin, 'create', input());
    await db().insert(s.attendanceRecords).values({ schoolId: f.schoolId, studentId: f.student.id, classId: f.classAId, academicYearId: f.yearId, attendanceDate: f.identity.date, status: 'PRESENT' });
    await expect(mutateSchoolHoliday(db(), f.admin, 'update', { ...input(), name: 'New name', expectedRevision: 1 }, row.id)).resolves.toMatchObject({ name: 'New name' });
    expect(await db().select().from(s.attendanceRecords)).toHaveLength(1);
    const history = await getDailyAttendance(f.db, f.admin, f.classAId, f.identity.date, { page: 1, pageSize: 20 });
    expect(history.data.holidays).toHaveLength(1);
    expect(history.data.students.find(v => v.student.id === f.student.id)?.attendance?.status).toBe('PRESENT');
  });
  it('uses the School civil date across a UTC date boundary', async () => {
    await db().update(s.schools).set({ timezone: 'Pacific/Kiritimati' }).where(eq(s.schools.id, f.schoolId));
    await mutateSchoolHoliday(db(), f.admin, 'create', input());
    const value = await readPublished(db(), f.teacherActor, {}, new Date('2025-10-09T12:00:00Z'));
    expect(value.today).toBe('2025-10-10');
    expect(value.holidays).toHaveLength(1);
    expect(value.schedules.flatMap(v => v.lessons)).toHaveLength(0);
  });
  it('does not report missing lessons, timetables or Attendance follow-up on a closed School day', async () => {
    const teacherActor = { userId: f.teacherActor.userId!, schoolId: f.schoolId };
    const adminActor = { userId: f.admin.userId!, schoolId: f.schoolId };
    const before = await teacherWorkspace(db(), teacherActor, sessionNow);
    expect(before.lessons).toHaveLength(2);
    await mutateSchoolHoliday(db(), f.admin, 'create', input());
    const teacher = await teacherWorkspace(db(), teacherActor, sessionNow);
    expect(teacher.lessons).toEqual([]); expect(teacher.pendingAttendance).toBe(0);
    const admin = await adminOverview(db(), adminActor, f.yearId, sessionNow);
    expect(admin.lessons).toEqual([]);
    expect(admin.metrics).toMatchObject({ pending: 0, recorded: 0, missingTimetable: 0 });
  });
  it('rolls back the holiday when its immutable audit append fails', async () => {
    await f.test.client.exec("create function reject_holiday_audit() returns trigger language plpgsql as $$ begin if NEW.action='SchoolHolidayCreated' then raise exception 'synthetic audit failure'; end if; return NEW; end; $$;create trigger reject_holiday_audit before insert on audit_events for each row execute function reject_holiday_audit();");
    await expect(mutateSchoolHoliday(db(), f.admin, 'create', input())).rejects.toBeDefined();
    expect(await db().select().from(s.schoolHolidays)).toHaveLength(0);
  });
  it('audits maximum-length localized prose without exceeding the shared metadata budget', async () => {
    const fields = { ...input(), name: 'ع'.repeat(160), description: 'é'.repeat(2000) };
    const row = await mutateSchoolHoliday(db(), f.admin, 'create', fields);
    await mutateSchoolHoliday(db(), f.admin, 'update', { ...fields, name: 'آ'.repeat(160), expectedRevision: 1 }, row.id);
    await mutateSchoolHoliday(db(), f.admin, 'remove', { confirmed: true, expectedRevision: 2 }, row.id);
    const events = await db().select().from(s.auditEvents).where(eq(s.auditEvents.resourceId, row.id));
    expect(events).toHaveLength(3);
    for (const event of events) expect(Buffer.byteLength(JSON.stringify(event.metadata))).toBeLessThan(1024);
    expect(JSON.parse(events.find(v => v.action === 'SchoolHolidayUpdated')!.metadata.after).contentSha256).not.toBe(JSON.parse(events.find(v => v.action === 'SchoolHolidayUpdated')!.metadata.before).contentSha256);
  });
  it('preserves weekly snapshots/history and scopes Parent reads before applying the date closure', async () => {
    const before = await db().select().from(s.timetablePublications);
    await mutateSchoolHoliday(db(), f.admin, 'create', input());
    const parent = await createActor(f.test, f.schoolId, 'PARENT');
    await seedParentRelationship(f, parent, f.student.id);
    for (const actor of [f.admin, f.teacherActor, parent]) {
      const value = await readPublished(db(), actor, { date: f.identity.date, ...(actor === parent ? { studentId: f.student.id } : {}) }, sessionNow);
      expect(value.holidays).toHaveLength(1);
      expect(value.schedules.flatMap(v => v.lessons).filter(l => l.weekday === 5)).toHaveLength(0);
      expect((await readPublished(db(), actor, { date: '2025-10-17' }, sessionNow)).schedules.flatMap(v => v.lessons)).toHaveLength(2);
    }
    await expect(readPublished(db(), parent, { date: f.identity.date, studentId: f.otherStudent.id }, sessionNow)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await db().select().from(s.timetablePublications)).toEqual(before);
  });
});
