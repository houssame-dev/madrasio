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

async function createStudent(schoolId: string, firstName: string, lastName: string) {
  const [row] = await db.insert(schema.students).values({ schoolId, firstName, lastName }).returning();
  return row;
}

async function createEnrollment(schoolId: string, studentId: string, academicYearId: string, classId: string) {
  const [row] = await db
    .insert(schema.studentEnrollments)
    .values({ schoolId, studentId, academicYearId, classId, effectiveFrom: '2025-09-01' })
    .returning();
  return row;
}

async function createGradebook(
  schoolId: string,
  academicYearId: string,
  academicPeriodId: string,
  classId: string,
  subjectId: string,
  gradingConfigurationVersionId: string,
) {
  const [row] = await db
    .insert(schema.gradebooks)
    .values({ schoolId, academicYearId, academicPeriodId, classId, subjectId, gradingConfigurationVersionId })
    .returning();
  return row;
}

async function createAssessment(schoolId: string, gradebookId: string, title: string, maximumScore = '20') {
  const [row] = await db
    .insert(schema.assessments)
    .values({ schoolId, gradebookId, title, assessmentType: 'TEST', maximumScore })
    .returning();
  return row;
}

async function createGrade(
  schoolId: string,
  gradebookId: string,
  assessmentId: string,
  studentId: string,
  score?: string,
  state: 'VALID' | 'MISSING' | 'ABSENT' | 'EXCUSED' = 'VALID',
) {
  const [row] = await db.insert(schema.grades).values({ schoolId, gradebookId, assessmentId, studentId, score, state }).returning();
  return row;
}

/** Builds a complete valid context: School + Year + Period + Class + Subject + ConfigVersion + Student. */
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
  const student = await createStudent(school.id, 'Amina', 'Alami');
  const enrollment = await createEnrollment(school.id, student.id, year.id, classRow.id);
  return { school, year, period, stage, level, curriculum, curriculumVersion, subject, classRow, gradingConfig, gradingVersion, student, enrollment };
}

/** Builds a second, entirely separate School context (for cross-school tests). */
async function buildOtherContext() {
  const school = await createSchool('School B');
  const year = await createAcademicYear(school.id, '2025/2026');
  const period = await createAcademicPeriod(school.id, year.id, 'Term 1', 1);
  const stage = await createStage(school.id, 'Secondary');
  const level = await createLevel(school.id, stage.id, '1BAC');
  const curriculum = await createCurriculum(school.id, 'BAC Curriculum');
  const curriculumVersion = await createCurriculumVersion(school.id, curriculum.id, '2025');
  const subject = await createSubject(school.id, 'Physics');
  const classRow = await createClass(school.id, year.id, level.id, curriculumVersion.id, 'Class B');
  const gradingConfig = await createGradingConfiguration(school.id, 'Standard Grading');
  const gradingVersion = await createGradingConfigurationVersion(school.id, gradingConfig.id, 1);
  const student = await createStudent(school.id, 'Yassine', 'Bennani');
  return { school, year, period, stage, level, curriculum, curriculumVersion, subject, classRow, gradingConfig, gradingVersion, student };
}

beforeEach(async () => {
  ({ db } = await createTestDb());
});

