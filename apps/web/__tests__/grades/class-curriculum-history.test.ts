import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import * as schema from '@school/database';
import * as academic from '@/lib/modules/academic-structure/application/academic-structure-service';
import * as results from '@/lib/modules/grades/application';
import * as repo from '@/lib/modules/grades/infrastructure/repositories/result-repository';
import { createGradesTestDb, DEFAULT_RULES, seedSchool, seedStudentAndActors, seedGradebook, seedGrades, type GradesTestDb } from './test-helpers';

let test: GradesTestDb;
beforeEach(async () => { test = await createGradesTestDb(); });
afterEach(async () => { await test.client.close(); });

it('preserves Subject/Period/Annual calculation and revision after rejecting a CLOSED Class rebind', async () => {
  const school = await seedSchool(test.seed, { rules: { ...DEFAULT_RULES,
    periodCalculation: { mode: 'WEIGHTED_AVERAGE' },
    coefficientUsage: { mode: 'USE_CURRICULUM_SUBJECT_COEFFICIENT' },
  } });
  await test.seed.update(schema.curriculumSubjects).set({ coefficient: '1' })
    .where(eq(schema.curriculumSubjects.curriculumVersionId, school.curriculumVersionId));
  const actors = await seedStudentAndActors(test.seed, school.schoolId, school.yearId, school.classId);
  const actor = { userId: actors.schoolAdminUserId, schoolId: school.schoolId };
  const context = { ...actor, studentId: actors.studentId, classId: school.classId, academicYearId: school.yearId };
  const math = await seedGradebook(test.seed, school.schoolId, school, school.subjectMathId);
  const physics = await seedGradebook(test.seed, school.schoolId, school, school.subjectPhysicsId);
  await seedGrades(test.seed, school.schoolId, math.gradebookId, math, actors.studentId, '10', '10');
  await seedGrades(test.seed, school.schoolId, physics.gradebookId, physics, actors.studentId, '20', '20');
  const mathInput = { ...actor, studentId: actors.studentId, gradebookId: math.gradebookId };
  const subject = await results.calculateSubjectResult(test.db, mathInput);
  await results.calculateSubjectResult(test.db, { ...mathInput, gradebookId: physics.gradebookId });
  const periodInput = { ...context, academicPeriodId: school.period1Id };
  const period = await results.calculatePeriodResult(test.db, periodInput);
  const annual = await results.calculateAnnualResult(test.db, context);
  expect([subject.value, period.value, annual.value]).toEqual(['10.00', '15.00', '15.00']);
  const originals = [];
  for (const [resultType, result] of [['SUBJECT', subject], ['PERIOD', period], ['ANNUAL', annual]] as const) {
    await results.finalizeResult(test.db, { ...actor, resultType, resultId: result.id });
    originals.push(await results.publishResult(test.db, { ...actor, resultType, resultId: result.id, idempotencyKey: randomUUID() }));
  }
  await academic.patchClass(test.db, actor, school.classId, { status: 'CLOSED' });
  const originalVersion = await academic.getCurriculumVersion(test.db, actor, school.curriculumVersionId);
  const replacement = await academic.createCurriculumVersion(test.db, actor, originalVersion.curriculumId, { name: 'Replacement' });
  await academic.createCurriculumSubject(test.db, actor, replacement.id, { subjectId: school.subjectMathId, coefficient: '3' });
  await academic.createCurriculumSubject(test.db, actor, replacement.id, { subjectId: school.subjectPhysicsId, coefficient: '1' });
  await academic.patchCurriculumVersion(test.db, actor, replacement.id, { status: 'ACTIVE' });
  expect(await repo.findCurriculumCoefficient(test.db, school.schoolId, school.curriculumVersionId, school.subjectMathId)).toBe('1.00');
  // Pre-fix reproduction: this succeeded and revisions changed 15.00 → 12.50
  // without any grade change, while the grading rules version stayed identical.
  await expect(academic.patchClass(test.db, actor, school.classId, { curriculumVersionId: replacement.id }))
    .rejects.toMatchObject({ featureCode: 'CLASS_CURRICULUM_IMMUTABLE' });
  const binding = await repo.findClassCurriculumVersionId(test.db, school.schoolId, school.classId);
  expect(binding).toBe(school.curriculumVersionId);
  expect(await repo.findCurriculumCoefficient(test.db, school.schoolId, binding!, school.subjectMathId)).toBe('1.00');
  await academic.patchCurriculumVersion(test.db, actor, school.curriculumVersionId, { status: 'ARCHIVED' });
  expect(await academic.getClass(test.db, actor, school.classId)).toMatchObject({ curriculumVersionId: school.curriculumVersionId, canChangeCurriculum: false });
  expect(await academic.getCurriculumVersion(test.db, actor, school.curriculumVersionId)).toMatchObject({ status: 'ARCHIVED' });
  await expect(results.calculateSubjectResult(test.db, mathInput)).rejects.toMatchObject({ featureCode: 'RESULT_ALREADY_FINALIZED' });
  await expect(results.calculatePeriodResult(test.db, periodInput)).rejects.toMatchObject({ featureCode: 'RESULT_ALREADY_FINALIZED' });
  await expect(results.calculateAnnualResult(test.db, context)).rejects.toMatchObject({ featureCode: 'RESULT_ALREADY_FINALIZED' });
  const values = [];
  for (const [resultType, result] of [['SUBJECT', subject], ['PERIOD', period], ['ANNUAL', annual]] as const) {
    const revision = await results.reviseResult(test.db, { ...actor, resultType, resultId: result.id, idempotencyKey: randomUUID() });
    values.push(revision.resultValue);
    expect(revision.gradingConfigurationVersionId).toBe(school.configVersionId);
    expect(revision.publicationVersion).toBe(2);
  }
  expect(values).toEqual(['10.00', '15.00', '15.00']);
  for (const original of originals) {
    const [stored] = await test.seed.select().from(schema.resultPublications).where(and(
      eq(schema.resultPublications.schoolId, school.schoolId), eq(schema.resultPublications.id, original.publicationId),
    ));
    expect(stored.resultValue).toBe(original.resultValue);
    expect(stored.publicationVersion).toBe(1);
  }
});
