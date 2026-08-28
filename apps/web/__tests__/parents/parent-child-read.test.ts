import { randomUUID } from 'node:crypto';
import * as schema from '@school/database';
import { describe, expect, it } from 'vitest';

import * as app from '@/lib/modules/parents/application';

import { createActor, createParentsTestContext, type ParentsTestContext } from './test-helpers';
import { seedParentRelationship, seedStudent } from '../students/test-helpers';

async function relatedChild(context: ParentsTestContext) {
  const actor = await createActor(context, 'PARENT');
  const student = await seedStudent(context.test, context.schoolId, 'ParentRead');
  await seedParentRelationship(context, actor, student.id);
  await context.test.seed.insert(schema.studentEnrollments).values({
    schoolId: context.schoolId, studentId: student.id, academicYearId: context.yearId,
    classId: context.classAId, effectiveFrom: '2025-09-01', status: 'ACTIVE',
  });
  return { actor, student };
}

async function resultContext(context: ParentsTestContext, studentId: string) {
  const [period] = await context.test.seed.insert(schema.academicPeriods).values({
    schoolId: context.schoolId, academicYearId: context.yearId, name: 'Term 1', sequence: 1,
    startDate: '2025-09-01', endDate: '2025-12-20', status: 'ACTIVE',
  }).returning();
  const [configuration] = await context.test.seed.insert(schema.gradingConfigurations).values({
    schoolId: context.schoolId, name: 'Parent read configuration',
  }).returning();
  const [version] = await context.test.seed.insert(schema.gradingConfigurationVersions).values({
    schoolId: context.schoolId, gradingConfigurationId: configuration.id, versionNumber: 1,
    status: 'ACTIVE', rules: { schemaVersion: 1 },
  }).returning();
  const [subject] = await context.test.seed.insert(schema.subjectResults).values({
    schoolId: context.schoolId, studentId, academicYearId: context.yearId,
    academicPeriodId: period.id, classId: context.classAId, subjectId: context.subjectId,
    gradingConfigurationVersionId: version.id, value: '14.00', status: 'FINALIZED',
  }).returning();
  const [periodResult] = await context.test.seed.insert(schema.periodResults).values({
    schoolId: context.schoolId, studentId, academicYearId: context.yearId,
    academicPeriodId: period.id, classId: context.classAId,
    gradingConfigurationVersionId: version.id, value: '13.00', status: 'FINALIZED',
  }).returning();
  const [annual] = await context.test.seed.insert(schema.annualResults).values({
    schoolId: context.schoolId, studentId, academicYearId: context.yearId,
    classId: context.classAId, gradingConfigurationVersionId: version.id,
    value: '12.00', status: 'FINALIZED',
  }).returning();
  return { period, version, subject, periodResult, annual };
}

function publication(context: ParentsTestContext, input: {
  resultType: 'SUBJECT' | 'PERIOD' | 'ANNUAL'; resultId: string; studentId: string;
  periodId?: string; versionId: string; value: string; publicationVersion?: number;
}) {
  return context.test.seed.insert(schema.resultPublications).values({
    schoolId: context.schoolId, resultType: input.resultType,
    subjectResultId: input.resultType === 'SUBJECT' ? input.resultId : null,
    periodResultId: input.resultType === 'PERIOD' ? input.resultId : null,
    annualResultId: input.resultType === 'ANNUAL' ? input.resultId : null,
    studentId: input.studentId, academicYearId: context.yearId,
    academicPeriodId: input.resultType === 'ANNUAL' ? null : input.periodId!,
    classId: context.classAId, resultValue: input.value,
    gradingConfigurationVersionId: input.versionId,
    publicationVersion: input.publicationVersion ?? 1,
    publishedBy: context.admin.userId!, idempotencyKey: randomUUID(),
  });
}

