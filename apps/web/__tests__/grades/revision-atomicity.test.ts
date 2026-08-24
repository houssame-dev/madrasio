import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { eq } from 'drizzle-orm';
import * as schema from '@school/database';

const failures = vi.hoisted(() => ({
  finalization: false,
  publication: false,
  recipients: false,
}));

vi.mock('@/lib/modules/grades/infrastructure/repositories/result-repository', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/modules/grades/infrastructure/repositories/result-repository')
  >();
  return {
    ...actual,
    setResultFinalized: vi.fn(async (...args: Parameters<typeof actual.setResultFinalized>) => {
      if (failures.finalization) return false;
      return actual.setResultFinalized(...args);
    }),
    insertPublication: vi.fn(async (...args: Parameters<typeof actual.insertPublication>) => {
      if (failures.publication) throw new Error('simulated revision publication failure');
      return actual.insertPublication(...args);
    }),
    findResultNotificationRecipientCandidates: vi.fn(async (
      ...args: Parameters<typeof actual.findResultNotificationRecipientCandidates>
    ) => {
      if (failures.recipients) throw new Error('simulated recipient resolution failure');
      return actual.findResultNotificationRecipientCandidates(...args);
    }),
  };
});

import {
  calculateSubjectResult,
  finalizeResult,
  publishResult,
  reviseResult,
} from '@/lib/modules/grades/application';
import { ResultDomainError } from '@/lib/modules/grades/application/result-errors';
import {
  createGradesTestDb,
  seedGradebook,
  seedGrades,
  seedSchool,
  seedStudentAndActors,
  type GradesTestDb,
} from './test-helpers';

let test: GradesTestDb;

beforeEach(async () => {
  failures.finalization = false;
  failures.publication = false;
  failures.recipients = false;
  test = await createGradesTestDb();
});

afterEach(async () => {
  await test.client.close();
});

async function seedPublishedSubject() {
  const school = await seedSchool(test.seed);
  const actors = await seedStudentAndActors(test.seed, school.schoolId, school.yearId, school.classId);
  const gradebook = await seedGradebook(test.seed, school.schoolId, school, school.subjectMathId);
  const grades = await seedGrades(
    test.seed, school.schoolId, gradebook.gradebookId, gradebook, actors.studentId, '16', '18',
  );
  const result = await calculateSubjectResult(test.db, {
    userId: actors.schoolAdminUserId,
    schoolId: school.schoolId,
    gradebookId: gradebook.gradebookId,
    studentId: actors.studentId,
  });
  await finalizeResult(test.db, {
    userId: actors.schoolAdminUserId,
    schoolId: school.schoolId,
    resultType: 'SUBJECT',
    resultId: result.id,
  });
  const publication = await publishResult(test.db, {
    userId: actors.schoolAdminUserId,
    schoolId: school.schoolId,
    resultType: 'SUBJECT',
    resultId: result.id,
    idempotencyKey: '00000000-0000-4000-8000-0000000000d0',
  });
  return { school, actors, grades, result, publication };
}

async function expectOnlyInitialHistory(resultId: string, publicationId: string) {
  const publications = await test.seed.select().from(schema.resultPublications)
    .where(eq(schema.resultPublications.subjectResultId, resultId));
  expect(publications).toHaveLength(1);
  expect(publications[0].id).toBe(publicationId);
  expect(await test.seed.select().from(schema.outboxEvents)).toHaveLength(1);
  expect(await test.seed.select().from(schema.notifications)).toHaveLength(0);
}

describe('Atomic Result revision failure injection', () => {
  it.each([
    ['recipient resolution', 'recipients', 'simulated recipient resolution failure'],
    ['ResultPublication insert', 'publication', 'simulated revision publication failure'],
  ] as const)('rolls back the Result when %s fails', async (_label, failure, message) => {
    const seeded = await seedPublishedSubject();
    await test.seed.update(schema.grades).set({ score: '20' })
      .where(eq(schema.grades.id, seeded.grades.examGradeId));
    const before = await test.seed.select().from(schema.subjectResults)
      .where(eq(schema.subjectResults.id, seeded.result.id));
    failures[failure] = true;

    await expect(reviseResult(test.db, {
      userId: seeded.actors.schoolAdminUserId,
      schoolId: seeded.school.schoolId,
      resultType: 'SUBJECT',
      resultId: seeded.result.id,
      idempotencyKey: failure === 'recipients'
        ? '00000000-0000-4000-8000-0000000000d1'
        : '00000000-0000-4000-8000-0000000000d2',
    })).rejects.toThrow(message);

    const after = await test.seed.select().from(schema.subjectResults)
      .where(eq(schema.subjectResults.id, seeded.result.id));
    expect(after).toEqual(before);
    expect(after[0]).toMatchObject({ value: '17.00', status: 'FINALIZED' });
    await expectOnlyInitialHistory(seeded.result.id, seeded.publication.publicationId);
  });

  it('rolls back the recalculation when finalization cannot persist', async () => {
    const seeded = await seedPublishedSubject();
    await test.seed.update(schema.grades).set({ score: '20' })
      .where(eq(schema.grades.id, seeded.grades.examGradeId));
    const before = await test.seed.select().from(schema.subjectResults)
      .where(eq(schema.subjectResults.id, seeded.result.id));
    failures.finalization = true;

    await expect(reviseResult(test.db, {
      userId: seeded.actors.schoolAdminUserId,
      schoolId: seeded.school.schoolId,
      resultType: 'SUBJECT',
      resultId: seeded.result.id,
      idempotencyKey: '00000000-0000-4000-8000-0000000000d3',
    })).rejects.toSatisfy(
      (error: unknown) => error instanceof ResultDomainError && error.featureCode === 'RESULT_NOT_FOUND',
    );

    expect(await test.seed.select().from(schema.subjectResults)
      .where(eq(schema.subjectResults.id, seeded.result.id))).toEqual(before);
    await expectOnlyInitialHistory(seeded.result.id, seeded.publication.publicationId);
  });

  it('leaves all revision state untouched when recalculation is incomplete', async () => {
    const seeded = await seedPublishedSubject();
    await test.seed.update(schema.grades).set({ state: 'ABSENT', score: null })
      .where(eq(schema.grades.id, seeded.grades.examGradeId));
    const before = await test.seed.select().from(schema.subjectResults)
      .where(eq(schema.subjectResults.id, seeded.result.id));

    await expect(reviseResult(test.db, {
      userId: seeded.actors.schoolAdminUserId,
      schoolId: seeded.school.schoolId,
      resultType: 'SUBJECT',
      resultId: seeded.result.id,
      idempotencyKey: '00000000-0000-4000-8000-0000000000d4',
    })).rejects.toSatisfy(
      (error: unknown) => error instanceof ResultDomainError && error.featureCode === 'CALCULATION_INCOMPLETE',
    );

    expect(await test.seed.select().from(schema.subjectResults)
      .where(eq(schema.subjectResults.id, seeded.result.id))).toEqual(before);
    await expectOnlyInitialHistory(seeded.result.id, seeded.publication.publicationId);
  });
});
