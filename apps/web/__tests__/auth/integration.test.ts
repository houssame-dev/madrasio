/**
 * Task 014 §43 — authorization integration proof (Task 014 §36).
 *
 * Proves that one existing protected use case (Result publication) consumes the
 * NEW real CurrentContext resolved through the actual auth/current-school layer
 * — not synthetic test context. The context is built with `requireCurrentContext`
 * (session resolver + cookie selector injected) and its `userId` +
 * `schoolContext.schoolId` are fed into `publishResult`; the use case still runs
 * the canonical authorization pipeline internally (grades.publish + school scope).
 *
 * Also verifies, through the REAL context:
 * - the membership role feeds the permission evaluation (TEACHER cannot publish);
 * - Teacher scope remains on-demand and unchanged (context carries no scope);
 * - a wrong School through a real context is denied (school-A data is
 *   unreachable from a school-B context).
 */

import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import { requireCurrentContext } from '@/lib/auth/require-context';
import { ForbiddenError } from '@/lib/errors';
import {
  calculateSubjectResult,
  finalizeResult,
  publishResult,
} from '@/lib/modules/grades/application';
import type { ResultDomainError } from '@/lib/modules/grades/application/result-errors';

import {
  createGradesTestDb,
  seedGradebook,
  seedGrades,
  seedParentActor,
  seedSchool,
  seedStudentAndActors,
  seedTeacherAssignment,
  type GradesTestDb,
} from '../grades/test-helpers';

let test: GradesTestDb;

beforeEach(async () => {
  test = await createGradesTestDb();
});

async function seedSchoolWithFinalizedResult() {
  const school = await seedSchool(test.seed);
  const actors = await seedStudentAndActors(test.seed, school.schoolId, school.yearId, school.classId);
  const gradebook = await seedGradebook(test.seed, school.schoolId, school, school.subjectMathId);
  await seedGrades(test.seed, school.schoolId, gradebook.gradebookId, gradebook, actors.studentId, '16', '18');
  const calculated = await calculateSubjectResult(test.db, {
    userId: actors.schoolAdminUserId,
    schoolId: school.schoolId,
    gradebookId: gradebook.gradebookId,
    studentId: actors.studentId,
  });
  await finalizeResult(test.db, {
    userId: actors.schoolAdminUserId,
    schoolId: school.schoolId,
    resultType: 'SUBJECT',
    resultId: calculated.id,
  });
  return { school, actors, gradebook, resultId: calculated.id };
}

/** Seeds a school whose subject result is CALCULATED but NOT finalized. */
async function seedSchoolWithCalculatedResult() {
  const school = await seedSchool(test.seed);
  const actors = await seedStudentAndActors(test.seed, school.schoolId, school.yearId, school.classId);
  const gradebook = await seedGradebook(test.seed, school.schoolId, school, school.subjectMathId);
  await seedGrades(test.seed, school.schoolId, gradebook.gradebookId, gradebook, actors.studentId, '16', '18');
  const calculated = await calculateSubjectResult(test.db, {
    userId: actors.schoolAdminUserId,
    schoolId: school.schoolId,
    gradebookId: gradebook.gradebookId,
    studentId: actors.studentId,
  });
  return { school, actors, gradebook, resultId: calculated.id };
}

