import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../drizzle/schema';
import { createTestDb, type Db } from './helpers';

let db: Db;

const VALID_RULES = {
  schemaVersion: 1,
  thresholds: { maxScore: 20, passingScore: 10 },
};

async function createSchool(name: string) {
  const [school] = await db.insert(schema.schools).values({ name }).returning();
  return school;
}

async function createAcademicYear(schoolId: string, name: string, startDate = '2025-09-01', endDate = '2026-07-01') {
  const [row] = await db.insert(schema.academicYears).values({ schoolId, name, startDate, endDate }).returning();
  return row;
}

async function createStage(schoolId: string, name: string, sequence = 1) {
  const [row] = await db.insert(schema.stages).values({ schoolId, name, sequence }).returning();
  return row;
}

async function createLevel(schoolId: string, stageId: string, name: string, sequence = 1) {
  const [row] = await db.insert(schema.levels).values({ schoolId, stageId, name, sequence }).returning();
  return row;
}

async function createCurriculum(schoolId: string, name: string) {
  const [row] = await db.insert(schema.curricula).values({ schoolId, name }).returning();
  return row;
}

async function createCurriculumVersion(schoolId: string, curriculumId: string, name: string) {
  const [row] = await db.insert(schema.curriculumVersions).values({ schoolId, curriculumId, name }).returning();
  return row;
}

async function createSubject(schoolId: string, name: string) {
  const [row] = await db.insert(schema.subjects).values({ schoolId, name }).returning();
  return row;
}

async function createClass(
  schoolId: string,
  academicYearId: string,
  levelId: string,
  curriculumVersionId: string,
  name: string,
) {
  const [row] = await db.insert(schema.classes).values({ schoolId, academicYearId, levelId, curriculumVersionId, name }).returning();
  return row;
}

async function createAcademicPeriod(
  schoolId: string,
  academicYearId: string,
  name: string,
  sequence: number,
  startDate = '2025-09-15',
  endDate = '2025-12-20',
) {
  const [row] = await db.insert(schema.academicPeriods).values({ schoolId, academicYearId, name, sequence, startDate, endDate }).returning();
  return row;
}

async function createGradingConfiguration(schoolId: string, name: string) {
  const [row] = await db.insert(schema.gradingConfigurations).values({ schoolId, name }).returning();
  return row;
}

async function createGradingConfigurationVersion(schoolId: string, configurationId: string, versionNumber: number) {
  const [row] = await db
    .insert(schema.gradingConfigurationVersions)
    .values({ schoolId, gradingConfigurationId: configurationId, versionNumber, rules: VALID_RULES })
    .returning();
  return row;
}

interface GradebookInput {
  schoolId: string;
  academicYearId: string;
  academicPeriodId: string;
  classId: string;
  subjectId: string;
  gradingConfigurationVersionId: string;
}

async function createGradebook(input: GradebookInput) {
  const [row] = await db.insert(schema.gradebooks).values(input).returning();
  return row;
}

async function createAssessment(
  schoolId: string,
  gradebookId: string,
  title: string,
  maximumScore = '20',
  weight = '1',
) {
  const [row] = await db
    .insert(schema.assessments)
    .values({ schoolId, gradebookId, title, assessmentType: 'TEST', maximumScore, weight })
    .returning();
  return row;
}

/** Builds a complete, valid Gradebook context (School + Year + Period + Class + Subject + ConfigVersion). */
async function buildContext() {
  const school = await createSchool('School A');
  const year = await createAcademicYear(school.id, '2025/2026');
  const period = await createAcademicPeriod(school.id, year.id, 'Term 1', 1);
  const stage = await createStage(school.id, 'Secondary');
  const level = await createLevel(school.id, stage.id, '1BAC');
  const curriculum = await createCurriculum(school.id, 'BAC Curriculum');
  const curriculumVersion = await createCurriculumVersion(school.id, curriculum.id, '2025');
  const subject = await createSubject(school.id, 'Mathematics');
  const classRow = await createClass(school.id, year.id, level.id, curriculumVersion.id, 'Class A');
  const gradingConfig = await createGradingConfiguration(school.id, 'Standard Grading');
  const gradingVersion = await createGradingConfigurationVersion(school.id, gradingConfig.id, 1);
  return { school, year, period, stage, level, curriculum, curriculumVersion, subject, classRow, gradingConfig, gradingVersion };
}

