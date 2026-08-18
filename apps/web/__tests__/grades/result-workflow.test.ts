/**
 * Result workflow integration tests (Task 006D) — PGlite-backed against the
 * committed migrations.
 *
 * Verifies the FULL Subject/Period/Annual pipeline end-to-end:
 *   calculate (CALCULATED) → finalize (FINALIZED) → publish (snapshot +
 *   outbox event) → explicit revision (new snapshot version, history intact).
 *
 * Also verifies the cross-cutting invariants: no silent recalculation of
 * FINALIZED results, publish requires FINALIZED, idempotent replays, and the
 * configuration version binding (BR-GRADE-013 / BR-HISTORY-004).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { and, eq } from 'drizzle-orm';

import * as schema from '@school/database';

import { ResultDomainError } from '@/lib/modules/grades/application/result-errors';
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
  DEFAULT_RULES,
  seedGradebook,
  seedGrades,
  seedSchool,
  seedStudentAndActors,
  seedTeacherAssignment,
  type GradesTestDb,
  type SeededGradebook,
  type SeededSchool,
} from './test-helpers';

let test: GradesTestDb;

beforeEach(async () => {
  test = await createGradesTestDb();
});

afterEach(async () => {
  await test.client.close();
});

describe('SubjectResult workflow', () => {
  async function seedSubjectScenario(status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED' = 'OPEN') {
    const school = await seedSchool(test.seed);
    const actors = await seedStudentAndActors(test.seed, school.schoolId, school.yearId, school.classId);
    await seedTeacherAssignment(
      test.seed,
      school.schoolId,
      actors.teacherId,
      school.classId,
      school.subjectMathId,
      school.yearId,
    );
    const gradebook = await seedGradebook(test.seed, school.schoolId, school, school.subjectMathId, status);
    const gradeRows = await seedGrades(
      test.seed,
      school.schoolId,
      gradebook.gradebookId,
      gradebook,
      actors.studentId,
      '16',
      '18',
    );
    return { school, actors, gradebook, gradeRows };
  }

  it('calculates, finalizes, publishes and revises a subject result', async () => {
    const { school, actors, gradebook, gradeRows } = await seedSubjectScenario();
    const adminId = actors.schoolAdminUserId;

    // 1. Calculate → CALCULATED. QUIZ 16 + EXAM 18 (EQUAL) on scale 20 = 17.00
    const calculated = await calculateSubjectResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      gradebookId: gradebook.gradebookId,
      studentId: actors.studentId,
    });
    expect(calculated.status).toBe('CALCULATED');
    expect(calculated.value).toBe('17.00');
    expect(calculated.gradingConfigurationVersionId).toBe(school.configVersionId);

    // 2. Recalculate is idempotent while CALCULATED (upsert, same value).
    const recalculated = await calculateSubjectResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      gradebookId: gradebook.gradebookId,
      studentId: actors.studentId,
    });
    expect(recalculated.id).toBe(calculated.id);

    // 3. Finalize → FINALIZED.
    const finalized = await finalizeResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      resultType: 'SUBJECT',
      resultId: calculated.id,
    });
    expect(finalized.status).toBe('FINALIZED');

    // 4. A silent recalculation of a FINALIZED result is refused.
    await expect(
      calculateSubjectResult(test.db, {
        userId: adminId,
        schoolId: school.schoolId,
        gradebookId: gradebook.gradebookId,
        studentId: actors.studentId,
      }),
    ).rejects.toSatisfy((error: unknown) => error instanceof ResultDomainError && error.featureCode === 'RESULT_ALREADY_FINALIZED');

    // 5. Publish v1 → snapshot + ResultPublished outbox event.
    const published = await publishResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      resultType: 'SUBJECT',
      resultId: calculated.id,
      idempotencyKey: '00000000-0000-4000-8000-0000000000a1',
    });
    expect(published.publicationVersion).toBe(1);
    expect(published.resultValue).toBe('17.00');

    // 6. Idempotent replay returns the SAME publication row.
    const replayed = await publishResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      resultType: 'SUBJECT',
      resultId: calculated.id,
      idempotencyKey: '00000000-0000-4000-8000-0000000000a1',
    });
    expect(replayed.publicationId).toBe(published.publicationId);
    expect(replayed.publicationVersion).toBe(1);

    // 7. A DIFFERENT idempotency key for an already-published result is refused.
    await expect(
      publishResult(test.db, {
        userId: adminId,
        schoolId: school.schoolId,
        resultType: 'SUBJECT',
        resultId: calculated.id,
        idempotencyKey: '00000000-0000-4000-8000-0000000000a2',
      }),
    ).rejects.toSatisfy((error: unknown) => error instanceof ResultDomainError && error.featureCode === 'RESULT_ALREADY_PUBLISHED');

    // 8. Exactly ONE ResultPublished outbox event (no duplicates on replay).
    const events = await test.seed
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.eventType, 'ResultPublished'));
    expect(events).toHaveLength(1);
    const payload = events[0].payload as Record<string, unknown>;
    expect(payload.resultType).toBe('SUBJECT');
    expect(payload.resultValue).toBe('17.00');
    expect(payload.publicationVersion).toBe(1);

    // 9. REVISION: correct the exam grade and publish v2. Old snapshot survives.
    await test.seed
      .update(schema.grades)
      .set({ score: '20' })
      .where(eq(schema.grades.id, gradeRows.examGradeId));
    const revised = await reviseResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      resultType: 'SUBJECT',
      resultId: calculated.id,
      idempotencyKey: '00000000-0000-4000-8000-0000000000b1',
    });
    expect(revised.publicationVersion).toBe(2);
    expect(revised.resultValue).toBe('18.00');

    // v1 row is untouched.
    const v1 = await test.seed
      .select()
      .from(schema.resultPublications)
      .where(eq(schema.resultPublications.id, published.publicationId));
    expect(v1[0].resultValue).toBe('17.00');
    expect(v1[0].publicationVersion).toBe(1);

    // Both historical snapshots are queryable and distinct: versions [1, 2] with
    // values ['17.00', '18.00']. Publication #1 remains immutable (BR-GRADE-010).
    const allVersions = await test.seed
      .select({
        publicationVersion: schema.resultPublications.publicationVersion,
        resultValue: schema.resultPublications.resultValue,
        id: schema.resultPublications.id,
      })
      .from(schema.resultPublications)
      .where(
        and(
          eq(schema.resultPublications.schoolId, school.schoolId),
          eq(schema.resultPublications.subjectResultId, calculated.id),
        ),
      )
      .orderBy(schema.resultPublications.publicationVersion);
    expect(allVersions.map((p) => p.publicationVersion)).toEqual([1, 2]);
    expect(allVersions.map((p) => p.resultValue)).toEqual(['17.00', '18.00']);

    // The recomputed value is still bound to the SAME configuration version.
    expect(revised.gradingConfigurationVersionId).toBe(school.configVersionId);

    // ResultRevisionPublished event recorded.
    const revisionEvents = await test.seed
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.eventType, 'ResultRevisionPublished'));
    expect(revisionEvents).toHaveLength(1);

    // Idempotent revision replay returns the same v2 row.
    const revisedReplay = await reviseResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      resultType: 'SUBJECT',
      resultId: calculated.id,
      idempotencyKey: '00000000-0000-4000-8000-0000000000b1',
    });
    expect(revisedReplay.publicationId).toBe(revised.publicationId);
    expect(revisedReplay.publicationVersion).toBe(2);
  });

  it('refuses publish before finalize and publish of a never-finalized result', async () => {
    const { school, actors, gradebook } = await seedSubjectScenario();
    const adminId = actors.schoolAdminUserId;

    const calculated = await calculateSubjectResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      gradebookId: gradebook.gradebookId,
      studentId: actors.studentId,
    });

    await expect(
      publishResult(test.db, {
        userId: adminId,
        schoolId: school.schoolId,
        resultType: 'SUBJECT',
        resultId: calculated.id,
        idempotencyKey: '00000000-0000-4000-8000-0000000000c1',
      }),
    ).rejects.toSatisfy((error: unknown) => error instanceof ResultDomainError && error.featureCode === 'RESULT_NOT_FINALIZED');
  });

  it('refuses a revision when the result was never published', async () => {
    const { school, actors, gradebook } = await seedSubjectScenario();
    const adminId = actors.schoolAdminUserId;

    const calculated = await calculateSubjectResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      gradebookId: gradebook.gradebookId,
      studentId: actors.studentId,
    });
    await finalizeResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      resultType: 'SUBJECT',
      resultId: calculated.id,
    });

    await expect(
      reviseResult(test.db, {
        userId: adminId,
        schoolId: school.schoolId,
        resultType: 'SUBJECT',
        resultId: calculated.id,
        idempotencyKey: '00000000-0000-4000-8000-0000000000d1',
      }),
    ).rejects.toSatisfy((error: unknown) => error instanceof ResultDomainError && error.featureCode === 'RESULT_NOT_PUBLISHED');
  });

  it('enforces CALCULATED → FINALIZED one-way (double finalize is refused)', async () => {
    const { school, actors, gradebook } = await seedSubjectScenario();
    const adminId = actors.schoolAdminUserId;

    const calculated = await calculateSubjectResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      gradebookId: gradebook.gradebookId,
      studentId: actors.studentId,
    });
    expect(calculated.status).toBe('CALCULATED');

    const finalized = await finalizeResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      resultType: 'SUBJECT',
      resultId: calculated.id,
    });
    expect(finalized.status).toBe('FINALIZED');

    // A FINALIZED result cannot be finalized again.
    await expect(
      finalizeResult(test.db, {
        userId: adminId,
        schoolId: school.schoolId,
        resultType: 'SUBJECT',
        resultId: calculated.id,
      }),
    ).rejects.toSatisfy((error: unknown) => error instanceof ResultDomainError && error.featureCode === 'RESULT_ALREADY_FINALIZED');

    // Normal mutation (recalculation) of a FINALIZED result is refused too.
    await expect(
      calculateSubjectResult(test.db, {
        userId: adminId,
        schoolId: school.schoolId,
        gradebookId: gradebook.gradebookId,
        studentId: actors.studentId,
      }),
    ).rejects.toSatisfy((error: unknown) => error instanceof ResultDomainError && error.featureCode === 'RESULT_ALREADY_FINALIZED');
  });

  it('keeps a published result bound to V1 when V2 is created and activated (BR-GRADE-013)', async () => {
    const { school, actors, gradebook } = await seedSubjectScenario();
    const adminId = actors.schoolAdminUserId;

    const calculated = await calculateSubjectResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      gradebookId: gradebook.gradebookId,
      studentId: actors.studentId,
    });
    expect(calculated.gradingConfigurationVersionId).toBe(school.configVersionId);
    await finalizeResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      resultType: 'SUBJECT',
      resultId: calculated.id,
    });
    const published = await publishResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      resultType: 'SUBJECT',
      resultId: calculated.id,
      idempotencyKey: '00000000-0000-4000-8000-0000000000f2',
    });
    expect(published.gradingConfigurationVersionId).toBe(school.configVersionId);

    // Create + activate V2 of the SAME configuration (V1 is archived first; the
    // schema allows only one ACTIVE version per configuration).
    const configId = (
      await test.seed
        .select({ gradingConfigurationId: schema.gradingConfigurationVersions.gradingConfigurationId })
        .from(schema.gradingConfigurationVersions)
        .where(eq(schema.gradingConfigurationVersions.id, school.configVersionId))
        .limit(1)
    )[0].gradingConfigurationId;
    await test.seed
      .update(schema.gradingConfigurationVersions)
      .set({ status: 'ARCHIVED' })
      .where(eq(schema.gradingConfigurationVersions.id, school.configVersionId));
    const configVersion2Id = randomUuid();
    await test.seed
      .insert(schema.gradingConfigurationVersions)
      .values({
        id: configVersion2Id,
        schoolId: school.schoolId,
        gradingConfigurationId: configId,
        versionNumber: 2,
        status: 'ACTIVE',
        rules: {
          ...DEFAULT_RULES,
          thresholds: { maxScore: 100, passingScore: 50 },
        },
      });

    // The V1-bound publication is untouched: value, version, config binding.
    const row = await test.seed
      .select()
      .from(schema.resultPublications)
      .where(eq(schema.resultPublications.id, published.publicationId));
    expect(row[0].resultValue).toBe('17.00');
    expect(row[0].publicationVersion).toBe(1);
    expect(row[0].gradingConfigurationVersionId).toBe(school.configVersionId);

    // An idempotent replay still returns the SAME V1 snapshot.
    const replayed = await publishResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      resultType: 'SUBJECT',
      resultId: calculated.id,
      idempotencyKey: '00000000-0000-4000-8000-0000000000f2',
    });
    expect(replayed.publicationId).toBe(published.publicationId);
    expect(replayed.resultValue).toBe('17.00');
    expect(replayed.gradingConfigurationVersionId).toBe(school.configVersionId);

    // No NEW publication version was created by V2 activation.
    const count = await test.seed
      .select({ id: schema.resultPublications.id })
      .from(schema.resultPublications)
      .where(eq(schema.resultPublications.subjectResultId, calculated.id));
    expect(count).toHaveLength(1);
  });
});

describe('PeriodResult and AnnualResult workflow', () => {
  async function seedPeriodScenario() {
    const school = await seedSchool(test.seed);
    const actors = await seedStudentAndActors(test.seed, school.schoolId, school.yearId, school.classId);

    const mathGradebook = await seedGradebook(test.seed, school.schoolId, school, school.subjectMathId);
    await seedGrades(test.seed, school.schoolId, mathGradebook.gradebookId, mathGradebook, actors.studentId, '16', '18'); // 17.00

    const physicsGradebook = await seedGradebook(test.seed, school.schoolId, school, school.subjectPhysicsId);
    await seedGrades(test.seed, school.schoolId, physicsGradebook.gradebookId, physicsGradebook, actors.studentId, '14', '16'); // 15.00

    return { school, actors, mathGradebook, physicsGradebook };
  }

  it('computes a PeriodResult from MULTIPLE SubjectResults (not a single gradebook)', async () => {
    const { school, actors, mathGradebook, physicsGradebook } = await seedPeriodScenario();
    const adminId = actors.schoolAdminUserId;

    await calculateSubjectResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      gradebookId: mathGradebook.gradebookId,
      studentId: actors.studentId,
    });
    await calculateSubjectResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      gradebookId: physicsGradebook.gradebookId,
      studentId: actors.studentId,
    });

    const period = await calculatePeriodResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      studentId: actors.studentId,
      academicYearId: school.yearId,
      academicPeriodId: school.period1Id,
      classId: school.classId,
    });
    // (17.00 + 15.00) / 2 = 16.00
    expect(period.value).toBe('16.00');
    expect(period.status).toBe('CALCULATED');
    expect(period.gradingConfigurationVersionId).toBe(school.configVersionId);

    await finalizeResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      resultType: 'PERIOD',
      resultId: period.id,
    });

    const published = await publishResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      resultType: 'PERIOD',
      resultId: period.id,
      idempotencyKey: '00000000-0000-4000-8000-0000000000e1',
    });
    expect(published.resultValue).toBe('16.00');
    expect(published.publicationVersion).toBe(1);
    expect(published.academicPeriodId).toBe(school.period1Id);
  });

  it('computes an AnnualResult as a DISTINCT aggregate across periods (not the latest period)', async () => {
    const { school, actors, mathGradebook, physicsGradebook } = await seedPeriodScenario();
    const adminId = actors.schoolAdminUserId;

    // Period 1 results → 16.00
    await calculateSubjectResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      gradebookId: mathGradebook.gradebookId,
      studentId: actors.studentId,
    });
    await calculateSubjectResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      gradebookId: physicsGradebook.gradebookId,
      studentId: actors.studentId,
    });
    await calculatePeriodResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      studentId: actors.studentId,
      academicYearId: school.yearId,
      academicPeriodId: school.period1Id,
      classId: school.classId,
    });

    // Period 2 gradebooks + results → (18, 20 → 19.00) and (16, 16 → 16.00) = 17.50
    const mathGb2 = await seedGradebook2(test, school, school.subjectMathId);
    await seedGrades(test.seed, school.schoolId, mathGb2.gradebookId, mathGb2, actors.studentId, '18', '20');
    const physicsGb2 = await seedGradebook2(test, school, school.subjectPhysicsId);
    await seedGrades(test.seed, school.schoolId, physicsGb2.gradebookId, physicsGb2, actors.studentId, '16', '16');

    await calculateSubjectResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      gradebookId: mathGb2.gradebookId,
      studentId: actors.studentId,
    });
    await calculateSubjectResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      gradebookId: physicsGb2.gradebookId,
      studentId: actors.studentId,
    });
    await calculatePeriodResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      studentId: actors.studentId,
      academicYearId: school.yearId,
      academicPeriodId: school.period2Id,
      classId: school.classId,
    });

    // Annual = (16.00 + 17.50) / 2 = 16.75 — NOT 17.50 (the latest period).
    const annual = await calculateAnnualResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      studentId: actors.studentId,
      academicYearId: school.yearId,
      classId: school.classId,
    });
    expect(annual.value).toBe('16.75');
    expect(annual.academicPeriodId).toBeNull();

    await finalizeResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      resultType: 'ANNUAL',
      resultId: annual.id,
    });
    const published = await publishResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      resultType: 'ANNUAL',
      resultId: annual.id,
      idempotencyKey: '00000000-0000-4000-8000-0000000000f1',
    });
    expect(published.resultValue).toBe('16.75');
    expect(published.academicPeriodId).toBeNull();
    expect(published.publicationVersion).toBe(1);
  });

  it('refuses a PeriodResult when the aggregated SubjectResults disagree on configuration version', async () => {
    const { school, actors, mathGradebook, physicsGradebook } = await seedPeriodScenario();
    const adminId = actors.schoolAdminUserId;

    await calculateSubjectResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      gradebookId: mathGradebook.gradebookId,
      studentId: actors.studentId,
    });
    await calculateSubjectResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      gradebookId: physicsGradebook.gradebookId,
      studentId: actors.studentId,
    });

    // Introduce a SECOND configuration version and bind the physics gradebook to it,
    // then recalculate the physics SubjectResult so it records the NEW version.
    const config2Id = randomUuid();
    await test.seed.insert(schema.gradingConfigurations).values({ id: config2Id, schoolId: school.schoolId, name: 'Second' });
    const configVersion2Id = randomUuid();
    await test.seed
      .insert(schema.gradingConfigurationVersions)
      .values({
        id: configVersion2Id,
        schoolId: school.schoolId,
        gradingConfigurationId: config2Id,
        versionNumber: 1,
        status: 'ACTIVE',
        rules: DEFAULT_RULES,
      });
    await test.seed
      .update(schema.gradebooks)
      .set({ gradingConfigurationVersionId: configVersion2Id })
      .where(eq(schema.gradebooks.id, physicsGradebook.gradebookId));
    await calculateSubjectResult(test.db, {
      userId: adminId,
      schoolId: school.schoolId,
      gradebookId: physicsGradebook.gradebookId,
      studentId: actors.studentId,
    });

    await expect(
      calculatePeriodResult(test.db, {
        userId: adminId,
        schoolId: school.schoolId,
        studentId: actors.studentId,
        academicYearId: school.yearId,
        academicPeriodId: school.period1Id,
        classId: school.classId,
      }),
    ).rejects.toSatisfy((error: unknown) => error instanceof ResultDomainError && error.featureCode === 'INVALID_RESULT_STATE');
  });
});

/** Seeds a second-period gradebook (unique context differs from period 1). */
async function seedGradebook2(
  test: GradesTestDb,
  school: SeededSchool,
  subjectId: string,
): Promise<SeededGradebook> {
  const gradebookId = randomUuid();
  await test.seed
    .insert(schema.gradebooks)
    .values({
      id: gradebookId,
      schoolId: school.schoolId,
      academicYearId: school.yearId,
      academicPeriodId: school.period2Id,
      classId: school.classId,
      subjectId,
      gradingConfigurationVersionId: school.configVersionId,
      status: 'OPEN',
    });
  const assessmentQuizId = randomUuid();
  await test.seed
    .insert(schema.assessments)
    .values({ id: assessmentQuizId, schoolId: school.schoolId, gradebookId, title: 'Quiz', assessmentType: 'QUIZ', maximumScore: '20', weight: '1', status: 'PUBLISHED' });
  const assessmentExamId = randomUuid();
  await test.seed
    .insert(schema.assessments)
    .values({ id: assessmentExamId, schoolId: school.schoolId, gradebookId, title: 'Exam', assessmentType: 'EXAM', maximumScore: '20', weight: '1', status: 'PUBLISHED' });
  return { gradebookId, assessmentQuizId, assessmentExamId };
}

let counter = 0;
function randomUuid(): string {
  counter += 1;
  return `ffffffff-ffff-4fff-8fff-${counter.toString().padStart(12, '0')}`;
}