describe('Task 014 §43 — real CurrentContext feeds a protected use case', () => {
  it('22. a protected use case consumes the new real CurrentContext', async () => {
    const { school, actors, resultId } = await seedSchoolWithFinalizedResult();

    const context = await requireCurrentContext(test.db, {
      sessionResolver: async () => ({ id: actors.schoolAdminUserId }),
      readSelectedSchoolId: async () => school.schoolId,
    });
    expect(context.userId).toBe(actors.schoolAdminUserId);
    expect(context.schoolContext?.schoolId).toBe(school.schoolId);
    expect(context.role).toBe('SCHOOL_ADMIN');

    const published = await publishResult(test.db, {
      userId: context.userId!,
      schoolId: context.schoolContext!.schoolId,
      resultType: 'SUBJECT',
      resultId,
      idempotencyKey: randomUUID(),
    });
    expect(published.publicationVersion).toBe(1);
    expect(published.publishedBy).toBe(context.userId);
  });

  it('23. the permission evaluation receives the role from the real ACTIVE membership', async () => {
    const { school, actors, gradebook, resultId } = await seedSchoolWithFinalizedResult();

    const teacherContext = await requireCurrentContext(test.db, {
      sessionResolver: async () => ({ id: actors.teacherUserId }),
      readSelectedSchoolId: async () => school.schoolId,
    });
    expect(teacherContext.role).toBe('TEACHER');

    // TEACHER does not hold grades.publish → the pipeline denies via the real role.
    await expect(
      publishResult(test.db, {
        userId: teacherContext.userId!,
        schoolId: teacherContext.schoolContext!.schoolId,
        resultType: 'SUBJECT',
        resultId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    void gradebook;
  });

  it('24. Teacher scope stays on-demand and unchanged (context carries no scope)', async () => {
    const { school, actors, gradebook, resultId } = await seedSchoolWithCalculatedResult();
    await seedTeacherAssignment(
      test.seed,
      school.schoolId,
      actors.teacherId,
      school.classId,
      school.subjectMathId,
      school.yearId,
    );

    const teacherContext = await requireCurrentContext(test.db, {
      sessionResolver: async () => ({ id: actors.teacherUserId }),
      readSelectedSchoolId: async () => school.schoolId,
    });
    // The real context is intentionally scope-free — scope is resolved on demand
    // inside the use case (Task 014 §11).
    expect(teacherContext.scope).toEqual({ teacherAssignments: [], parentStudents: [] });

    // Recalculate (idempotent for CALCULATED) so the scoped teacher path runs.
    const recalculated = await calculateSubjectResult(test.db, {
      userId: teacherContext.userId!,
      schoolId: teacherContext.schoolContext!.schoolId,
      gradebookId: gradebook.gradebookId,
      studentId: actors.studentId,
    });
    expect(recalculated.status).toBe('CALCULATED');
    void resultId;
  });

  it('25. a wrong School through a real context is denied', async () => {
    const schoolA = await seedSchool(test.seed);
    const actorsA = await seedStudentAndActors(test.seed, schoolA.schoolId, schoolA.yearId, schoolA.classId);
    const gradebookA = await seedGradebook(test.seed, schoolA.schoolId, schoolA, schoolA.subjectMathId);
    await seedGrades(test.seed, schoolA.schoolId, gradebookA.gradebookId, gradebookA, actorsA.studentId, '16', '18');
    const calculatedA = await calculateSubjectResult(test.db, {
      userId: actorsA.schoolAdminUserId,
      schoolId: schoolA.schoolId,
      gradebookId: gradebookA.gradebookId,
      studentId: actorsA.studentId,
    });
    await finalizeResult(test.db, {
      userId: actorsA.schoolAdminUserId,
      schoolId: schoolA.schoolId,
      resultType: 'SUBJECT',
      resultId: calculatedA.id,
    });

    // A SCHOOL_ADMIN whose real context is School B.
    const schoolB = await seedSchool(test.seed);
    const actorsB = await seedStudentAndActors(test.seed, schoolB.schoolId, schoolB.yearId, schoolB.classId);

    const adminBContext = await requireCurrentContext(test.db, {
      sessionResolver: async () => ({ id: actorsB.schoolAdminUserId }),
      readSelectedSchoolId: async () => schoolB.schoolId,
    });
    expect(adminBContext.schoolContext?.schoolId).toBe(schoolB.schoolId);

    // Publishing School A's result through the School B context cannot touch
    // School A data — the result is invisible inside School B.
    let outcome: ResultDomainError | undefined;
    try {
      await publishResult(test.db, {
        userId: adminBContext.userId!,
        schoolId: adminBContext.schoolContext!.schoolId,
        resultType: 'SUBJECT',
        resultId: calculatedA.id,
        idempotencyKey: randomUUID(),
      });
    } catch (error) {
      outcome = error as ResultDomainError;
    }

    expect(outcome?.featureCode).toBe('RESULT_NOT_FOUND');
  });

  it('26. the canonical pipeline order still holds through the real context', async () => {
    const { school, resultId } = await seedSchoolWithFinalizedResult();

    // A PARENT's real context (role PARENT from the ACTIVE membership) lacks
    // grades.publish → denied at the permission stage of the canonical pipeline.
    const { parentUserId } = await seedParentActor(test.seed, school.schoolId);
    const parentContext = await requireCurrentContext(test.db, {
      sessionResolver: async () => ({ id: parentUserId }),
      readSelectedSchoolId: async () => school.schoolId,
    });
    expect(parentContext.role).toBe('PARENT');

    await expect(
      publishResult(test.db, {
        userId: parentContext.userId!,
        schoolId: parentContext.schoolContext!.schoolId,
        resultType: 'SUBJECT',
        resultId,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});