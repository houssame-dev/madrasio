import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@school/database';

import * as app from '@/lib/modules/attendance/application';
import { attendanceEntrySchema, bulkAttendanceSchema } from '@/lib/modules/attendance/domain';
import type { AttendanceDb } from '@/lib/modules/attendance/infrastructure/repositories/attendance-repository';

import {
  createActor, createStudentsTestContext, seedStudent, seedTeacherScope,
  type StudentsTestContext,
} from '../students/test-helpers';

let context: StudentsTestContext;
let db: AttendanceDb;

beforeEach(async () => {
  context = await createStudentsTestContext();
  db = context.test.seed as unknown as AttendanceDb;
});

async function enroll(
  studentId: string,
  classId = context.classAId,
  effectiveFrom = '2025-09-01',
  effectiveUntil: string | null = null,
  status: 'ACTIVE' | 'ENDED' = effectiveUntil ? 'ENDED' : 'ACTIVE',
) {
  const [row] = await context.test.seed.insert(schema.studentEnrollments).values({
    schoolId: context.schoolId, studentId, academicYearId: context.yearId,
    classId, effectiveFrom, effectiveUntil, status,
  }).returning();
  return row;
}

async function studentInClass(suffix = '') {
  const student = await seedStudent(context.test, context.schoolId, suffix);
  await enroll(student.id);
  return student;
}