describe('grades (Task 006C §33)', () => {
  it('belongs to a valid Assessment', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(ctx.school.id, ctx.year.id, ctx.period.id, ctx.classRow.id, ctx.subject.id, ctx.gradingVersion.id);
    const assessment = await createAssessment(ctx.school.id, gradebook.id, 'Term 1 Exam');

    const grade = await createGrade(ctx.school.id, gradebook.id, assessment.id, ctx.student.id, '15');

    expect(grade.assessmentId).toBe(assessment.id);
    expect(grade.gradebookId).toBe(gradebook.id);
    expect(grade.schoolId).toBe(ctx.school.id);
    expect(grade.state).toBe('VALID');
    expect(Number(grade.score)).toBe(15);
  });

  it('requires a valid Assessment', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(ctx.school.id, ctx.year.id, ctx.period.id, ctx.classRow.id, ctx.subject.id, ctx.gradingVersion.id);

    await expect(
      createGrade(ctx.school.id, gradebook.id, '00000000-0000-0000-0000-000000000000', ctx.student.id, '15'),
    ).rejects.toThrow();
  });

  it('belongs to a valid Student', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(ctx.school.id, ctx.year.id, ctx.period.id, ctx.classRow.id, ctx.subject.id, ctx.gradingVersion.id);
    const assessment = await createAssessment(ctx.school.id, gradebook.id, 'Term 1 Exam');

    const grade = await createGrade(ctx.school.id, gradebook.id, assessment.id, ctx.student.id, '15');

    expect(grade.studentId).toBe(ctx.student.id);
  });

  it('requires a valid Student', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(ctx.school.id, ctx.year.id, ctx.period.id, ctx.classRow.id, ctx.subject.id, ctx.gradingVersion.id);
    const assessment = await createAssessment(ctx.school.id, gradebook.id, 'Term 1 Exam');

    await expect(
      createGrade(ctx.school.id, gradebook.id, assessment.id, '00000000-0000-0000-0000-000000000000', '15'),
    ).rejects.toThrow();
  });

  it('rejects a cross-school Assessment', async () => {
    const ctx = await buildContext();
    const other = await buildOtherContext();
    const gradebook = await createGradebook(ctx.school.id, ctx.year.id, ctx.period.id, ctx.classRow.id, ctx.subject.id, ctx.gradingVersion.id);
    const otherGradebook = await createGradebook(other.school.id, other.year.id, other.period.id, other.classRow.id, other.subject.id, other.gradingVersion.id);
    const otherAssessment = await createAssessment(other.school.id, otherGradebook.id, 'Other Exam');

    await expect(
      createGrade(ctx.school.id, gradebook.id, otherAssessment.id, ctx.student.id, '15'),
    ).rejects.toThrow();
  });

  it('rejects a cross-school Student', async () => {
    const ctx = await buildContext();
    const other = await buildOtherContext();
    const gradebook = await createGradebook(ctx.school.id, ctx.year.id, ctx.period.id, ctx.classRow.id, ctx.subject.id, ctx.gradingVersion.id);
    const assessment = await createAssessment(ctx.school.id, gradebook.id, 'Term 1 Exam');

    await expect(
      createGrade(ctx.school.id, gradebook.id, assessment.id, other.student.id, '15'),
    ).rejects.toThrow();
  });

  it('rejects a Grade whose Assessment belongs to a different Gradebook', async () => {
    const ctx = await buildContext();
    const gradebookA = await createGradebook(ctx.school.id, ctx.year.id, ctx.period.id, ctx.classRow.id, ctx.subject.id, ctx.gradingVersion.id);
    const assessmentA = await createAssessment(ctx.school.id, gradebookA.id, 'Exam A');
    const periodB = await createAcademicPeriod(ctx.school.id, ctx.year.id, 'Term 2', 2, '2026-01-05', '2026-03-27');
    const gradebookB = await createGradebook(ctx.school.id, ctx.year.id, periodB.id, ctx.classRow.id, ctx.subject.id, ctx.gradingVersion.id);

    await expect(
      createGrade(ctx.school.id, gradebookB.id, assessmentA.id, ctx.student.id, '15'),
    ).rejects.toThrow();
  });

  it('rejects a duplicate Assessment + Student pair', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(ctx.school.id, ctx.year.id, ctx.period.id, ctx.classRow.id, ctx.subject.id, ctx.gradingVersion.id);
    const assessment = await createAssessment(ctx.school.id, gradebook.id, 'Term 1 Exam');
    await createGrade(ctx.school.id, gradebook.id, assessment.id, ctx.student.id, '15');

    await expect(
      createGrade(ctx.school.id, gradebook.id, assessment.id, ctx.student.id, '18'),
    ).rejects.toThrow();
  });

  it('accepts a numeric score', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(ctx.school.id, ctx.year.id, ctx.period.id, ctx.classRow.id, ctx.subject.id, ctx.gradingVersion.id);
    const assessment = await createAssessment(ctx.school.id, gradebook.id, 'Term 1 Exam');

    const grade = await createGrade(ctx.school.id, gradebook.id, assessment.id, ctx.student.id, '0');

    expect(Number(grade.score)).toBe(0);
  });

  it('accepts a decimal score', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(ctx.school.id, ctx.year.id, ctx.period.id, ctx.classRow.id, ctx.subject.id, ctx.gradingVersion.id);
    const assessment = await createAssessment(ctx.school.id, gradebook.id, 'Term 1 Exam');

    const grade = await createGrade(ctx.school.id, gradebook.id, assessment.id, ctx.student.id, '15.5');

    expect(Number(grade.score)).toBe(15.5);
  });

  it('rejects a negative score', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(ctx.school.id, ctx.year.id, ctx.period.id, ctx.classRow.id, ctx.subject.id, ctx.gradingVersion.id);
    const assessment = await createAssessment(ctx.school.id, gradebook.id, 'Term 1 Exam');

    await expect(
      createGrade(ctx.school.id, gradebook.id, assessment.id, ctx.student.id, '-1'),
    ).rejects.toThrow();
  });

  it('documents the Application-layer boundary: score above maximum_score is not DB-enforceable', async () => {
    // BR-GRADE-005 requires score <= Assessment.maximum_score, but a DB CHECK
    // cannot reference another table (assessments.maximum_score). Enforcing the
    // upper bound is therefore an Application-layer responsibility (Task 006C
    // §5). This test documents the boundary: the schema enforces score >= 0
    // (CHECK) and the state/score consistency, NOT the cross-table upper bound.
    const ctx = await buildContext();
    const gradebook = await createGradebook(ctx.school.id, ctx.year.id, ctx.period.id, ctx.classRow.id, ctx.subject.id, ctx.gradingVersion.id);
    const assessment = await createAssessment(ctx.school.id, gradebook.id, 'Term 1 Exam', '20');

    const grade = await createGrade(ctx.school.id, gradebook.id, assessment.id, ctx.student.id, '25');

    expect(Number(grade.score)).toBe(25);
  });

  it('supports the MISSING state', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(ctx.school.id, ctx.year.id, ctx.period.id, ctx.classRow.id, ctx.subject.id, ctx.gradingVersion.id);
    const assessment = await createAssessment(ctx.school.id, gradebook.id, 'Term 1 Exam');

    const grade = await createGrade(ctx.school.id, gradebook.id, assessment.id, ctx.student.id, undefined, 'MISSING');

    expect(grade.state).toBe('MISSING');
    expect(grade.score).toBeNull();
  });

  it('supports the ABSENT state', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(ctx.school.id, ctx.year.id, ctx.period.id, ctx.classRow.id, ctx.subject.id, ctx.gradingVersion.id);
    const assessment = await createAssessment(ctx.school.id, gradebook.id, 'Term 1 Exam');

    const grade = await createGrade(ctx.school.id, gradebook.id, assessment.id, ctx.student.id, undefined, 'ABSENT');

    expect(grade.state).toBe('ABSENT');
    expect(grade.score).toBeNull();
  });

  it('supports the EXCUSED state', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(ctx.school.id, ctx.year.id, ctx.period.id, ctx.classRow.id, ctx.subject.id, ctx.gradingVersion.id);
    const assessment = await createAssessment(ctx.school.id, gradebook.id, 'Term 1 Exam');

    const grade = await createGrade(ctx.school.id, gradebook.id, assessment.id, ctx.student.id, undefined, 'EXCUSED');

    expect(grade.state).toBe('EXCUSED');
    expect(grade.score).toBeNull();
  });

  it('rejects a score attached to a non-VALID state', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(ctx.school.id, ctx.year.id, ctx.period.id, ctx.classRow.id, ctx.subject.id, ctx.gradingVersion.id);
    const assessment = await createAssessment(ctx.school.id, gradebook.id, 'Term 1 Exam');

    await expect(
      createGrade(ctx.school.id, gradebook.id, assessment.id, ctx.student.id, '10', 'MISSING'),
    ).rejects.toThrow();
  });

  it('rejects a VALID state without a score', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(ctx.school.id, ctx.year.id, ctx.period.id, ctx.classRow.id, ctx.subject.id, ctx.gradingVersion.id);
    const assessment = await createAssessment(ctx.school.id, gradebook.id, 'Term 1 Exam');

    await expect(
      db.insert(schema.grades).values({
        schoolId: ctx.school.id,
        gradebookId: gradebook.id,
        assessmentId: assessment.id,
        studentId: ctx.student.id,
        state: 'VALID',
      }),
    ).rejects.toThrow();
  });

  it('preserves a historical Grade after the enrollment ends', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(ctx.school.id, ctx.year.id, ctx.period.id, ctx.classRow.id, ctx.subject.id, ctx.gradingVersion.id);
    const assessment = await createAssessment(ctx.school.id, gradebook.id, 'Term 1 Exam');
    const grade = await createGrade(ctx.school.id, gradebook.id, assessment.id, ctx.student.id, '15');

    await db.update(schema.studentEnrollments).set({ status: 'ENDED' }).where(eq(schema.studentEnrollments.id, ctx.enrollment.id));

    const [stored] = await db.select().from(schema.grades).where(eq(schema.grades.id, grade.id));
    expect(stored).toBeDefined();
    expect(stored.studentId).toBe(ctx.student.id);
  });

  it('remains linked to its historical Assessment/Gradebook context when the Gradebook is closed', async () => {
    const ctx = await buildContext();
    const gradebook = await createGradebook(ctx.school.id, ctx.year.id, ctx.period.id, ctx.classRow.id, ctx.subject.id, ctx.gradingVersion.id);
    const assessment = await createAssessment(ctx.school.id, gradebook.id, 'Term 1 Exam');
    const grade = await createGrade(ctx.school.id, gradebook.id, assessment.id, ctx.student.id, '15');

    await db.update(schema.gradebooks).set({ status: 'CLOSED' }).where(eq(schema.gradebooks.id, gradebook.id));

    const [stored] = await db.select().from(schema.grades).where(eq(schema.grades.id, grade.id));
    expect(stored).toBeDefined();
    expect(stored.gradebookId).toBe(gradebook.id);
    expect(stored.assessmentId).toBe(assessment.id);

    // A CLOSED Gradebook is not the same as Grade deletion — and deleting the
    // Gradebook while it still holds historical Grades is RESTRICTed.
    await expect(
      db.delete(schema.gradebooks).where(eq(schema.gradebooks.id, gradebook.id)),
    ).rejects.toThrow();
  });
});

