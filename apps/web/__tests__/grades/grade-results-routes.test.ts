import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@school/database';

import { AuthError } from '@/lib/auth/auth-errors';
import type { CurrentContext } from '@/lib/authorization/context';
import { UnauthenticatedError } from '@/lib/errors';

import {
  createGradesTestDb, seedGradebook, seedGrades, seedParentActor, seedSchool,
  seedStudentAndActors, seedTeacherAssignment,
  type GradesTestDb, type SeededGradebook, type SeededSchool, type SeededStudent,
} from './test-helpers';

const mocks = vi.hoisted(() => ({
  db: null as unknown,
  context: null as unknown,
  authError: null as unknown,
}));
vi.mock('@/lib/db/client', () => ({ getDb: () => mocks.db }));
vi.mock('@/lib/auth/require-context', () => ({
  requireCurrentContext: async () => {
    if (mocks.authError) throw mocks.authError;
    return mocks.context;
  },
}));

import { assessmentGradesPUT, gradeMatrixGET } from '@/lib/api/grades';
import {
  annualCalculatePOST, annualResultsGET, periodCalculatePOST, periodResultsGET,
  resultFinalizePOST, resultGET, resultPublishPOST, resultRevisePOST,
  subjectCalculatePOST, subjectResultsGET,
} from '@/lib/api/results';

let test: GradesTestDb;
let school: SeededSchool;
let actors: SeededStudent;
let gradebook: SeededGradebook;

beforeEach(async () => {
  test = await createGradesTestDb();
  school = await seedSchool(test.seed);
  actors = await seedStudentAndActors(test.seed, school.schoolId, school.yearId, school.classId);
  gradebook = await seedGradebook(
    test.seed, school.schoolId, school, school.subjectMathId, 'OPEN',
  );
  mocks.db = test.db;
  mocks.authError = null;
  mocks.context = contextFor(actors.schoolAdminUserId, school.schoolId, 'SCHOOL_ADMIN');
});

