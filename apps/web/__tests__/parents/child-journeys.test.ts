import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as s from '@school/database';
import { beforeEach, describe, expect, it } from 'vitest';
import { listChildAttendance, listChildHomework } from '@/lib/modules/parents/application';
import { createActor, createParentsTestContext } from './test-helpers';
import { seedParentRelationship, seedStudent } from '../students/test-helpers';
import { seedSchool } from '../auth/test-helpers';

let c: Awaited<ReturnType<typeof createParentsTestContext>>;
let actor: Awaited<ReturnType<typeof createActor>>;
let studentId: string;
let teacherId: string;
let periodId: string;
const input = () => ({ academicYearId: c.yearId, page: 1, pageSize: 1 });
beforeEach(async () => {
  c = await createParentsTestContext(); actor = await createActor(c, 'PARENT');
  studentId = (await seedStudent(c.test, c.schoolId)).id;
  await seedParentRelationship(c, actor, studentId);
  await c.test.seed.insert(s.studentEnrollments).values({ schoolId: c.schoolId, studentId,
    classId: c.classAId, academicYearId: c.yearId, effectiveFrom: '2025-09-01', effectiveUntil: '2025-10-10', status: 'ENDED' });
  const [teacher] = await c.test.seed.insert(s.teachers).values({ schoolId: c.schoolId, firstName: 'Teacher', lastName: 'Author' }).returning();
  teacherId = teacher.id;
  const [period] = await c.test.seed.insert(s.academicPeriods).values({ schoolId: c.schoolId, academicYearId: c.yearId,
    name: 'Term', sequence: 1, startDate: '2025-09-01', endDate: '2025-12-31' }).returning(); periodId = period.id;
});
async function homework(dueDate = '2025-10-10', status: 'PUBLISHED' | 'DRAFT' | 'CLOSED' | 'ARCHIVED' = 'PUBLISHED', classId = c.classAId) {
  const [h] = await c.test.seed.insert(s.homework).values({ schoolId: c.schoolId, teacherId, subjectId: c.subjectId,
    academicYearId: c.yearId, academicPeriodId: periodId, title: 'Practice', description: 'Read chapters.', dueDate, status }).returning();
  await c.test.seed.insert(s.homeworkTargets).values({ schoolId: c.schoolId, homeworkId: h.id, academicYearId: c.yearId, classId });
  return h;
}
async function attendance(date: string, classId = c.classAId) {
  await c.test.seed.insert(s.attendanceRecords).values({ schoolId: c.schoolId, studentId,
    classId, academicYearId: c.yearId, attendanceDate: date, status: 'LATE', note: 'Staff metadata' });
}
describe('Parent Attendance and Homework discovery', () => {
  it('reads inclusive historical Attendance, paginates and excludes invalid Class/date context without exposing staff metadata', async () => {
    await attendance('2025-09-01'); await attendance('2025-10-10'); await attendance('2025-10-11'); await attendance('2025-10-10', c.classBId);
    const first = await listChildAttendance(c.parentDb, actor, studentId, input());
    expect(first).toMatchObject({ data: [{ date: '2025-10-10', status: 'LATE', className: 'Class A' }], meta: { total: 2 } });
    expect(Object.keys(first.data[0]).sort()).toEqual(['className', 'date', 'id', 'status']);
    expect((await listChildAttendance(c.parentDb, actor, studentId, { ...input(), page: 2 })).data[0].date).toBe('2025-09-01');
    expect((await listChildAttendance(c.parentDb, actor, studentId, { ...input(), dateFrom: '2025-10-10', dateTo: '2025-10-10' })).meta.total).toBe(1);
  });
  it('keeps School date-only boundaries unchanged across extreme School timezones and validates filters', async () => {
    await attendance('2025-10-10');
    for (const timezone of ['Pacific/Kiritimati', 'America/Los_Angeles']) {
      await c.test.seed.update(s.schools).set({ timezone }).where(eq(s.schools.id, c.schoolId));
      expect((await listChildAttendance(c.parentDb, actor, studentId, { ...input(), dateFrom: '2025-10-10', dateTo: '2025-10-10' })).data[0].date).toBe('2025-10-10');
    }
    for (const extra of [{ dateFrom: '2025-02-30' }, { dateFrom: '2025-10-11', dateTo: '2025-10-10' }, { pageSize: 101 }, { schoolId: randomUUID() }]) {
      await expect(listChildAttendance(c.parentDb, actor, studentId, { ...input(), ...extra })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }
  });
  it('uses due-date enrollment rather than current Class; hides drafts and unrelated targets; deduplicates and paginates', async () => {
    const h = await homework(); await homework('2025-09-01', 'ARCHIVED'); await homework('2025-10-09', 'CLOSED');
    await homework('2025-10-10', 'DRAFT'); await homework('2025-10-11'); await homework('2025-10-10', 'PUBLISHED', c.classBId);
    await c.test.seed.insert(s.studentEnrollments).values({ schoolId: c.schoolId, studentId, academicYearId: c.yearId,
      classId: c.classBId, effectiveFrom: '2025-10-11', status: 'ACTIVE' });
    await c.test.seed.insert(s.homeworkTargets).values({ schoolId: c.schoolId, homeworkId: h.id, academicYearId: c.yearId, classId: c.classBId });
    const page = await listChildHomework(c.parentDb, actor, studentId, input());
    expect(page).toMatchObject({ data: [{ id: h.id, dueDate: '2025-10-10', subjectName: 'Mathematics', periodName: 'Term' }], meta: { total: 3 } });
    expect(page.data[0]).not.toHaveProperty('teacherId'); expect(page.data[0]).not.toHaveProperty('submissions');
    expect((await listChildHomework(c.parentDb, actor, studentId, { ...input(), page: 2 })).data[0].status).toBe('CLOSED');
  });
  it('returns empty pages without manufacturing attendance or submissions', async () => {
    expect((await listChildAttendance(c.parentDb, actor, studentId, input())).data).toEqual([]);
    expect((await listChildHomework(c.parentDb, actor, studentId, input())).data).toEqual([]);
    expect(await c.test.seed.select().from(s.homeworkSubmissions)).toEqual([]);
  });
  it('returns one Homework when more than one historical target matches the same child', async () => {
    const h = await homework();
    await c.test.seed.insert(s.studentEnrollments).values({ schoolId: c.schoolId, studentId, academicYearId: c.yearId,
      classId: c.classBId, effectiveFrom: '2025-10-10', effectiveUntil: '2025-10-10', status: 'ENDED' });
    await c.test.seed.insert(s.homeworkTargets).values({ schoolId: c.schoolId, homeworkId: h.id, academicYearId: c.yearId, classId: c.classBId });
    const result = await listChildHomework(c.parentDb, actor, studentId, input());
    expect(result.meta.total).toBe(1); expect(result.data).toHaveLength(1);
  });
  it('denies unrelated, forged and foreign child IDs and forged School context for both journeys', async () => {
    const unrelated = await seedStudent(c.test, c.schoolId, 'unrelated');
    const foreignSchool = await seedSchool(c.test.seed);
    const foreign = await seedStudent(c.test, foreignSchool.id, 'foreign');
    for (const read of [listChildAttendance, listChildHomework]) {
      for (const id of [unrelated.id, foreign.id, randomUUID()]) await expect(read(c.parentDb, actor, id, input())).rejects.toMatchObject({ featureCode: 'CHILD_NOT_AVAILABLE' });
      await expect(read(c.parentDb, { ...actor, schoolId: foreignSchool.id }, studentId, input())).rejects.toBeDefined();
      await expect(read(c.parentDb, actor, studentId, { ...input(), academicYearId: randomUUID() })).rejects.toMatchObject({ featureCode: 'ACADEMIC_CONTEXT_NOT_AVAILABLE' });
    }
  });
  it.each(['ENDED', 'INACTIVE_PROFILE'] as const)('denies %s relationships on fresh reads without deleting records', async (state) => {
    await homework(); await attendance('2025-10-10');
    if (state === 'ENDED') await c.test.seed.update(s.parentStudents).set({ status: 'ENDED' });
    else await c.test.seed.update(s.parents).set({ status: 'INACTIVE' });
    for (const read of [listChildAttendance, listChildHomework]) await expect(read(c.parentDb, actor, studentId, input())).rejects.toMatchObject({ featureCode: 'CHILD_NOT_AVAILABLE' });
    expect(await c.test.seed.select().from(s.attendanceRecords)).toHaveLength(1);
  });
  it.each(['TEACHER', 'SCHOOL_ADMIN'] as const)('does not treat %s authority as Parent access', async (role) => {
    const other = await createActor(c, role);
    for (const read of [listChildAttendance, listChildHomework]) await expect(read(c.parentDb, other, studentId, input())).rejects.toBeDefined();
  });
});