describe('subject_results (Task 006C §34)', () => {
  it('accepts a valid Student + Subject + Class + AcademicYear + AcademicPeriod', async () => {
    const ctx = await buildContext();

    const [result] = await db.insert(schema.subjectResults).values({
      schoolId: ctx.school.id,
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      academicPeriodId: ctx.period.id,
      classId: ctx.classRow.id,
      subjectId: ctx.subject.id,
      gradingConfigurationVersionId: ctx.gradingVersion.id,
      value: '14.75',
    }).returning();

    expect(result.status).toBe('CALCULATED');
    expect(Number(result.value)).toBe(14.75);
    expect(result.gradingConfigurationVersionId).toBe(ctx.gradingVersion.id);
  });

  it('rejects a cross-school Student', async () => {
    const ctx = await buildContext();
    const other = await buildOtherContext();

    await expect(
      db.insert(schema.subjectResults).values({
        schoolId: ctx.school.id,
        studentId: other.student.id,
        academicYearId: ctx.year.id,
        academicPeriodId: ctx.period.id,
        classId: ctx.classRow.id,
        subjectId: ctx.subject.id,
        gradingConfigurationVersionId: ctx.gradingVersion.id,
        value: '14',
      }),
    ).rejects.toThrow();
  });

  it('rejects a cross-school Class', async () => {
    const ctx = await buildContext();
    const other = await buildOtherContext();

    await expect(
      db.insert(schema.subjectResults).values({
        schoolId: ctx.school.id,
        studentId: ctx.student.id,
        academicYearId: ctx.year.id,
        academicPeriodId: ctx.period.id,
        classId: other.classRow.id,
        subjectId: ctx.subject.id,
        gradingConfigurationVersionId: ctx.gradingVersion.id,
        value: '14',
      }),
    ).rejects.toThrow();
  });

  it('rejects a cross-school Subject', async () => {
    const ctx = await buildContext();
    const other = await buildOtherContext();

    await expect(
      db.insert(schema.subjectResults).values({
        schoolId: ctx.school.id,
        studentId: ctx.student.id,
        academicYearId: ctx.year.id,
        academicPeriodId: ctx.period.id,
        classId: ctx.classRow.id,
        subjectId: other.subject.id,
        gradingConfigurationVersionId: ctx.gradingVersion.id,
        value: '14',
      }),
    ).rejects.toThrow();
  });

  it('rejects a cross-school AcademicPeriod', async () => {
    const ctx = await buildContext();
    const other = await buildOtherContext();

    await expect(
      db.insert(schema.subjectResults).values({
        schoolId: ctx.school.id,
        studentId: ctx.student.id,
        academicYearId: ctx.year.id,
        academicPeriodId: other.period.id,
        classId: ctx.classRow.id,
        subjectId: ctx.subject.id,
        gradingConfigurationVersionId: ctx.gradingVersion.id,
        value: '14',
      }),
    ).rejects.toThrow();
  });

  it('rejects an AcademicPeriod from a different AcademicYear', async () => {
    const ctx = await buildContext();
    const yearB = await createAcademicYear(ctx.school.id, '2026/2027', '2026-09-01', '2027-07-01');
    const periodOfYearB = await createAcademicPeriod(ctx.school.id, yearB.id, 'Term 1', 1, '2026-09-15', '2026-12-20');

    await expect(
      db.insert(schema.subjectResults).values({
        schoolId: ctx.school.id,
        studentId: ctx.student.id,
        academicYearId: ctx.year.id,
        academicPeriodId: periodOfYearB.id,
        classId: ctx.classRow.id,
        subjectId: ctx.subject.id,
        gradingConfigurationVersionId: ctx.gradingVersion.id,
        value: '14',
      }),
    ).rejects.toThrow();
  });

  it('rejects a Class from a different AcademicYear', async () => {
    const ctx = await buildContext();
    const yearB = await createAcademicYear(ctx.school.id, '2026/2027', '2026-09-01', '2027-07-01');
    const classOfYearB = await createClass(ctx.school.id, yearB.id, ctx.level.id, ctx.curriculumVersion.id, 'Class B');

    await expect(
      db.insert(schema.subjectResults).values({
        schoolId: ctx.school.id,
        studentId: ctx.student.id,
        academicYearId: ctx.year.id,
        academicPeriodId: ctx.period.id,
        classId: classOfYearB.id,
        subjectId: ctx.subject.id,
        gradingConfigurationVersionId: ctx.gradingVersion.id,
        value: '14',
      }),
    ).rejects.toThrow();
  });

  it('rejects a ConfigurationVersion from a different School', async () => {
    const ctx = await buildContext();
    const other = await buildOtherContext();

    await expect(
      db.insert(schema.subjectResults).values({
        schoolId: ctx.school.id,
        studentId: ctx.student.id,
        academicYearId: ctx.year.id,
        academicPeriodId: ctx.period.id,
        classId: ctx.classRow.id,
        subjectId: ctx.subject.id,
        gradingConfigurationVersionId: other.gradingVersion.id,
        value: '14',
      }),
    ).rejects.toThrow();
  });

  it('rejects a duplicate logical SubjectResult', async () => {
    const ctx = await buildContext();
    const values = {
      schoolId: ctx.school.id,
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      academicPeriodId: ctx.period.id,
      classId: ctx.classRow.id,
      subjectId: ctx.subject.id,
      gradingConfigurationVersionId: ctx.gradingVersion.id,
      value: '14',
    };
    await db.insert(schema.subjectResults).values(values);

    await expect(
      db.insert(schema.subjectResults).values({ ...values, value: '16' }),
    ).rejects.toThrow();
  });

  it('stores a precise decimal value', async () => {
    const ctx = await buildContext();

    const [result] = await db.insert(schema.subjectResults).values({
      schoolId: ctx.school.id,
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      academicPeriodId: ctx.period.id,
      classId: ctx.classRow.id,
      subjectId: ctx.subject.id,
      gradingConfigurationVersionId: ctx.gradingVersion.id,
      value: '14.99',
    }).returning();

    expect(Number(result.value)).toBe(14.99);
  });

  it('supports the CALCULATED → FINALIZED lifecycle', async () => {
    const ctx = await buildContext();
    const [result] = await db.insert(schema.subjectResults).values({
      schoolId: ctx.school.id,
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      academicPeriodId: ctx.period.id,
      classId: ctx.classRow.id,
      subjectId: ctx.subject.id,
      gradingConfigurationVersionId: ctx.gradingVersion.id,
      value: '14',
    }).returning();

    const [finalized] = await db.update(schema.subjectResults).set({ status: 'FINALIZED' }).where(eq(schema.subjectResults.id, result.id)).returning();
    expect(finalized.status).toBe('FINALIZED');
  });

  it('keeps its historical ConfigurationVersion binding stable when a newer version appears', async () => {
    const ctx = await buildContext();
    const [result] = await db.insert(schema.subjectResults).values({
      schoolId: ctx.school.id,
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      academicPeriodId: ctx.period.id,
      classId: ctx.classRow.id,
      subjectId: ctx.subject.id,
      gradingConfigurationVersionId: ctx.gradingVersion.id,
      value: '14',
    }).returning();

    await createGradingConfigurationVersion(ctx.school.id, ctx.gradingConfig.id, 2);

    const [stored] = await db.select().from(schema.subjectResults).where(eq(schema.subjectResults.id, result.id));
    expect(stored.gradingConfigurationVersionId).toBe(ctx.gradingVersion.id);
  });
});