describe('Parent child academic read model', () => {
  it('discovers only enrolled Years, returns multiple ACTIVE Years, and never marks one current', async () => {
    const context = await createParentsTestContext();
    const { actor, student } = await relatedChild(context);
    const [secondYear] = await context.test.seed.insert(schema.academicYears).values({
      schoolId: context.schoolId, name: '2026/2027', startDate: '2026-09-01', endDate: '2027-07-01', status: 'ACTIVE',
    }).returning();
    const [secondClass] = await context.test.seed.insert(schema.classes).values({
      schoolId: context.schoolId, academicYearId: secondYear.id, levelId: context.levelId,
      curriculumVersionId: context.curriculumVersionId, name: 'Class A',
    }).returning();
    await context.test.seed.insert(schema.studentEnrollments).values({
      schoolId: context.schoolId, studentId: student.id, academicYearId: secondYear.id,
      classId: secondClass.id, effectiveFrom: '2026-09-01', status: 'ACTIVE',
    });
    await context.test.seed.insert(schema.academicYears).values({
      schoolId: context.schoolId, name: 'Unrelated', startDate: '2027-09-01', endDate: '2028-07-01', status: 'PLANNED',
    });
    const response = await app.listChildAcademicYears(context.parentDb, actor, student.id);
    expect(response.data.map((year) => year.id)).toEqual([secondYear.id, context.yearId]);
    expect(response.data.every((year) => year.status === 'ACTIVE')).toBe(true);
    expect(response.data[0]).not.toHaveProperty('isCurrent');
    expect(response.data[0]).not.toHaveProperty('default');
  });

  it('returns exact-Year active placement and safely denies unrelated child/year contexts', async () => {
    const context = await createParentsTestContext();
    const { actor, student } = await relatedChild(context);
    expect(await app.getChildPlacement(context.parentDb, actor, student.id, context.yearId)).toMatchObject({
      academicYearId: context.yearId, classId: context.classAId, className: 'Class A', levelName: 'Year 1', stageName: 'Primary',
    });
    await expect(app.getChildPlacement(context.parentDb, actor, student.id, randomUUID()))
      .rejects.toMatchObject({ featureCode: 'ACADEMIC_CONTEXT_NOT_AVAILABLE' });
    await expect(app.getChildPlacement(context.parentDb, actor, randomUUID(), context.yearId))
      .rejects.toMatchObject({ featureCode: 'CHILD_NOT_AVAILABLE' });
  });

  it('returns only latest immutable publications for Subject, Period, and Annual Results', async () => {
    const context = await createParentsTestContext();
    const { actor, student } = await relatedChild(context);
    const seeded = await resultContext(context, student.id);
    await publication(context, { resultType: 'SUBJECT', resultId: seeded.subject.id, studentId: student.id, periodId: seeded.period.id, versionId: seeded.version.id, value: '14.00' });
    await publication(context, { resultType: 'SUBJECT', resultId: seeded.subject.id, studentId: student.id, periodId: seeded.period.id, versionId: seeded.version.id, value: '15.50', publicationVersion: 2 });
    await publication(context, { resultType: 'PERIOD', resultId: seeded.periodResult.id, studentId: student.id, periodId: seeded.period.id, versionId: seeded.version.id, value: '13.00' });
    await publication(context, { resultType: 'ANNUAL', resultId: seeded.annual.id, studentId: student.id, versionId: seeded.version.id, value: '12.00' });

    const subject = await app.listChildPublishedResults(context.parentDb, actor, student.id, { academicYearId: context.yearId, resultType: 'SUBJECT', page: 1, pageSize: 1 });
    const period = await app.listChildPublishedResults(context.parentDb, actor, student.id, { academicYearId: context.yearId, resultType: 'PERIOD', page: 1, pageSize: 50 });
    const annual = await app.listChildPublishedResults(context.parentDb, actor, student.id, { academicYearId: context.yearId, resultType: 'ANNUAL', page: 1, pageSize: 50 });
    expect(subject).toMatchObject({ data: [{ value: '15.50', publicationVersion: 2, subject: { name: 'Mathematics' } }], meta: { pageSize: 1, total: 1 } });
    expect(period.data[0]).toMatchObject({ value: '13.00', academicPeriod: { name: 'Term 1' }, subject: null });
    expect(annual.data[0]).toMatchObject({ value: '12.00', academicPeriod: null, subject: null });
    for (const row of [...subject.data, ...period.data, ...annual.data]) {
      expect(row).not.toHaveProperty('grades');
      expect(row).not.toHaveProperty('assessments');
      expect(row).not.toHaveProperty('gradingConfigurationVersionId');
    }
  });

  it('excludes finalized-but-unpublished Results and ended Parent relationships', async () => {
    const context = await createParentsTestContext();
    const { actor, student } = await relatedChild(context);
    await resultContext(context, student.id);
    expect((await app.listChildPublishedResults(context.parentDb, actor, student.id, { academicYearId: context.yearId, resultType: 'SUBJECT', page: 1, pageSize: 50 })).data).toEqual([]);
    const [relationship] = await context.test.seed.select().from(schema.parentStudents);
    await context.test.seed.update(schema.parentStudents).set({ status: 'ENDED' });
    await expect(app.listChildAcademicYears(context.parentDb, actor, student.id))
      .rejects.toMatchObject({ featureCode: 'CHILD_NOT_AVAILABLE' });
    expect(relationship.status).toBe('ACTIVE');
  });

  it('hides foreign children and denies inactive Parent profiles', async () => {
    const context = await createParentsTestContext();
    const foreign = await createParentsTestContext();
    const { actor, student } = await relatedChild(context);
    const foreignStudent = await seedStudent(foreign.test, foreign.schoolId, 'ForeignChild');
    await expect(app.listChildAcademicYears(context.parentDb, actor, foreignStudent.id))
      .rejects.toMatchObject({ featureCode: 'CHILD_NOT_AVAILABLE' });
    await context.test.seed.update(schema.parents).set({ status: 'INACTIVE' });
    await expect(app.listChildAcademicYears(context.parentDb, actor, student.id))
      .rejects.toMatchObject({ featureCode: 'CHILD_NOT_AVAILABLE' });
  });
});
