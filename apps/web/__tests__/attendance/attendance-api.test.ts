// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '@school/database';
import { listSessions, getSessionRoster, putSessionAttendance } from '@/lib/modules/attendance/application/session-service';
import { getDailyAttendance, getStudentAttendanceHistory, putDailyAttendance } from '@/lib/modules/attendance/application';
import { sessionAttendanceSchema } from '@/lib/modules/attendance/domain';
import { createActor, seedTeacherScope, seedParentRelationship } from '../students/test-helpers';
import { listChildAttendance } from '@/lib/modules/parents/application/parent-child-read-service';
import type { ParentsDb } from '@/lib/modules/parents/infrastructure/repositories/parent-repository';
import { sessionFixture, sessionNow } from './session-fixture';
let f: Awaited<ReturnType<typeof sessionFixture>>;
beforeEach(async () => { f = await sessionFixture(); }, 30000);
afterEach(async () => { await f?.test.client.close(); });
const entry = (status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' = 'PRESENT', expectedVersion: number | null = null) => ({ records: [{ studentId: f.student.id, status, expectedVersion }] });
const write = (body = entry(), identity = f.identity) => putSessionAttendance(f.db, f.teacherActor, identity, body, sessionNow);
describe('published session Attendance', () => {
  it('records separate lessons, corrects one, preserves audit history and handles identical repeats', async () => {
    expect((await listSessions(f.db, f.teacherActor, { date: f.identity.date }, sessionNow)).sessions).toHaveLength(2);
    const first = await write(); await write(entry('ABSENT'), { ...f.identity, lessonKey: f.lessonKeys[1] });
    expect((await write()).records[0]).toEqual(first.records[0]);
    const corrected = await write(entry('EXCUSED', 1)); expect(corrected.records[0]).toMatchObject({ id: first.records[0].id, version: 2, status: 'EXCUSED', updatedBy: f.teacherActor.userId });
    await expect(write(entry('LATE', 1))).rejects.toMatchObject({ code: 'CONFLICT' });
    const rows = await f.test.seed.select().from(s.attendanceRecords); expect(rows).toHaveLength(2); expect(rows.find(r => r.lessonKey === f.lessonKeys[1])?.status).toBe('ABSENT');
    const audits = await f.test.seed.select().from(s.auditEvents); expect(audits.filter(e => e.action === 'AttendanceRecorded')).toHaveLength(2); expect(audits.find(e => e.action === 'AttendanceCorrected')?.metadata).toMatchObject({ oldStatus: 'PRESENT', newStatus: 'EXCUSED', version: '2' });
  });
  it('denies Admin and all legacy daily writes while retaining school-wide legacy and session history', async () => {
    await expect(putSessionAttendance(f.db, f.admin, f.identity, entry(), sessionNow)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    for (const actor of [f.admin, f.teacherActor]) await expect(putDailyAttendance(f.db, actor, f.classAId, f.identity.date, { records: [{ studentId: f.student.id, status: 'PRESENT' }] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await getSessionRoster(f.db, f.admin, f.identity, 1, sessionNow)).data.session.writable).toBe(false);
    const [legacy] = await f.test.seed.insert(s.attendanceRecords).values({ schoolId: f.schoolId, classId: f.classAId, academicYearId: f.yearId, studentId: f.student.id, attendanceDate: f.identity.date, status: 'LATE', note: 'Historical daily' }).returning();
    await write();
    expect((await getDailyAttendance(f.db, f.admin, f.classAId, f.identity.date, { page: 1, pageSize: 20 })).data.students[0].attendance?.id).toBe(legacy.id);
    const history = await getStudentAttendanceHistory(f.db, f.admin, f.student.id, { page: 1, pageSize: 20 }); expect(history.data).toHaveLength(2); expect(history.data.find(r => r.id === legacy.id)).toMatchObject({ publicationId: null, session: null, status: 'LATE', note: 'Historical daily' });
  });
  it('rejects wrong Teacher, School, lesson, missing publication, duplicates and spoofed authority', async () => {
    const other = await createActor(f.test, f.schoolId, 'TEACHER'); await seedTeacherScope(f, other, f.classBId);
    await expect(putSessionAttendance(f.db, other, f.identity, entry(), sessionNow)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(putSessionAttendance(f.db, { ...f.teacherActor, schoolId: randomUUID() }, f.identity, entry(), sessionNow)).rejects.toBeDefined();
    for (const id of [{ ...f.identity, lessonKey: randomUUID() }, { ...f.identity, publicationId: randomUUID() }]) await expect(write(entry(), id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(sessionAttendanceSchema.safeParse({ ...entry(), teacherId: f.scope.teacher.id }).success).toBe(false);
    expect(sessionAttendanceSchema.safeParse({ records: [entry().records[0], entry().records[0]] }).success).toBe(false);
  });
  it('fails atomically for unenrolled students and resolves transfers by historical Class and date', async () => {
    await expect(write({ records: [...entry().records, { studentId: f.otherStudent.id, status: 'ABSENT', expectedVersion: null }] })).rejects.toMatchObject({ featureCode: 'STUDENT_NOT_ELIGIBLE_FOR_ATTENDANCE' });
    expect(await f.test.seed.select().from(s.attendanceRecords)).toHaveLength(0);
    await f.test.seed.update(s.studentEnrollments).set({ status: 'ENDED', effectiveUntil: '2025-10-10' }).where(eq(s.studentEnrollments.studentId, f.student.id));
    await f.test.seed.insert(s.studentEnrollments).values({ schoolId: f.schoolId, academicYearId: f.yearId, studentId: f.student.id, classId: f.classBId, effectiveFrom: '2025-10-11', status: 'ACTIVE' });
    await write(); await expect(putSessionAttendance(f.db, f.teacherActor, { ...f.identity, date: '2025-10-17' }, entry(), new Date('2025-10-17T18:00:00Z'))).rejects.toMatchObject({ featureCode: 'STUDENT_NOT_ELIGIBLE_FOR_ATTENDANCE' });
  });
  it('honors exact School-local start, weekdays, future dates and assignment lifecycle', async () => {
    await f.test.seed.update(s.schools).set({ timezone: 'America/New_York' }).where(eq(s.schools.id, f.schoolId));
    await expect(putSessionAttendance(f.db, f.teacherActor, f.identity, entry(), new Date('2025-10-10T11:59:59Z'))).rejects.toMatchObject({ featureCode: 'ATTENDANCE_ENTRY_NOT_ALLOWED' });
    await expect(putSessionAttendance(f.db, f.teacherActor, f.identity, entry(), sessionNow)).resolves.toBeDefined();
    await expect(write(entry(), { ...f.identity, date: '2025-10-17' })).rejects.toMatchObject({ featureCode: 'ATTENDANCE_ENTRY_NOT_ALLOWED' });
    await expect(write(entry(), { ...f.identity, date: '2025-10-11' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await f.test.seed.update(s.teacherAssignments).set({ status: 'ENDED', effectiveUntil: '2025-10-09' }).where(eq(s.teacherAssignments.id, f.scope.assignment.id));
    await expect(write(entry('ABSENT', 1))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('ends applicability on empty replacement without rewriting prior records', async () => {
    await write(); const [old] = await f.test.seed.select().from(s.timetablePublications);
    await f.test.seed.insert(s.timetablePublications).values({ schoolId: old.schoolId, academicYearId: old.academicYearId, classId: old.classId, draftId: old.draftId, sequence: 2, effectiveFrom: '2025-10-17', validUntil: old.validUntil, snapshot: { ...old.snapshot, lessons: [] }, requestKey: randomUUID(), requestHash: 'replacement', publishedBy: f.admin.userId! });
    expect((await listSessions(f.db, f.teacherActor, { date: '2025-10-17' }, new Date('2025-10-17T18:00:00Z'))).sessions).toEqual([]);
    await expect(putSessionAttendance(f.db, f.teacherActor, { ...f.identity, date: '2025-10-17' }, entry(), new Date('2025-10-17T18:00:00Z'))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await write(entry('LATE', 1))).records[0].status).toBe('LATE');
  });
  it('denies Parents even with a known session identifier', async () => {
    const parent = await createActor(f.test, f.schoolId, 'PARENT');
    await expect(getSessionRoster(f.db, parent, f.identity)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(putSessionAttendance(f.db, parent, f.identity, entry(), sessionNow)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('preserves Parent child isolation while exposing only safe session history labels', async () => {
    await write(); const parent = await createActor(f.test, f.schoolId, 'PARENT'); await seedParentRelationship(f, parent, f.student.id);
    const db = f.test.seed as unknown as ParentsDb;
    const result = await listChildAttendance(db, parent, f.student.id, { academicYearId: f.yearId, page: 1, pageSize: 20 });
    expect(result.data[0].session).toEqual({ subjectName: 'Mathematics', start: '08:00', end: '09:00' });
    expect(result.data[0]).not.toHaveProperty('note'); expect(result.data[0].session).not.toHaveProperty('teacherId');
    await expect(listChildAttendance(db, parent, f.otherStudent.id, { academicYearId: f.yearId, page: 1, pageSize: 20 })).rejects.toMatchObject({ featureCode: 'CHILD_NOT_AVAILABLE' });
  });
  it('does not expose another Teachers session records through Student history in the same Class', async () => {
    await write(); const other = await createActor(f.test, f.schoolId, 'TEACHER'); await seedTeacherScope(f, other, f.classAId);
    expect((await getStudentAttendanceHistory(f.db, other, f.student.id, { page: 1, pageSize: 20 })).data).toEqual([]);
    expect((await getStudentAttendanceHistory(f.db, f.teacherActor, f.student.id, { page: 1, pageSize: 20 })).data).toHaveLength(1);
  });
});