describe('period_results (Task 006C §35)', () => {
  it('accepts a valid Student + Class + AcademicYear + AcademicPeriod', async () => {
    const ctx = await buildContext();

    const [result] = await db.insert(schema.periodResults).values({
      schoolId: ctx.school.id,
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      academicPeriodId: ctx.period.id,
      classId: ctx.classRow.id,
      gradingConfigurationVersionId: ctx.gradingVersion.id,
      value: '13.25',
    }).returning();

    expect(Number(result.value)).toBe(13.25);
    expect(result.status).toBe('CALCULATED');
  });

  it('rejects a cross-school Student', async () => {
    const ctx = await buildContext();
    const other = await buildOtherContext();

    await expect(
      db.insert(schema.periodResults).values({
        schoolId: ctx.school.id,
        studentId: other.student.id,
        academicYearId: ctx.year.id,
        academicPeriodId: ctx.period.id,
        classId: ctx.classRow.id,
        gradingConfigurationVersionId: ctx.gradingVersion.id,
        value: '13',
      }),
    ).rejects.toThrow();
  });

  it('rejects a cross-school Class', async () => {
    const ctx = await buildContext();
    const other = await buildOtherContext();

    await expect(
      db.insert(schema.periodResults).values({
        schoolId: ctx.school.id,
        studentId: ctx.student.id,
        academicYearId: ctx.year.id,
        academicPeriodId: ctx.period.id,
        classId: other.classRow.id,
        gradingConfigurationVersionId: ctx.gradingVersion.id,
        value: '13',
      }),
    ).rejects.toThrow();
  });

  it('rejects a cross-school AcademicPeriod', async () => {
    const ctx = await buildContext();
    const other = await buildOtherContext();

    await expect(
      db.insert(schema.periodResults).values({
        schoolId: ctx.school.id,
        studentId: ctx.student.id,
        academicYearId: ctx.year.id,
        academicPeriodId: other.period.id,
        classId: ctx.classRow.id,
        gradingConfigurationVersionId: ctx.gradingVersion.id,
        value: '13',
      }),
    ).rejects.toThrow();
  });

  it('rejects an AcademicPeriod from a different AcademicYear', async () => {
    const ctx = await buildContext();
    const yearB = await createAcademicYear(ctx.school.id, '2026/2027', '2026-09-01', '2027-07-01');
    const periodOfYearB = await createAcademicPeriod(ctx.school.id, yearB.id, 'Term 1', 1, '2026-09-15', '2026-12-20');

    await expect(
      db.insert(schema.periodResults).values({
        schoolId: ctx.school.id,
        studentId: ctx.student.id,
        academicYearId: ctx.year.id,
        academicPeriodId: periodOfYearB.id,
        classId: ctx.classRow.id,
        gradingConfigurationVersionId: ctx.gradingVersion.id,
        value: '13',
      }),
    ).rejects.toThrow();
  });

  it('rejects a Class from a different AcademicYear', async () => {
    const ctx = await buildContext();
    const yearB = await createAcademicYear(ctx.school.id, '2026/2027', '2026-09-01', '2027-07-01');
    const classOfYearB = await createClass(ctx.school.id, yearB.id, ctx.level.id, ctx.curriculumVersion.id, 'Class B');

    await expect(
      db.insert(schema.periodResults).values({
        schoolId: ctx.school.id,
        studentId: ctx.student.id,
        academicYearId: ctx.year.id,
        academicPeriodId: ctx.period.id,
        classId: classOfYearB.id,
        gradingConfigurationVersionId: ctx.gradingVersion.id,
        value: '13',
      }),
    ).rejects.toThrow();
  });

  it('rejects a ConfigurationVersion from a different School', async () => {
    const ctx = await buildContext();
    const other = await buildOtherContext();

    await expect(
      db.insert(schema.periodResults).values({
        schoolId: ctx.school.id,
        studentId: ctx.student.id,
        academicYearId: ctx.year.id,
        academicPeriodId: ctx.period.id,
        classId: ctx.classRow.id,
        gradingConfigurationVersionId: other.gradingVersion.id,
        value: '13',
      }),
    ).rejects.toThrow();
  });

  it('rejects a duplicate logical PeriodResult', async () => {
    const ctx = await buildContext();
    const values = {
      schoolId: ctx.school.id,
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      academicPeriodId: ctx.period.id,
      classId: ctx.classRow.id,
      gradingConfigurationVersionId: ctx.gradingVersion.id,
      value: '13',
    };
    await db.insert(schema.periodResults).values(values);

    await expect(
      db.insert(schema.periodResults).values({ ...values, value: '15' }),
    ).rejects.toThrow();
  });

  it('is independent of SubjectResult row identity', async () => {
    const ctx = await buildContext();

    await db.insert(schema.subjectResults).values({
      schoolId: ctx.school.id,
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      academicPeriodId: ctx.period.id,
      classId: ctx.classRow.id,
      subjectId: ctx.subject.id,
      gradingConfigurationVersionId: ctx.gradingVersion.id,
      value: '14',
    });

    const [periodResult] = await db.insert(schema.periodResults).values({
      schoolId: ctx.school.id,
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      academicPeriodId: ctx.period.id,
      classId: ctx.classRow.id,
      gradingConfigurationVersionId: ctx.gradingVersion.id,
      value: '13.5',
    }).returning();

    // No subject_result_id column exists on period_results — the aggregation
    // relationship is a future Application-layer concern, not a row pointer.
    expect(periodResult.id).toBeDefined();
    expect('subjectResultId' in periodResult).toBe(false);
  });

  it('supports the CALCULATED → FINALIZED lifecycle', async () => {
    const ctx = await buildContext();
    const [result] = await db.insert(schema.periodResults).values({
      schoolId: ctx.school.id,
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      academicPeriodId: ctx.period.id,
      classId: ctx.classRow.id,
      gradingConfigurationVersionId: ctx.gradingVersion.id,
      value: '13',
    }).returning();

    const [finalized] = await db.update(schema.periodResults).set({ status: 'FINALIZED' }).where(eq(schema.periodResults.id, result.id)).returning();
    expect(finalized.status).toBe('FINALIZED');
  });
});

