import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@school/database';
import { getDailyAttendance, getStudentAttendanceHistory, putDailyAttendance } from '@/lib/modules/attendance/application';
import type { AttendanceDb } from '@/lib/modules/attendance/infrastructure/repositories/attendance-repository';
import { createStudentsTestContext, seedStudent, type StudentsTestContext } from '../students/test-helpers';

let context: StudentsTestContext;
let db: AttendanceDb;
beforeEach(async () => { context = await createStudentsTestContext(); db = context.test.seed as unknown as AttendanceDb; });
afterEach(async () => { await context.test.client.close(); });
const paging = { page: 1, pageSize: 50 };

async function enroll(studentId: string, classId = context.classAId, effectiveFrom = '2025-09-01', effectiveUntil: string | null = null) {
  await context.test.seed.insert(schema.studentEnrollments).values({ schoolId: context.schoolId, studentId, academicYearId: context.yearId, classId, effectiveFrom, effectiveUntil, status: effectiveUntil ? 'ENDED' : 'ACTIVE' });
}
// Seed historical records directly. The application must never create or correct daily rows.
async function legacy(studentId: string, attendanceDate: string, status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED', classId = context.classAId, academicYearId = context.yearId, id = randomUUID()) {
  const [row] = await context.test.seed.insert(schema.attendanceRecords).values({ id, schoolId: context.schoolId, studentId, classId, academicYearId, attendanceDate, status }).returning();
  return row;
}

describe('Read-only legacy daily Attendance regressions', () => {
  it('uses inclusive historical enrollment dates across transfers, including inactive Students, and distinguishes unmarked from PRESENT', async () => {
    const student = await seedStudent(context.test, context.schoolId);
    await enroll(student.id, context.classAId, '2025-09-01', '2025-10-14');
    await enroll(student.id, context.classBId, '2025-10-15');
    await context.test.seed.update(schema.students).set({ status: 'INACTIVE' }).where(eq(schema.students.id, student.id));
    const read = (classId: string, date: string) => getDailyAttendance(db, context.admin, classId, date, paging);
    expect((await read(context.classAId, '2025-10-13')).data.students).toMatchObject([{ student: { id: student.id, status: 'INACTIVE' }, attendance: null }]);
    const original = await legacy(student.id, '2025-10-14', 'PRESENT');
    expect((await read(context.classAId, '2025-10-14')).data.students).toMatchObject([{ student: { id: student.id }, attendance: { id: original.id, status: 'PRESENT' } }]);
    expect((await read(context.classAId, '2025-10-15')).data.students).toEqual([]);
    expect((await read(context.classBId, '2025-10-14')).data.students).toEqual([]);
    expect((await read(context.classBId, '2025-10-15')).data.students).toMatchObject([{ student: { id: student.id }, attendance: null }]);
    await expect(putDailyAttendance(db, context.admin, context.classAId, '2025-10-14', { records: [{ studentId: student.id, status: 'ABSENT' }] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await context.test.seed.select().from(schema.attendanceRecords)).toEqual([original]);
  });

  it('paginates the date-eligible daily roster by last name, first name and stable Student ID', async () => {
    const ids = [4, 3, 2, 1].map(n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
    await context.test.seed.insert(schema.students).values(ids.map((id, i) => ({ id, schoolId: context.schoolId, lastName: i === 0 ? 'Zaki' : 'Amrani', firstName: i === 1 ? 'Zoe' : 'Amina' })));
    for (const id of ids) await enroll(id);
    const future = await seedStudent(context.test, context.schoolId, 'future'); await enroll(future.id, context.classAId, '2025-10-11');
    const otherClass = await seedStudent(context.test, context.schoolId, 'other'); await enroll(otherClass.id, context.classBId);
    const read = (page: number) => getDailyAttendance(db, context.admin, context.classAId, '2025-10-10', { page, pageSize: 2 });
    const first = await read(1), second = await read(2), empty = await read(3);
    expect(first.meta).toEqual({ page: 1, pageSize: 2, total: 4 });
    expect(second.meta).toEqual({ page: 2, pageSize: 2, total: 4 });
    expect([...first.data.students, ...second.data.students].map(row => row.student.id)).toEqual([ids[3], ids[2], ids[1], ids[0]]);
    expect(empty.data.students).toEqual([]); expect(empty.meta.total).toBe(4);
  });

  it('filters historical Student rows by year, Class, inclusive dates and status before pagination, ordering by date then ID descending', async () => {
    const student = await seedStudent(context.test, context.schoolId);
    const otherStudent = await seedStudent(context.test, context.schoolId, 'other');
    const [oldYear] = await context.test.seed.insert(schema.academicYears).values({ schoolId: context.schoolId, name: '2024/2025', startDate: '2024-09-01', endDate: '2025-07-01', status: 'CLOSED' }).returning();
    const [oldClass] = await context.test.seed.insert(schema.classes).values({ schoolId: context.schoolId, academicYearId: oldYear.id, levelId: context.levelId, curriculumVersionId: context.curriculumVersionId, name: 'Historical Class' }).returning();
    const old = await legacy(student.id, '2025-06-01', 'EXCUSED', oldClass.id, oldYear.id);
    const early = await legacy(student.id, '2025-10-10', 'PRESENT');
    const absent = await legacy(student.id, '2025-10-11', 'ABSENT');
    const lowId = '00000000-0000-4000-8000-000000000001';
    const highId = '00000000-0000-4000-8000-000000000002';
    const latestA = await legacy(student.id, '2025-10-12', 'LATE', context.classAId, context.yearId, lowId);
    const latestB = await legacy(student.id, '2025-10-12', 'EXCUSED', context.classBId, context.yearId, highId);
    await legacy(otherStudent.id, '2025-10-12', 'ABSENT');
    const before = await context.test.seed.select().from(schema.attendanceRecords).orderBy(schema.attendanceRecords.id);
    const read = (input: Parameters<typeof getStudentAttendanceHistory>[3]) => getStudentAttendanceHistory(db, context.admin, student.id, input);
    const first = await read({ page: 1, pageSize: 2, academicYearId: context.yearId, dateFrom: '2025-10-10', dateTo: '2025-10-12' });
    const second = await read({ page: 2, pageSize: 2, academicYearId: context.yearId, dateFrom: '2025-10-10', dateTo: '2025-10-12' });
    expect(first.meta).toEqual({ page: 1, pageSize: 2, total: 4 });
    expect(first.data.map(row => row.id)).toEqual([latestB.id, latestA.id]);
    expect(second.data.map(row => row.id)).toEqual([absent.id, early.id]);
    expect((await read({ ...paging, classId: context.classBId })).data.map(row => row.id)).toEqual([latestB.id]);
    expect((await read({ ...paging, academicYearId: oldYear.id })).data.map(row => row.id)).toEqual([old.id]);
    expect((await read({ ...paging, status: 'ABSENT' })).data.map(row => row.id)).toEqual([absent.id]);
    expect((await read({ ...paging, dateFrom: '2025-10-11', dateTo: '2025-10-11' })).data.map(row => row.id)).toEqual([absent.id]);
    const none = await read({ ...paging, classId: context.classBId, status: 'ABSENT' });
    expect(none.data).toEqual([]); expect(none.meta.total).toBe(0);
    expect((await read({ page: 3, pageSize: 2, academicYearId: context.yearId })).data).toEqual([]);
    expect(first.data.every(row => row.publicationId === null && row.session === null && !('schoolId' in row))).toBe(true);
    expect(await context.test.seed.select().from(schema.attendanceRecords).orderBy(schema.attendanceRecords.id)).toEqual(before);
  });
});
