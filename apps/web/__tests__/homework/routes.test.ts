import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@school/database';

import type { CurrentContext } from '@/lib/authorization/context';
import { UnauthenticatedError } from '@/lib/errors';
import type { HomeworkDb } from '@/lib/modules/homework/infrastructure/repositories/homework-repository';

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

import {
  homeworkGET, homeworkPATCH, homeworkSubmissionGET, homeworkSubmissionReviewPOST,
  homeworkStudentsGET, homeworkSubmissionsGET, homeworkSubmissionsPOST,
  homeworkTargetsGET, homeworkTargetsPOST, homeworksGET, homeworksPOST,
} from '@/lib/api/homework';

let context: StudentsTestContext;
let teacher: Awaited<ReturnType<typeof createActor>>;
let periodId: string;

function current(userId: string, schoolId: string, role: CurrentContext['role']): CurrentContext {
  return {
    userId, userActive: true, membership: { schoolId, status: 'ACTIVE' },
    schoolContext: { schoolId, isValid: true }, role,
    scope: { teacherAssignments: [], parentStudents: [] },
  };
}
function body(value: unknown, method = 'POST') {
  return new Request('http://local', {
    method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(value),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const createInput = () => ({
  subjectId: context.subjectId,
  academicYearId: context.yearId,
  academicPeriodId: periodId,
  title: 'API Homework',
  description: 'Solve it.',
  dueDate: '2025-10-10',
});

beforeEach(async () => {
  context = await createStudentsTestContext();
  const [period] = await context.test.seed.insert(schema.academicPeriods).values({
    schoolId: context.schoolId, academicYearId: context.yearId, name: 'Term 1', sequence: 1,
    startDate: '2025-09-01', endDate: '2025-12-31', status: 'ACTIVE',
  }).returning();
  periodId = period.id;
  teacher = await createActor(context.test, context.schoolId, 'TEACHER');
  await seedTeacherScope(context, teacher, context.classAId);
  mocks.db = context.test.seed as unknown as HomeworkDb;
  mocks.context = current(teacher.userId!, context.schoolId, 'TEACHER');
  mocks.error = null;
});

async function createPublished() {
  const created = await homeworksPOST(body(createInput()));
  const homework = (await created.json()).data;
  await homeworkTargetsPOST(body({ classIds: [context.classAId] }), params(homework.id));
  await homeworkPATCH(body({ status: 'PUBLISHED' }, 'PATCH'), params(homework.id));
  return homework;
}

describe('Homework HTTP contracts', () => {
  it('creates, lists, reads, filters, patches, and validates strict input', async () => {
    let response = await homeworksPOST(body(createInput()));
    expect(response.status).toBe(201);
    const homework = (await response.json()).data;
    expect(homework).toMatchObject({ title: 'API Homework', status: 'DRAFT' });
    response = await homeworksGET(new Request(`http://local?page=1&pageSize=10&status=DRAFT&search=API&academicYearId=${context.yearId}`));
    expect(await response.json()).toMatchObject({ data: [{ id: homework.id }], meta: { total: 1 } });
    expect((await homeworkGET(new Request('http://local'), params(homework.id))).status).toBe(200);
    response = await homeworkPATCH(body({ title: 'Updated API Homework' }, 'PATCH'), params(homework.id));
    expect(await response.json()).toMatchObject({ data: { title: 'Updated API Homework' } });
    expect((await homeworksPOST(body({ ...createInput(), schoolId: context.schoolId }))).status).toBe(400);
    expect((await homeworksPOST(body({ ...createInput(), teacherId: crypto.randomUUID() }))).status).toBe(400);
    expect((await homeworksGET(new Request('http://local?pageSize=101'))).status).toBe(400);
  });

  it('manages targets, submissions, review, and the submission:null roster contract', async () => {
    const homework = await createPublished();
    expect(await (await homeworkTargetsGET(new Request('http://local'), params(homework.id))).json())
      .toMatchObject({ data: [{ classId: context.classAId }] });
    const student = await seedStudent(context.test, context.schoolId);
    await context.test.seed.insert(schema.studentEnrollments).values({
      schoolId: context.schoolId, studentId: student.id, academicYearId: context.yearId,
      classId: context.classAId, effectiveFrom: '2025-09-01', status: 'ACTIVE',
    });
    let response = await homeworkStudentsGET(new Request('http://local'), params(homework.id));
    expect(await response.json()).toMatchObject({
      data: [{ student: { id: student.id }, submission: null }], meta: { total: 1 },
    });
    response = await homeworkSubmissionsPOST(body({ studentId: student.id, content: 'Answer' }), params(homework.id));
    expect(response.status).toBe(201);
    const submission = (await response.json()).data;
    expect(submission).toMatchObject({ studentId: student.id, status: 'LATE' });
    expect((await homeworkSubmissionsPOST(body({ studentId: student.id }), params(homework.id))).status).toBe(409);
    expect(await (await homeworkSubmissionsGET(
      new Request(`http://local?status=LATE&studentId=${student.id}`), params(homework.id),
    )).json()).toMatchObject({ data: [{ id: submission.id }], meta: { total: 1 } });
    expect((await homeworkSubmissionGET(new Request('http://local'), params(submission.id))).status).toBe(200);
    response = await homeworkSubmissionReviewPOST(body({ status: 'REVIEWED' }), params(submission.id));
    expect(await response.json()).toMatchObject({ data: { status: 'REVIEWED' } });
    expect((await homeworkSubmissionReviewPOST(body({ status: 'REVIEWED' }), params(submission.id))).status).toBe(422);
  });

  it('enforces Teacher exact target scope and controlled business errors', async () => {
    const created = await homeworksPOST(body(createInput()));
    const homework = (await created.json()).data;
    expect((await homeworkTargetsPOST(body({ classIds: [context.classBId] }), params(homework.id))).status).toBe(403);
    expect((await homeworkPATCH(body({ status: 'PUBLISHED' }, 'PATCH'), params(homework.id))).status).toBe(422);
    const invalidStudent = await seedStudent(context.test, context.schoolId);
    await homeworkTargetsPOST(body({ classIds: [context.classAId] }), params(homework.id));
    await homeworkPATCH(body({ status: 'PUBLISHED' }, 'PATCH'), params(homework.id));
    const response = await homeworkSubmissionsPOST(body({ studentId: invalidStudent.id }), params(homework.id));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { featureCode: 'STUDENT_NOT_ELIGIBLE_FOR_HOMEWORK' },
    });
  });

  it('maps authentication failures and hides foreign identifiers', async () => {
    mocks.error = new UnauthenticatedError();
    expect((await homeworksGET(new Request('http://local'))).status).toBe(401);
    mocks.error = null;
    expect((await homeworkGET(new Request('http://local'), params(crypto.randomUUID()))).status).toBe(404);
    expect((await homeworkSubmissionGET(new Request('http://local'), params(crypto.randomUUID()))).status).toBe(404);
  });
});