describe('annual_results (Task 006C §36)', () => {
  it('accepts a valid Student + School + AcademicYear + Class context', async () => {
    const ctx = await buildContext();

    const [result] = await db.insert(schema.annualResults).values({
      schoolId: ctx.school.id,
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      classId: ctx.classRow.id,
      gradingConfigurationVersionId: ctx.gradingVersion.id,
      value: '15.75',
    }).returning();

    expect(Number(result.value)).toBe(15.75);
    expect(result.status).toBe('CALCULATED');
  });

  it('rejects a cross-school Student', async () => {
    const ctx = await buildContext();
    const other = await buildOtherContext();

    await expect(
      db.insert(schema.annualResults).values({
        schoolId: ctx.school.id,
        studentId: other.student.id,
        academicYearId: ctx.year.id,
        classId: ctx.classRow.id,
        gradingConfigurationVersionId: ctx.gradingVersion.id,
        value: '15',
      }),
    ).rejects.toThrow();
  });

  it('rejects a cross-school Class', async () => {
    const ctx = await buildContext();
    const other = await buildOtherContext();

    await expect(
      db.insert(schema.annualResults).values({
        schoolId: ctx.school.id,
        studentId: ctx.student.id,
        academicYearId: ctx.year.id,
        classId: other.classRow.id,
        gradingConfigurationVersionId: ctx.gradingVersion.id,
        value: '15',
      }),
    ).rejects.toThrow();
  });

  it('rejects a cross-school AcademicYear', async () => {
    const ctx = await buildContext();
    const other = await buildOtherContext();

    await expect(
      db.insert(schema.annualResults).values({
        schoolId: ctx.school.id,
        studentId: ctx.student.id,
        academicYearId: other.year.id,
        classId: ctx.classRow.id,
        gradingConfigurationVersionId: ctx.gradingVersion.id,
        value: '15',
      }),
    ).rejects.toThrow();
  });

  it('rejects a Class from a different AcademicYear', async () => {
    const ctx = await buildContext();
    const yearB = await createAcademicYear(ctx.school.id, '2026/2027', '2026-09-01', '2027-07-01');
    const classOfYearB = await createClass(ctx.school.id, yearB.id, ctx.level.id, ctx.curriculumVersion.id, 'Class B');

    await expect(
      db.insert(schema.annualResults).values({
        schoolId: ctx.school.id,
        studentId: ctx.student.id,
        academicYearId: ctx.year.id,
        classId: classOfYearB.id,
        gradingConfigurationVersionId: ctx.gradingVersion.id,
        value: '15',
      }),
    ).rejects.toThrow();
  });

  it('rejects a duplicate logical AnnualResult', async () => {
    const ctx = await buildContext();
    const values = {
      schoolId: ctx.school.id,
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      classId: ctx.classRow.id,
      gradingConfigurationVersionId: ctx.gradingVersion.id,
      value: '15',
    };
    await db.insert(schema.annualResults).values(values);

    await expect(
      db.insert(schema.annualResults).values({ ...values, value: '17' }),
    ).rejects.toThrow();
  });

  it('does not require an AcademicPeriod', async () => {
    const ctx = await buildContext();

    const [result] = await db.insert(schema.annualResults).values({
      schoolId: ctx.school.id,
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      classId: ctx.classRow.id,
      gradingConfigurationVersionId: ctx.gradingVersion.id,
      value: '15',
    }).returning();

    expect(result.id).toBeDefined();
    expect('academicPeriodId' in result).toBe(false);
  });

  it('is a separate entity from PeriodResult', async () => {
    const ctx = await buildContext();

    await db.insert(schema.periodResults).values({
      schoolId: ctx.school.id,
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      academicPeriodId: ctx.period.id,
      classId: ctx.classRow.id,
      gradingConfigurationVersionId: ctx.gradingVersion.id,
      value: '13',
    });

    const [annual] = await db.insert(schema.annualResults).values({
      schoolId: ctx.school.id,
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      classId: ctx.classRow.id,
      gradingConfigurationVersionId: ctx.gradingVersion.id,
      value: '15',
    }).returning();

    expect(annual.id).toBeDefined();
    expect('periodResultId' in annual).toBe(false);
  });

  it('supports the CALCULATED → FINALIZED lifecycle', async () => {
    const ctx = await buildContext();
    const [result] = await db.insert(schema.annualResults).values({
      schoolId: ctx.school.id,
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      classId: ctx.classRow.id,
      gradingConfigurationVersionId: ctx.gradingVersion.id,
      value: '15',
    }).returning();

    const [finalized] = await db.update(schema.annualResults).set({ status: 'FINALIZED' }).where(eq(schema.annualResults.id, result.id)).returning();
    expect(finalized.status).toBe('FINALIZED');
  });

  it('keeps its historical ConfigurationVersion binding stable when a newer version appears', async () => {
    const ctx = await buildContext();
    const [result] = await db.insert(schema.annualResults).values({
      schoolId: ctx.school.id,
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      classId: ctx.classRow.id,
      gradingConfigurationVersionId: ctx.gradingVersion.id,
      value: '15',
    }).returning();

    await createGradingConfigurationVersion(ctx.school.id, ctx.gradingConfig.id, 2);

    const [stored] = await db.select().from(schema.annualResults).where(eq(schema.annualResults.id, result.id));
    expect(stored.gradingConfigurationVersionId).toBe(ctx.gradingVersion.id);
  });
});