function contextFor(userId: string, schoolId: string, role: CurrentContext['role']): CurrentContext {
  return {
    userId, userActive: true,
    membership: { schoolId, status: 'ACTIVE' },
    schoolContext: { schoolId, isValid: true }, role,
    scope: { teacherAssignments: [], parentStudents: [] },
  };
}
const json = (method: string, body: unknown) => new Request('http://local', {
  method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function enterRequiredGrades() {
  for (const [assessmentId, score] of [
    [gradebook.assessmentQuizId, '16'], [gradebook.assessmentExamId, '18'],
  ] as const) {
    const response = await assessmentGradesPUT(json('PUT', {
      grades: [{ studentId: actors.studentId, state: 'VALID', score }],
    }), params(assessmentId));
    expect(response.status).toBe(200);
  }
}

async function calculateSubject() {
  await enterRequiredGrades();
  const response = await subjectCalculatePOST(json('POST', {
    gradebookId: gradebook.gradebookId, studentId: actors.studentId,
  }));
  expect(response.status).toBe(201);
  return (await response.json()).data;
}

describe('Task 020 Grade and Result HTTP contracts', () => {
  it('writes Grades and returns the bounded Gradebook matrix', async () => {
    await enterRequiredGrades();
    const response = await gradeMatrixGET(
      new Request('http://local?page=1&pageSize=10'), params(gradebook.gradebookId),
    );
    expect(response.status).toBe(200);
    const matrix = await response.json();
    expect(matrix).toMatchObject({
      data: { gradebook: { id: gradebook.gradebookId } },
      meta: { page: 1, pageSize: 10, total: 1, assessmentLimit: 100, assessmentTotal: 2 },
    });
    expect(matrix.data.assessments).toHaveLength(2);
    expect(matrix.data.students).toHaveLength(1);
    expect(matrix.data.students[0]).toMatchObject({ student: { id: actors.studentId } });
    expect(matrix.data.students[0].grades).toHaveLength(2);
  });

  it('reuses subject calculation, read, finalization, publication, and revision routes', async () => {
    const result = await calculateSubject();
    expect(await (await subjectResultsGET(new Request('http://local?pageSize=10'))).json())
      .toMatchObject({ data: [{ id: result.id, resultType: 'SUBJECT' }], meta: { total: 1 } });
    expect(await (await resultGET(
      new Request('http://local?resultType=SUBJECT'), params(result.id),
    )).json()).toMatchObject({ data: { id: result.id, resultType: 'SUBJECT' } });

    expect((await resultFinalizePOST(
      json('POST', { resultType: 'SUBJECT' }), params(result.id),
    )).status).toBe(200);
    const publicationKey = randomUUID();
    const published = await resultPublishPOST(json('POST', {
      resultType: 'SUBJECT', idempotencyKey: publicationKey,
    }), params(result.id));
    expect(published.status).toBe(201);
    expect(await published.json()).toMatchObject({ data: { publicationVersion: 1 } });
    expect(await test.seed.select().from(schema.notifications)).toHaveLength(0);

    const revised = await resultRevisePOST(json('POST', {
      resultType: 'SUBJECT', idempotencyKey: randomUUID(),
    }), params(result.id));
    expect(revised.status).toBe(201);
    expect(await revised.json()).toMatchObject({ data: { publicationVersion: 2 } });
  });

  it('keeps PeriodResult and AnnualResult as separate calculation/read contracts', async () => {
    await calculateSubject();
    const periodResponse = await periodCalculatePOST(json('POST', {
      studentId: actors.studentId,
      academicYearId: school.yearId,
      academicPeriodId: school.period1Id,
      classId: school.classId,
    }));
    expect(periodResponse.status).toBe(201);
    const period = (await periodResponse.json()).data;
    expect(period).toMatchObject({ resultType: 'PERIOD', academicPeriodId: school.period1Id });
    expect(await (await periodResultsGET(new Request('http://local'))).json())
      .toMatchObject({ data: [{ id: period.id, resultType: 'PERIOD' }] });

    const annualResponse = await annualCalculatePOST(json('POST', {
      studentId: actors.studentId, academicYearId: school.yearId, classId: school.classId,
    }));
    expect(annualResponse.status).toBe(201);
    const annual = (await annualResponse.json()).data;
    expect(annual).toMatchObject({ resultType: 'ANNUAL', academicPeriodId: null });
    expect(await (await annualResultsGET(new Request('http://local'))).json())
      .toMatchObject({ data: [{ id: annual.id, resultType: 'ANNUAL' }] });
  });

  it('preserves one logical SubjectResult under concurrent calculations', async () => {
    await enterRequiredGrades();
    const body = {
      gradebookId: gradebook.gradebookId, studentId: actors.studentId,
    };
    const responses = await Promise.all([
      subjectCalculatePOST(json('POST', body)),
      subjectCalculatePOST(json('POST', body)),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(await test.seed.select().from(schema.subjectResults).where(and(
      eq(schema.subjectResults.schoolId, school.schoolId),
      eq(schema.subjectResults.studentId, actors.studentId),
      eq(schema.subjectResults.subjectId, school.subjectMathId),
    ))).toHaveLength(1);
  });

  it('rejects client School authority, malformed Grade state, and unfinalized publication', async () => {
    expect((await subjectCalculatePOST(json('POST', {
      schoolId: school.schoolId,
      gradebookId: gradebook.gradebookId,
      studentId: actors.studentId,
    }))).status).toBe(400);
    expect((await assessmentGradesPUT(json('PUT', {
      schoolId: school.schoolId,
      grades: [{ studentId: actors.studentId, state: 'ABSENT', score: 0 }],
    }), params(gradebook.assessmentQuizId))).status).toBe(400);
    const result = await calculateSubject();
    const publish = await resultPublishPOST(json('POST', {
      resultType: 'SUBJECT', idempotencyKey: randomUUID(),
    }), params(result.id));
    expect(publish.status).toBe(422);
    expect(await publish.json()).toMatchObject({ error: { featureCode: 'RESULT_NOT_FINALIZED' } });
  });

  it('enforces Teacher exact scope and denies Parent raw Grade/Result administration', async () => {
    await seedTeacherAssignment(
      test.seed, school.schoolId, actors.teacherId,
      school.classId, school.subjectMathId, school.yearId,
    );
    await seedGrades(
      test.seed, school.schoolId, gradebook.gradebookId, gradebook, actors.studentId, '16', '18',
    );
    mocks.context = contextFor(actors.teacherUserId, school.schoolId, 'TEACHER');
    expect((await subjectCalculatePOST(json('POST', {
      gradebookId: gradebook.gradebookId, studentId: actors.studentId,
    }))).status).toBe(201);

    const physics = await seedGradebook(
      test.seed, school.schoolId, school, school.subjectPhysicsId, 'OPEN',
    );
    await seedGrades(test.seed, school.schoolId, physics.gradebookId, physics, actors.studentId, '15', '17');
    expect((await subjectCalculatePOST(json('POST', {
      gradebookId: physics.gradebookId, studentId: actors.studentId,
    }))).status).toBe(403);
    expect((await periodResultsGET(new Request('http://local'))).status).toBe(403);

    const { parentUserId } = await seedParentActor(test.seed, school.schoolId);
    mocks.context = contextFor(parentUserId, school.schoolId, 'PARENT');
    expect((await gradeMatrixGET(
      new Request('http://local'), params(gradebook.gradebookId),
    )).status).toBe(403);
    expect((await subjectResultsGET(new Request('http://local'))).status).toBe(403);
  });

  it('maps unauthenticated/current-School errors and hides foreign resources', async () => {
    mocks.authError = new UnauthenticatedError();
    expect((await gradeMatrixGET(
      new Request('http://local'), params(gradebook.gradebookId),
    )).status).toBe(401);
    mocks.authError = new AuthError('SCHOOL_CONTEXT_REQUIRED', 'Select a School.');
    expect((await subjectResultsGET(new Request('http://local'))).status).toBe(403);
    mocks.authError = null;
    expect((await resultGET(
      new Request('http://local?resultType=SUBJECT'), params(randomUUID()),
    )).status).toBe(404);
  });
});