function gradebookValues(ctx: Awaited<ReturnType<typeof buildContext>>): GradebookInput {
  return {
    schoolId: ctx.school.id,
    academicYearId: ctx.year.id,
    academicPeriodId: ctx.period.id,
    classId: ctx.classRow.id,
    subjectId: ctx.subject.id,
    gradingConfigurationVersionId: ctx.gradingVersion.id,
  };
}

beforeEach(async () => {
  ({ db } = await createTestDb());
});

describe('gradebooks (Task 006B §29)', () => {
  it('belongs to a School', async () => {
    const ctx = await buildContext();

    const gradebook = await createGradebook(gradebookValues(ctx));

    expect(gradebook.schoolId).toBe(ctx.school.id);
    expect(gradebook.status).toBe('DRAFT');
  });

  it('requires a valid AcademicYear', async () => {
    const ctx = await buildContext();

    await expect(
      createGradebook({ ...gradebookValues(ctx), academicYearId: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toThrow();
  });

  it('requires a valid AcademicPeriod', async () => {
    const ctx = await buildContext();

    await expect(
      createGradebook({ ...gradebookValues(ctx), academicPeriodId: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toThrow();
  });

  it('requires the AcademicPeriod to belong to the correct AcademicYear', async () => {
    const ctx = await buildContext();
    const otherYear = await createAcademicYear(ctx.school.id, '2026/2027');
    const periodOfOtherYear = await createAcademicPeriod(ctx.school.id, otherYear.id, 'Term 1', 1);

    await expect(
      createGradebook({ ...gradebookValues(ctx), academicPeriodId: periodOfOtherYear.id }),
    ).rejects.toThrow();
  });

  it('requires the Class to belong to the same AcademicYear', async () => {
    const ctx = await buildContext();
    const otherYear = await createAcademicYear(ctx.school.id, '2026/2027');
    const periodOfOtherYear = await createAcademicPeriod(ctx.school.id, otherYear.id, 'Term 1', 1);
    const classOfOtherYear = await createClass(ctx.school.id, otherYear.id, ctx.level.id, ctx.curriculumVersion.id, 'Class A');

    await expect(
      createGradebook({
        ...gradebookValues(ctx),
        academicYearId: otherYear.id,
        academicPeriodId: periodOfOtherYear.id,
        classId: classOfOtherYear.id,
      }),
    ).resolves.toBeDefined();

    await expect(
      createGradebook({
        ...gradebookValues(ctx),
        academicYearId: otherYear.id,
        academicPeriodId: periodOfOtherYear.id,
        classId: ctx.classRow.id,
      }),
    ).rejects.toThrow();
  });

  it('requires the Subject to belong to the same School', async () => {
    const ctx = await buildContext();
    const otherSchool = await createSchool('School B');
    const subjectOfOtherSchool = await createSubject(otherSchool.id, 'Physics');

    await expect(
      createGradebook({ ...gradebookValues(ctx), subjectId: subjectOfOtherSchool.id }),
    ).rejects.toThrow();
  });

  it('requires the GradingConfigurationVersion to belong to the same School', async () => {
    const ctx = await buildContext();
    const otherSchool = await createSchool('School B');
    const configOfOtherSchool = await createGradingConfiguration(otherSchool.id, 'Other Grading');
    const versionOfOtherSchool = await createGradingConfigurationVersion(otherSchool.id, configOfOtherSchool.id, 1);

    await expect(
      createGradebook({ ...gradebookValues(ctx), gradingConfigurationVersionId: versionOfOtherSchool.id }),
    ).rejects.toThrow();
  });

  it('rejects cross-school Gradebook references', async () => {
    const ctx = await buildContext();
    const otherSchool = await createSchool('School B');
    const otherYear = await createAcademicYear(otherSchool.id, '2025/2026');
    const otherStage = await createStage(otherSchool.id, 'Secondary');
    const otherLevel = await createLevel(otherSchool.id, otherStage.id, '1BAC');
    const otherCurriculum = await createCurriculum(otherSchool.id, 'BAC Curriculum');
    const otherCurriculumVersion = await createCurriculumVersion(otherSchool.id, otherCurriculum.id, '2025');
    const otherSubject = await createSubject(otherSchool.id, 'Mathematics');
    const otherClass = await createClass(otherSchool.id, otherYear.id, otherLevel.id, otherCurriculumVersion.id, 'Class A');
    const otherGradingConfig = await createGradingConfiguration(otherSchool.id, 'Standard Grading');
    const otherGradingVersion = await createGradingConfigurationVersion(otherSchool.id, otherGradingConfig.id, 1);

    await expect(
      createGradebook({
        schoolId: ctx.school.id,
        academicYearId: otherYear.id,
        academicPeriodId: ctx.period.id,
        classId: ctx.classRow.id,
        subjectId: ctx.subject.id,
        gradingConfigurationVersionId: ctx.gradingVersion.id,
      }),
    ).rejects.toThrow();

    await expect(
      createGradebook({
        schoolId: ctx.school.id,
        academicYearId: ctx.year.id,
        academicPeriodId: ctx.period.id,
        classId: otherClass.id,
        subjectId: ctx.subject.id,
        gradingConfigurationVersionId: ctx.gradingVersion.id,
      }),
    ).rejects.toThrow();

    await expect(
      createGradebook({
        schoolId: ctx.school.id,
        academicYearId: ctx.year.id,
        academicPeriodId: ctx.period.id,
        classId: ctx.classRow.id,
        subjectId: otherSubject.id,
        gradingConfigurationVersionId: ctx.gradingVersion.id,
      }),
    ).rejects.toThrow();

    await expect(
      createGradebook({
        schoolId: ctx.school.id,
        academicYearId: ctx.year.id,
        academicPeriodId: ctx.period.id,
        classId: ctx.classRow.id,
        subjectId: ctx.subject.id,
        gradingConfigurationVersionId: otherGradingVersion.id,
      }),
    ).rejects.toThrow();
  });

  it('rejects a duplicate Gradebook logical context', async () => {
    const ctx = await buildContext();
    await createGradebook(gradebookValues(ctx));

    await expect(
      createGradebook({
        ...gradebookValues(ctx),
        gradingConfigurationVersionId: (await createGradingConfigurationVersion(ctx.school.id, ctx.gradingConfig.id, 2)).id,
      }),
    ).rejects.toThrow();
  });

  it('allows the same Class + Subject in different AcademicPeriods', async () => {
    const ctx = await buildContext();
    await createGradebook(gradebookValues(ctx));

    const period2 = await createAcademicPeriod(ctx.school.id, ctx.year.id, 'Term 2', 2, '2026-01-05', '2026-03-27');
    const second = await createGradebook({ ...gradebookValues(ctx), academicPeriodId: period2.id });

    expect(second.id).toBeDefined();
  });

  it('allows the same Class + Subject in different AcademicYears', async () => {
    const ctx = await buildContext();
    await createGradebook(gradebookValues(ctx));

    const year2 = await createAcademicYear(ctx.school.id, '2026/2027', '2026-09-01', '2027-07-01');
    const period2 = await createAcademicPeriod(ctx.school.id, year2.id, 'Term 1', 1, '2026-09-15', '2026-12-20');
    const class2 = await createClass(ctx.school.id, year2.id, ctx.level.id, ctx.curriculumVersion.id, 'Class A');

    const second = await createGradebook({
      ...gradebookValues(ctx),
      academicYearId: year2.id,
      academicPeriodId: period2.id,
      classId: class2.id,
    });

    expect(second.id).toBeDefined();
  });

  it('supports the DRAFT → OPEN → CLOSED → ARCHIVED lifecycle', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(gradebookValues(ctx));

    const [open] = await db.update(schema.gradebooks).set({ status: 'OPEN' }).where(eq(schema.gradebooks.id, gradebook.id)).returning();
    expect(open.status).toBe('OPEN');

    const [closed] = await db.update(schema.gradebooks).set({ status: 'CLOSED' }).where(eq(schema.gradebooks.id, gradebook.id)).returning();
    expect(closed.status).toBe('CLOSED');

    const [archived] = await db.update(schema.gradebooks).set({ status: 'ARCHIVED' }).where(eq(schema.gradebooks.id, gradebook.id)).returning();
    expect(archived.status).toBe('ARCHIVED');
  });

  it('is conservatively protected from deletion once it holds Assessments', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(gradebookValues(ctx));
    await createAssessment(ctx.school.id, gradebook.id, 'Term 1 Exam');

    await expect(
      db.delete(schema.gradebooks).where(eq(schema.gradebooks.id, gradebook.id)),
    ).rejects.toThrow();
  });
});

describe('assessments (Task 006B §30)', () => {
  it('belongs to a Gradebook', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(gradebookValues(ctx));

    const assessment = await createAssessment(ctx.school.id, gradebook.id, 'Term 1 Exam');

    expect(assessment.gradebookId).toBe(gradebook.id);
    expect(assessment.schoolId).toBe(ctx.school.id);
    expect(assessment.status).toBe('DRAFT');
  });

  it('rejects a cross-school Assessment → Gradebook relation', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(gradebookValues(ctx));
    const otherSchool = await createSchool('School B');

    await expect(createAssessment(otherSchool.id, gradebook.id, 'Term 1 Exam')).rejects.toThrow();
  });

  it('rejects a non-positive maximum_score', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(gradebookValues(ctx));

    await expect(createAssessment(ctx.school.id, gradebook.id, 'Bad', '0')).rejects.toThrow();
    await expect(createAssessment(ctx.school.id, gradebook.id, 'Bad', '-1')).rejects.toThrow();
  });

  it('supports a decimal maximum_score', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(gradebookValues(ctx));

    const assessment = await createAssessment(ctx.school.id, gradebook.id, 'Oral', '15.5');

    expect(Number(assessment.maximumScore)).toBe(15.5);
  });

  it('validates the weight range (must be > 0, exact decimal)', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(gradebookValues(ctx));

    await expect(createAssessment(ctx.school.id, gradebook.id, 'Zero Weight', '20', '0')).rejects.toThrow();
    await expect(createAssessment(ctx.school.id, gradebook.id, 'Negative Weight', '20', '-2')).rejects.toThrow();

    const assessment = await createAssessment(ctx.school.id, gradebook.id, 'Weighted', '20', '1.5');
    expect(Number(assessment.weight)).toBe(1.5);
  });

  it('validates the assessment type', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(gradebookValues(ctx));

    await expect(
      db.insert(schema.assessments).values({
        schoolId: ctx.school.id,
        gradebookId: gradebook.id,
        title: 'Unknown Type',
        assessmentType: 'SURPRISE' as never,
        maximumScore: '20',
      }),
    ).rejects.toThrow();
  });

  it('supports the DRAFT → PUBLISHED → ARCHIVED lifecycle', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(gradebookValues(ctx));
    const assessment = await createAssessment(ctx.school.id, gradebook.id, 'Term 1 Exam');

    const [published] = await db.update(schema.assessments).set({ status: 'PUBLISHED' }).where(eq(schema.assessments.id, assessment.id)).returning();
    expect(published.status).toBe('PUBLISHED');

    const [archived] = await db.update(schema.assessments).set({ status: 'ARCHIVED' }).where(eq(schema.assessments.id, assessment.id)).returning();
    expect(archived.status).toBe('ARCHIVED');
  });

  it('allows multiple Assessments in one Gradebook', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(gradebookValues(ctx));

    const a = await createAssessment(ctx.school.id, gradebook.id, 'Quiz 1', '10');
    const b = await createAssessment(ctx.school.id, gradebook.id, 'Exam', '20');

    const all = await db.select().from(schema.assessments).where(eq(schema.assessments.gradebookId, gradebook.id));
    expect(all.map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('remains historically queryable after the Gradebook is closed', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(gradebookValues(ctx));
    const assessment = await createAssessment(ctx.school.id, gradebook.id, 'Term 1 Exam');

    await db.update(schema.gradebooks).set({ status: 'CLOSED' }).where(eq(schema.gradebooks.id, gradebook.id));

    const [stored] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, assessment.id));
    expect(stored).toBeDefined();
    expect(stored.gradebookId).toBe(gradebook.id);
  });

  it('is not destroyed by Gradebook deletion (RESTRICT preserves history)', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(gradebookValues(ctx));
    const assessment = await createAssessment(ctx.school.id, gradebook.id, 'Term 1 Exam');

    await expect(
      db.delete(schema.gradebooks).where(eq(schema.gradebooks.id, gradebook.id)),
    ).rejects.toThrow();

    const [stored] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, assessment.id));
    expect(stored).toBeDefined();
  });
});