describe('period vs annual separation (Task 006C §37)', () => {
  it('keeps PeriodResult and AnnualResult as distinct logical records', async () => {
    const ctx = await buildContext();

    const [period] = await db.insert(schema.periodResults).values({
      schoolId: ctx.school.id,
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      academicPeriodId: ctx.period.id,
      classId: ctx.classRow.id,
      gradingConfigurationVersionId: ctx.gradingVersion.id,
      value: '13',
    }).returning();

    const [annual] = await db.insert(schema.annualResults).values({
      schoolId: ctx.school.id,
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      classId: ctx.classRow.id,
      gradingConfigurationVersionId: ctx.gradingVersion.id,
      value: '15',
    }).returning();

    const periodRows = await db.select().from(schema.periodResults).where(eq(schema.periodResults.id, period.id));
    const annualRows = await db.select().from(schema.annualResults).where(eq(schema.annualResults.id, annual.id));

    expect(periodRows).toHaveLength(1);
    expect(annualRows).toHaveLength(1);
    expect(period.id).not.toBe(annual.id);
    expect(periodRows[0].academicPeriodId).toBe(ctx.period.id);
    expect(annualRows[0].academicPeriodId).toBeUndefined();
  });
});

describe('historical configuration binding (Task 006C §38, BR-GRADE-011)', () => {
  it('keeps V1 bound to all three result types after V2 is created', async () => {
    const ctx = await buildContext();

    const [subject] = await db.insert(schema.subjectResults).values({
      schoolId: ctx.school.id,
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      academicPeriodId: ctx.period.id,
      classId: ctx.classRow.id,
      subjectId: ctx.subject.id,
      gradingConfigurationVersionId: ctx.gradingVersion.id,
      value: '14',
    }).returning();

    const [period] = await db.insert(schema.periodResults).values({
      schoolId: ctx.school.id,
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      academicPeriodId: ctx.period.id,
      classId: ctx.classRow.id,
      gradingConfigurationVersionId: ctx.gradingVersion.id,
      value: '13',
    }).returning();

    const [annual] = await db.insert(schema.annualResults).values({
      schoolId: ctx.school.id,
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      classId: ctx.classRow.id,
      gradingConfigurationVersionId: ctx.gradingVersion.id,
      value: '15',
    }).returning();

    await createGradingConfigurationVersion(ctx.school.id, ctx.gradingConfig.id, 2);

    const [storedSubject] = await db.select().from(schema.subjectResults).where(eq(schema.subjectResults.id, subject.id));
    const [storedPeriod] = await db.select().from(schema.periodResults).where(eq(schema.periodResults.id, period.id));
    const [storedAnnual] = await db.select().from(schema.annualResults).where(eq(schema.annualResults.id, annual.id));

    expect(storedSubject.gradingConfigurationVersionId).toBe(ctx.gradingVersion.id);
    expect(storedPeriod.gradingConfigurationVersionId).toBe(ctx.gradingVersion.id);
    expect(storedAnnual.gradingConfigurationVersionId).toBe(ctx.gradingVersion.id);
  });
});