describe('Attendance write contracts and historical eligibility', () => {
  it('strictly validates statuses, authority fields, note bounds, and duplicate batch Students', () => {
    const studentId = randomUUID();
    for (const status of ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']) {
      expect(attendanceEntrySchema.safeParse({ studentId, status, note: null }).success).toBe(true);
    }
    expect(attendanceEntrySchema.safeParse({ studentId, status: 'SICK' }).success).toBe(false);
    expect(attendanceEntrySchema.safeParse({ studentId, status: 'PRESENT', schoolId: randomUUID() }).success)
      .toBe(false);
    expect(attendanceEntrySchema.safeParse({ studentId, status: 'PRESENT', note: 'x'.repeat(1001) }).success)
      .toBe(false);
    expect(bulkAttendanceSchema.safeParse({ records: [
      { studentId, status: 'PRESENT' }, { studentId, status: 'ABSENT' },
    ] }).success).toBe(false);
  });

  it('writes all four statuses and upserts status/note without changing logical identity', async () => {
    const students = await Promise.all(['1', '2', '3', '4'].map(studentInClass));
    const first = await app.putDailyAttendance(db, context.admin, context.classAId, '2025-10-10', {
      records: students.map((student, index) => ({
        studentId: student.id,
        status: ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'][index] as 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED',
        note: index === 1 ? 'Family reason' : null,
      })),
    });
    expect(first.records.map((record) => record.status)).toEqual(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']);
    const id = first.records[1].id;
    const corrected = await app.putDailyAttendance(db, context.admin, context.classAId, '2025-10-10', {
      records: [{ studentId: students[1].id, status: 'EXCUSED', note: 'Certificate received' }],
    });
    expect(corrected.records[0]).toMatchObject({ id, status: 'EXCUSED', note: 'Certificate received' });
    expect(await context.test.seed.select().from(schema.attendanceRecords).where(and(
      eq(schema.attendanceRecords.classId, context.classAId),
      eq(schema.attendanceRecords.studentId, students[1].id),
      eq(schema.attendanceRecords.attendanceDate, '2025-10-10'),
    ))).toHaveLength(1);
  });

  it('rolls back the entire batch when one Student is not eligible', async () => {
    const eligible = await studentInClass('eligible');
    const outsider = await seedStudent(context.test, context.schoolId, 'outsider');
    await expect(app.putDailyAttendance(db, context.admin, context.classAId, '2025-10-10', {
      records: [
        { studentId: eligible.id, status: 'PRESENT' },
        { studentId: outsider.id, status: 'ABSENT' },
      ],
    })).rejects.toMatchObject({ featureCode: 'STUDENT_NOT_ELIGIBLE_FOR_ATTENDANCE' });
    expect(await context.test.seed.select().from(schema.attendanceRecords)).toHaveLength(0);
  });

  it('enforces future and AcademicYear date bounds', async () => {
    const student = await studentInClass();
    await expect(app.putDailyAttendance(db, context.admin, context.classAId, '2099-01-01', {
      records: [{ studentId: student.id, status: 'PRESENT' }],
    })).rejects.toMatchObject({ featureCode: 'INVALID_ATTENDANCE_DATE' });
    await expect(app.putDailyAttendance(db, context.admin, context.classAId, '2025-08-31', {
      records: [{ studentId: student.id, status: 'PRESENT' }],
    })).rejects.toMatchObject({ featureCode: 'INVALID_ATTENDANCE_DATE' });
  });

  it('uses inclusive ENDED enrollment ranges across an exact Class A to Class B transfer', async () => {
    const student = await seedStudent(context.test, context.schoolId);
    await enroll(student.id, context.classAId, '2025-09-01', '2025-10-14', 'ENDED');
    await enroll(student.id, context.classBId, '2025-10-15');
    await expect(app.putDailyAttendance(db, context.admin, context.classAId, '2025-10-10', {
      records: [{ studentId: student.id, status: 'PRESENT' }],
    })).resolves.toBeDefined();
    await expect(app.putDailyAttendance(db, context.admin, context.classAId, '2025-10-16', {
      records: [{ studentId: student.id, status: 'ABSENT' }],
    })).rejects.toMatchObject({ featureCode: 'STUDENT_NOT_ELIGIBLE_FOR_ATTENDANCE' });
    await expect(app.putDailyAttendance(db, context.admin, context.classBId, '2025-10-16', {
      records: [{ studentId: student.id, status: 'LATE' }],
    })).resolves.toBeDefined();
    const history = await app.getStudentAttendanceHistory(db, context.admin, student.id, { page: 1, pageSize: 50 });
    expect(history.data.map((row) => [row.classId, row.attendanceDate])).toEqual([
      [context.classBId, '2025-10-16'], [context.classAId, '2025-10-10'],
    ]);
  });

  it('allows correction but not a new row after Class closure', async () => {
    const first = await studentInClass('first');
    const second = await studentInClass('second');
    const written = await app.putDailyAttendance(db, context.admin, context.classAId, '2025-10-10', {
      records: [{ studentId: first.id, status: 'ABSENT' }],
    });
    await context.test.seed.update(schema.classes).set({ status: 'CLOSED' })
      .where(eq(schema.classes.id, context.classAId));
    const corrected = await app.putDailyAttendance(db, context.admin, context.classAId, '2025-10-10', {
      records: [{ studentId: first.id, status: 'EXCUSED', note: 'Corrected' }],
    });
    expect(corrected.records[0]).toMatchObject({ id: written.records[0].id, status: 'EXCUSED' });
    await expect(app.putDailyAttendance(db, context.admin, context.classAId, '2025-10-10', {
      records: [{ studentId: second.id, status: 'PRESENT' }],
    })).rejects.toMatchObject({ featureCode: 'ATTENDANCE_ENTRY_NOT_ALLOWED' });
  });

  it('preserves one row under concurrent writes with last-committed state', async () => {
    const student = await studentInClass();
    await Promise.all([
      app.putDailyAttendance(db, context.admin, context.classAId, '2025-10-10', {
        records: [{ studentId: student.id, status: 'PRESENT' }],
      }),
      app.putDailyAttendance(db, context.admin, context.classAId, '2025-10-10', {
        records: [{ studentId: student.id, status: 'LATE' }],
      }),
    ]);
    const rows = await context.test.seed.select().from(schema.attendanceRecords);
    expect(rows).toHaveLength(1);
    expect(['PRESENT', 'LATE']).toContain(rows[0].status);
  });
});

describe('Attendance reads, authorization, and module isolation', () => {
  it('daily roster is date-historical and distinguishes missing from explicit PRESENT', async () => {
    const student = await seedStudent(context.test, context.schoolId);
    await enroll(student.id, context.classAId, '2025-09-01', '2025-10-14', 'ENDED');
    await enroll(student.id, context.classBId, '2025-10-15');
    let roster = await app.getDailyAttendance(db, context.admin, context.classAId, '2025-10-10', {
      page: 1, pageSize: 50,
    });
    expect(roster.data.students).toMatchObject([{ student: { id: student.id }, attendance: null }]);
    await app.putDailyAttendance(db, context.admin, context.classAId, '2025-10-10', {
      records: [{ studentId: student.id, status: 'PRESENT' }],
    });
    roster = await app.getDailyAttendance(db, context.admin, context.classAId, '2025-10-10', {
      page: 1, pageSize: 50,
    });
    expect(roster.data.students[0].attendance).toMatchObject({ status: 'PRESENT' });
    expect((await app.getDailyAttendance(db, context.admin, context.classAId, '2025-10-16', {
      page: 1, pageSize: 50,
    })).data.students).toHaveLength(0);
  });

  it('student history applies SQL filters, pagination, and deterministic date-desc ordering', async () => {
    const student = await studentInClass();
    for (const [date, status] of [
      ['2025-10-10', 'PRESENT'], ['2025-10-11', 'ABSENT'], ['2025-10-12', 'LATE'],
    ] as const) {
      await app.putDailyAttendance(db, context.admin, context.classAId, date, {
        records: [{ studentId: student.id, status }],
      });
    }
    const page = await app.getStudentAttendanceHistory(db, context.admin, student.id, {
      page: 1, pageSize: 2, academicYearId: context.yearId, classId: context.classAId,
      dateFrom: '2025-10-10', dateTo: '2025-10-12',
    });
    expect(page.meta).toEqual({ page: 1, pageSize: 2, total: 3 });
    expect(page.data.map((row) => row.attendanceDate)).toEqual(['2025-10-12', '2025-10-11']);
    expect((await app.getStudentAttendanceHistory(db, context.admin, student.id, {
      page: 1, pageSize: 50, status: 'ABSENT',
    })).data).toMatchObject([{ status: 'ABSENT' }]);
  });

  it('uses Class+Year Teacher scope independent of Subject and removes access when assignment ends', async () => {
    const student = await studentInClass();
    const teacher = await createActor(context.test, context.schoolId, 'TEACHER');
    await seedTeacherScope(context, teacher, context.classAId);
    await expect(app.putDailyAttendance(db, teacher, context.classAId, '2025-10-10', {
      records: [{ studentId: student.id, status: 'PRESENT' }],
    })).resolves.toBeDefined();
    await expect(app.getDailyAttendance(db, teacher, context.classBId, '2025-10-10', {
      page: 1, pageSize: 50,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await context.test.seed.update(schema.teacherAssignments).set({ status: 'ENDED', effectiveUntil: '2025-10-10' });
    await expect(app.putDailyAttendance(db, teacher, context.classAId, '2025-10-10', {
      records: [{ studentId: student.id, status: 'LATE' }],
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await context.test.seed.select().from(schema.attendanceRecords)).toHaveLength(1);
  });

  it('denies inactive Teacher profiles and Parents while allowing SchoolAdmin management', async () => {
    const student = await studentInClass();
    const teacher = await createActor(context.test, context.schoolId, 'TEACHER');
    await seedTeacherScope(context, teacher, context.classAId);
    await context.test.seed.update(schema.teachers).set({ status: 'INACTIVE' })
      .where(eq(schema.teachers.userId, teacher.userId!));
    await expect(app.getDailyAttendance(db, teacher, context.classAId, '2025-10-10', {
      page: 1, pageSize: 50,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const parent = await createActor(context.test, context.schoolId, 'PARENT');
    await expect(app.getStudentAttendanceHistory(db, parent, student.id, {
      page: 1, pageSize: 50,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(app.putDailyAttendance(db, context.admin, context.classAId, '2025-10-10', {
      records: [{ studentId: student.id, status: 'PRESENT' }],
    })).resolves.toBeDefined();
  });

  it('denies inactive identity/context and hides foreign Class and Student resources', async () => {
    const student = await studentInClass();
    await context.test.seed.update(schema.users).set({ status: 'SUSPENDED' })
      .where(eq(schema.users.id, context.admin.userId!));
    await expect(app.getDailyAttendance(db, context.admin, context.classAId, '2025-10-10', {
      page: 1, pageSize: 50,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await context.test.seed.update(schema.users).set({ status: 'ACTIVE' })
      .where(eq(schema.users.id, context.admin.userId!));
    await context.test.seed.update(schema.schoolMemberships).set({ status: 'INACTIVE' })
      .where(eq(schema.schoolMemberships.userId, context.admin.userId!));
    await expect(app.getStudentAttendanceHistory(db, context.admin, student.id, {
      page: 1, pageSize: 50,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await context.test.seed.update(schema.schoolMemberships).set({ status: 'ACTIVE' })
      .where(eq(schema.schoolMemberships.userId, context.admin.userId!));
    await expect(app.getDailyAttendance(db, context.admin, randomUUID(), '2025-10-10', {
      page: 1, pageSize: 50,
    })).rejects.toMatchObject({ featureCode: 'ATTENDANCE_NOT_FOUND' });
    await expect(app.getStudentAttendanceHistory(db, context.admin, randomUUID(), {
      page: 1, pageSize: 50,
    })).rejects.toMatchObject({ featureCode: 'ATTENDANCE_NOT_FOUND' });
  });

  it('creates no Grades, Results, Homework, ParentStudent, Notifications, or Outbox side effects', async () => {
    const student = await studentInClass();
    await app.putDailyAttendance(db, context.admin, context.classAId, '2025-10-10', {
      records: [{ studentId: student.id, status: 'ABSENT' }],
    });
    expect(await context.test.seed.select().from(schema.grades)).toHaveLength(0);
    expect(await context.test.seed.select().from(schema.subjectResults)).toHaveLength(0);
    expect(await context.test.seed.select().from(schema.periodResults)).toHaveLength(0);
    expect(await context.test.seed.select().from(schema.annualResults)).toHaveLength(0);
    expect(await context.test.seed.select().from(schema.homework)).toHaveLength(0);
    expect(await context.test.seed.select().from(schema.parentStudents)).toHaveLength(0);
    expect(await context.test.seed.select().from(schema.notifications)).toHaveLength(0);
    expect(await context.test.seed.select().from(schema.outboxEvents)).toHaveLength(0);
  });
});
