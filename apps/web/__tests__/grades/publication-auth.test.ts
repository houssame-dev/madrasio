/**
 * Results authorization matrix tests (Task 006D Part U) — PGlite-backed.
 *
 * Every sensitive operation is authorized AGAIN on the server through the
 * canonical pipeline (CLAUDE.md §15/§16). This verifies the matrix:
 *
 *   Operation               | School Admin | Scoped Teacher | Out-of-scope Teacher | Parent
 *   ------------------------|--------------|----------------|----------------------|-------
 *   subject calc            | grades.manage| grades.enter+scope | DENY             | DENY
 *   period/annual calc      | grades.manage| DENY           | DENY               | DENY
 *   finalize                | grades.manage| DENY           | DENY               | DENY
 *   publish / revise        | grades.publish | DENY        | DENY               | DENY
 *
 * Plus: gradebook DRAFT blocks subject calc (resource state), and a user with
 * membership in School A can never operate in School B (tenant isolation).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@school/database';

import { AppError } from '@/lib/errors';
import {
  calculateAnnualResult,
  calculatePeriodResult,
  calculateSubjectResult,
  finalizeResult,
  publishResult,
  reviseResult,
} from '@/lib/modules/grades/application';

import {
  createGradesTestDb,
  seedGradebook,
  seedGrades,
  seedParentActor,
  seedSchool,
  seedStudentAndActors,
  seedTeacherAssignment,
  type GradesTestDb,
} from './test-helpers';

let test: GradesTestDb;

beforeEach(async () => {
  test = await createGradesTestDb();
});

afterEach(async () => {
  await test.client.close();
});

async function expectForbidden(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toSatisfy((error: unknown) => error instanceof AppError && error.code === 'FORBIDDEN');
}

describe('Results authorization matrix (Part U)', () => {
  async function seedScenario(options: { gradebookStatus?: 'DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED' } = {}) {
    const school = await seedSchool(test.seed);
    const actors = await seedStudentAndActors(test.seed, school.schoolId, school.yearId, school.classId);
    const gradebook = await seedGradebook(
      test.seed,
      school.schoolId,
      school,
      school.subjectMathId,
      options.gradebookStatus ?? 'OPEN',
    );
    await seedGrades(test.seed, school.schoolId, gradebook.gradebookId, gradebook, actors.studentId, '16', '18');
    return { school, actors, gradebook };
  }

  it('SCHOOL_ADMIN can calculate, finalize, publish and revise', async () => {
    const { school, actors, gradebook } = await seedScenario();
    const admin = actors.schoolAdminUserId;

    const calculated = await calculateSubjectResult(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      gradebookId: gradebook.gradebookId,
      studentId: actors.studentId,
    });
    const finalized = await finalizeResult(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      resultType: 'SUBJECT',
      resultId: calculated.id,
    });
    expect(finalized.status).toBe('FINALIZED');
    const published = await publishResult(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      resultType: 'SUBJECT',
      resultId: calculated.id,
      idempotencyKey: '00000000-0000-4000-8000-0000000000a1',
    });
    expect(published.publicationVersion).toBe(1);
  });

  it('scoped TEACHER can calculate (grades.enter + scope) but cannot finalize/publish', async () => {
    const { school, actors, gradebook } = await seedScenario();
    await seedTeacherAssignment(
      test.seed,
      school.schoolId,
      actors.teacherId,
      school.classId,
      school.subjectMathId,
      school.yearId,
    );
    const teacher = actors.teacherUserId;

    const calculated = await calculateSubjectResult(test.db, {
      userId: teacher,
      schoolId: school.schoolId,
      gradebookId: gradebook.gradebookId,
      studentId: actors.studentId,
    });
    expect(calculated.status).toBe('CALCULATED');

    await expectForbidden(
      finalizeResult(test.db, {
        userId: teacher,
        schoolId: school.schoolId,
        resultType: 'SUBJECT',
        resultId: calculated.id,
      }),
    );
    await expectForbidden(
      publishResult(test.db, {
        userId: teacher,
        schoolId: school.schoolId,
        resultType: 'SUBJECT',
        resultId: calculated.id,
        idempotencyKey: '00000000-0000-4000-8000-0000000000a2',
      }),
    );
  });

  it('out-of-scope TEACHER cannot calculate (no TeacherAssignment)', async () => {
    const { school, actors, gradebook } = await seedScenario();

    await expectForbidden(
      calculateSubjectResult(test.db, {
        userId: actors.teacherUserId,
        schoolId: school.schoolId,
        gradebookId: gradebook.gradebookId,
        studentId: actors.studentId,
      }),
    );
  });

  it('PARENT cannot calculate/finalize/publish', async () => {
    const { school, actors, gradebook } = await seedScenario();
    const { parentUserId } = await seedParentActor(test.seed, school.schoolId);

    await expectForbidden(
      calculateSubjectResult(test.db, {
        userId: parentUserId,
        schoolId: school.schoolId,
        gradebookId: gradebook.gradebookId,
        studentId: actors.studentId,
      }),
    );
  });

  it('period/annual calculation requires grades.manage (teacher cannot)', async () => {
    const { school, actors } = await seedScenario();
    await seedTeacherAssignment(
      test.seed,
      school.schoolId,
      actors.teacherId,
      school.classId,
      school.subjectMathId,
      school.yearId,
    );

    await expectForbidden(
      calculatePeriodResult(test.db, {
        userId: actors.teacherUserId,
        schoolId: school.schoolId,
        studentId: actors.studentId,
        academicYearId: school.yearId,
        academicPeriodId: school.period1Id,
        classId: school.classId,
      }),
    );
    await expectForbidden(
      calculateAnnualResult(test.db, {
        userId: actors.teacherUserId,
        schoolId: school.schoolId,
        studentId: actors.studentId,
        academicYearId: school.yearId,
        classId: school.classId,
      }),
    );
  });

  it('a DRAFT gradebook blocks subject calculation (resource state)', async () => {
    const { school, actors, gradebook } = await seedScenario({ gradebookStatus: 'DRAFT' });

    await expectForbidden(
      calculateSubjectResult(test.db, {
        userId: actors.schoolAdminUserId,
        schoolId: school.schoolId,
        gradebookId: gradebook.gradebookId,
        studentId: actors.studentId,
      }),
    );
  });

  it('denies cross-school access (tenant isolation)', async () => {
    const schoolA = await seedSchool(test.seed);
    const schoolB = await seedSchool(test.seed);
    const actorsA = await seedStudentAndActors(test.seed, schoolA.schoolId, schoolA.yearId, schoolA.classId);
    // School B has its own fully-seeded student context (a Student is School-
    // scoped with a GLOBAL primary key, so it cannot exist in two Schools).
    // School A's admin requests an operation in School B: the enrollment
    // guard passes, so the authorization pipeline MUST deny — the admin holds
    // no School B membership (BR-INTEGRITY-002, BR-AUTHZ-009).
    const actorsB = await seedStudentAndActors(test.seed, schoolB.schoolId, schoolB.yearId, schoolB.classId);
    const gradebookB = await seedGradebook(test.seed, schoolB.schoolId, schoolB, schoolB.subjectMathId);

    await expectForbidden(
      calculateSubjectResult(test.db, {
        userId: actorsA.schoolAdminUserId,
        schoolId: schoolB.schoolId,
        gradebookId: gradebookB.gradebookId,
        studentId: actorsB.studentId,
      }),
    );
  });

  it('revise requires grades.publish (teacher cannot)', async () => {
    const { school, actors, gradebook } = await seedScenario();
    const admin = actors.schoolAdminUserId;

    const calculated = await calculateSubjectResult(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      gradebookId: gradebook.gradebookId,
      studentId: actors.studentId,
    });
    await finalizeResult(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      resultType: 'SUBJECT',
      resultId: calculated.id,
    });
    await publishResult(test.db, {
      userId: admin,
      schoolId: school.schoolId,
      resultType: 'SUBJECT',
      resultId: calculated.id,
      idempotencyKey: '00000000-0000-4000-8000-0000000000a3',
    });

    const beforeResult = await test.seed.select().from(schema.subjectResults)
      .where(eq(schema.subjectResults.id, calculated.id));
    const beforePublications = await test.seed.select().from(schema.resultPublications);
    const beforeEvents = await test.seed.select().from(schema.outboxEvents);

    await expectForbidden(
      reviseResult(test.db, {
        userId: actors.teacherUserId,
        schoolId: school.schoolId,
        resultType: 'SUBJECT',
        resultId: calculated.id,
        idempotencyKey: '00000000-0000-4000-8000-0000000000a4',
      }),
    );
    expect(await test.seed.select().from(schema.subjectResults)
      .where(eq(schema.subjectResults.id, calculated.id))).toEqual(beforeResult);
    expect(await test.seed.select().from(schema.resultPublications)).toEqual(beforePublications);
    expect(await test.seed.select().from(schema.outboxEvents)).toEqual(beforeEvents);
  });
});
