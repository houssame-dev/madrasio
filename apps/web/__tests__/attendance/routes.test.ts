import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@school/database';

import type { CurrentContext } from '@/lib/authorization/context';
import { UnauthenticatedError } from '@/lib/errors';
import type { AttendanceDb } from '@/lib/modules/attendance/infrastructure/repositories/attendance-repository';

import {
  createActor, createStudentsTestContext, seedStudent, seedTeacherScope,
  type StudentsTestContext,
} from '../students/test-helpers';

const mocks = vi.hoisted(() => ({ db: null as unknown, context: null as unknown, error: null as unknown }));
vi.mock('@/lib/db/client', () => ({ getDb: () => mocks.db }));
vi.mock('@/lib/auth/require-context', () => ({
  requireCurrentContext: async () => {
    if (mocks.error) throw mocks.error;
    return mocks.context;
  },
}));

import { dailyAttendanceGET, dailyAttendancePUT, studentAttendanceGET } from '@/lib/api/attendance';

let context: StudentsTestContext;
let studentId: string;

beforeEach(async () => {
  context = await createStudentsTestContext();
  const student = await seedStudent(context.test, context.schoolId);
  studentId = student.id;
  await context.test.seed.insert(schema.studentEnrollments).values({
    schoolId: context.schoolId, studentId, academicYearId: context.yearId,
    classId: context.classAId, effectiveFrom: '2025-09-01', status: 'ACTIVE',
  });
  mocks.db = context.test.seed as unknown as AttendanceDb;
  mocks.context = contextFor(context.admin.userId!, context.schoolId, 'SCHOOL_ADMIN');
  mocks.error = null;
});

function contextFor(userId: string, schoolId: string, role: CurrentContext['role']): CurrentContext {
  return {
    userId, userActive: true, membership: { schoolId, status: 'ACTIVE' },
    schoolContext: { schoolId, isValid: true }, role,
    scope: { teacherAssignments: [], parentStudents: [] },
  };
}
const json = (body: unknown) => new Request('http://local', {
  method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const dailyParams = (classId = context.classAId, date = '2025-10-10') => ({
  params: Promise.resolve({ id: classId, date }),
});
const studentParams = (id = studentId) => ({ params: Promise.resolve({ id }) });

describe('Attendance HTTP contracts', () => {
  it('bulk-upserts and returns a daily roster that preserves missing-row semantics', async () => {
    let response = await dailyAttendanceGET(new Request('http://local?pageSize=10'), dailyParams());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { attendanceDate: '2025-10-10', students: [{ student: { id: studentId }, attendance: null }] },
      meta: { page: 1, pageSize: 10, total: 1 },
    });
    response = await dailyAttendancePUT(json({
      records: [{ studentId, status: 'ABSENT', note: 'Absent' }],
    }), dailyParams());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { records: [{ studentId, status: 'ABSENT' }] } });
    response = await dailyAttendanceGET(new Request('http://local'), dailyParams());
    expect((await response.json()).data.students[0].attendance).toMatchObject({ status: 'ABSENT' });
  });

  it('returns filtered paginated Student history', async () => {
    await dailyAttendancePUT(json({ records: [{ studentId, status: 'LATE' }] }), dailyParams());
    const response = await studentAttendanceGET(new Request(
      `http://local?page=1&pageSize=10&academicYearId=${context.yearId}&classId=${context.classAId}&status=LATE&dateFrom=2025-10-01&dateTo=2025-10-31`,
    ), studentParams());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: [{ studentId, classId: context.classAId, status: 'LATE' }],
      meta: { page: 1, pageSize: 10, total: 1 },
    });
  });

  it('rejects malformed/authoritative input and invalid eligibility atomically', async () => {
    expect((await dailyAttendancePUT(json({
      schoolId: context.schoolId,
      records: [{ studentId, status: 'PRESENT' }],
    }), dailyParams())).status).toBe(400);
    expect((await dailyAttendancePUT(json({
      records: [{ studentId, status: 'SICK' }],
    }), dailyParams())).status).toBe(400);
    expect((await studentAttendanceGET(new Request(
      'http://local?dateFrom=2025-11-01&dateTo=2025-10-01',
    ), studentParams())).status).toBe(400);
    const outsider = await seedStudent(context.test, context.schoolId, 'outside');
    const failed = await dailyAttendancePUT(json({ records: [
      { studentId, status: 'PRESENT' }, { studentId: outsider.id, status: 'ABSENT' },
    ] }), dailyParams());
    expect(failed.status).toBe(422);
    expect(await failed.json()).toMatchObject({
      error: { featureCode: 'STUDENT_NOT_ELIGIBLE_FOR_ATTENDANCE' },
    });
    expect(await context.test.seed.select().from(schema.attendanceRecords)).toHaveLength(0);
  });

  it('enforces Teacher Class scope and denies Parent raw access', async () => {
    const teacher = await createActor(context.test, context.schoolId, 'TEACHER');
    await seedTeacherScope(context, teacher, context.classAId);
    mocks.context = contextFor(teacher.userId!, context.schoolId, 'TEACHER');
    expect((await dailyAttendancePUT(json({
      records: [{ studentId, status: 'PRESENT' }],
    }), dailyParams())).status).toBe(200);
    expect((await dailyAttendanceGET(new Request('http://local'), dailyParams(context.classBId))).status).toBe(403);
    const parent = await createActor(context.test, context.schoolId, 'PARENT');
    mocks.context = contextFor(parent.userId!, context.schoolId, 'PARENT');
    expect((await studentAttendanceGET(new Request('http://local'), studentParams())).status).toBe(403);
  });

  it('maps authentication/context failures and hides foreign identifiers', async () => {
    mocks.error = new UnauthenticatedError();
    expect((await dailyAttendanceGET(new Request('http://local'), dailyParams())).status).toBe(401);
    mocks.error = null;
    await context.test.seed.update(schema.schoolMemberships).set({ status: 'INACTIVE' })
      .where(eq(schema.schoolMemberships.userId, context.admin.userId!));
    expect((await dailyAttendanceGET(new Request('http://local'), dailyParams())).status).toBe(403);
    await context.test.seed.update(schema.schoolMemberships).set({ status: 'ACTIVE' })
      .where(eq(schema.schoolMemberships.userId, context.admin.userId!));
    expect((await dailyAttendanceGET(new Request('http://local'), dailyParams(crypto.randomUUID()))).status).toBe(404);
    expect((await studentAttendanceGET(new Request('http://local'), studentParams(crypto.randomUUID()))).status).toBe(404);
  });
});