describe('historical configuration binding (Task 006B §31, BR-GRADE-011)', () => {
  it('keeps the Gradebook bound to the exact GradingConfigurationVersion used at creation', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(gradebookValues(ctx));
    expect(gradebook.gradingConfigurationVersionId).toBe(ctx.gradingVersion.id);

    await createGradingConfigurationVersion(ctx.school.id, ctx.gradingConfig.id, 2);

    const [stored] = await db.select().from(schema.gradebooks).where(eq(schema.gradebooks.id, gradebook.id));
    expect(stored.gradingConfigurationVersionId).toBe(ctx.gradingVersion.id);
  });
});

describe('academic context validation (Task 006B §32)', () => {
  it('rejects a School A Gradebook with a School B AcademicYear', async () => {
    const ctx = await buildContext();
    const otherSchool = await createSchool('School B');
    const otherYear = await createAcademicYear(otherSchool.id, '2025/2026');

    await expect(
      createGradebook({ ...gradebookValues(ctx), academicYearId: otherYear.id }),
    ).rejects.toThrow();
  });

  it('rejects a School A Gradebook with a School B AcademicPeriod', async () => {
    const ctx = await buildContext();
    const otherSchool = await createSchool('School B');
    const otherYear = await createAcademicYear(otherSchool.id, '2025/2026');
    const otherPeriod = await createAcademicPeriod(otherSchool.id, otherYear.id, 'Term 1', 1);

    await expect(
      createGradebook({ ...gradebookValues(ctx), academicPeriodId: otherPeriod.id }),
    ).rejects.toThrow();
  });

  it('rejects a School A Gradebook with a School B Class', async () => {
    const ctx = await buildContext();
    const otherSchool = await createSchool('School B');
    const otherYear = await createAcademicYear(otherSchool.id, '2025/2026');
    const otherStage = await createStage(otherSchool.id, 'Secondary');
    const otherLevel = await createLevel(otherSchool.id, otherStage.id, '1BAC');
    const otherCurriculum = await createCurriculum(otherSchool.id, 'BAC Curriculum');
    const otherCurriculumVersion = await createCurriculumVersion(otherSchool.id, otherCurriculum.id, '2025');
    const otherClass = await createClass(otherSchool.id, otherYear.id, otherLevel.id, otherCurriculumVersion.id, 'Class A');

    await expect(
      createGradebook({ ...gradebookValues(ctx), classId: otherClass.id }),
    ).rejects.toThrow();
  });

  it('rejects a School A Gradebook with a School B Subject', async () => {
    const ctx = await buildContext();
    const otherSchool = await createSchool('School B');
    const otherSubject = await createSubject(otherSchool.id, 'Physics');

    await expect(
      createGradebook({ ...gradebookValues(ctx), subjectId: otherSubject.id }),
    ).rejects.toThrow();
  });

  it('rejects a School A Gradebook with a School B ConfigurationVersion', async () => {
    const ctx = await buildContext();
    const otherSchool = await createSchool('School B');
    const otherConfig = await createGradingConfiguration(otherSchool.id, 'Other Grading');
    const otherVersion = await createGradingConfigurationVersion(otherSchool.id, otherConfig.id, 1);

    await expect(
      createGradebook({ ...gradebookValues(ctx), gradingConfigurationVersionId: otherVersion.id }),
    ).rejects.toThrow();
  });

  it('rejects a Class from AcademicYear B in a Gradebook of AcademicYear A', async () => {
    const ctx = await buildContext();
    const yearB = await createAcademicYear(ctx.school.id, '2026/2027', '2026-09-01', '2027-07-01');
    const classOfYearB = await createClass(ctx.school.id, yearB.id, ctx.level.id, ctx.curriculumVersion.id, 'Class B');

    await expect(
      createGradebook({ ...gradebookValues(ctx), classId: classOfYearB.id }),
    ).rejects.toThrow();
  });

  it('rejects an AcademicPeriod from AcademicYear B in a Gradebook of AcademicYear A', async () => {
    const ctx = await buildContext();
    const yearB = await createAcademicYear(ctx.school.id, '2026/2027', '2026-09-01', '2027-07-01');
    const periodOfYearB = await createAcademicPeriod(ctx.school.id, yearB.id, 'Term 1', 1, '2026-09-15', '2026-12-20');

    await expect(
      createGradebook({ ...gradebookValues(ctx), academicPeriodId: periodOfYearB.id }),
    ).rejects.toThrow();
  });
});