describe('result finalization (Task 006C §39)', () => {
  it('supports CALCULATED → FINALIZED and documents the Application-layer enforcement boundary', async () => {
    const ctx = await buildContext();

    const [result] = await db.insert(schema.subjectResults).values({
      schoolId: ctx.school.id,
      studentId: ctx.student.id,
      academicYearId: ctx.year.id,
      academicPeriodId: ctx.period.id,
      classId: ctx.classRow.id,
      subjectId: ctx.subject.id,
      gradingConfigurationVersionId: ctx.gradingVersion.id,
      value: '14',
    }).returning();

    expect(result.status).toBe('CALCULATED');

    const [finalized] = await db.update(schema.subjectResults).set({ status: 'FINALIZED' }).where(eq(schema.subjectResults.id, result.id)).returning();
    expect(finalized.status).toBe('FINALIZED');

    // Finalized records must not be silently overwritten. The schema models the
    // lifecycle; full mutation blocking is Application-layer responsibility
    // (SQL CHECK constraints cannot express it and triggers are prohibited —
    // Task 006C §21/§39).
    const [stored] = await db.select().from(schema.subjectResults).where(eq(schema.subjectResults.id, result.id));
    expect(stored.status).toBe('FINALIZED');
    expect(Number(stored.value)).toBe(14);
  });
});