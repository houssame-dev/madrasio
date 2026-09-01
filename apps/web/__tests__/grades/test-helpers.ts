/**
 * Hermetic PGlite test helpers for the Results module (Task 006D).
 *
 * Mirrors the `authorization/test-helpers` pattern: a fresh PGlite database
 * with the Supabase-compatible `auth` schema, all committed production
 * migrations applied, plus full domain seeding for grades result workflows.
 *
 * Every test gets an isolated database (no cross-test state).
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { authUsers } from 'drizzle-orm/supabase';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import * as schema from '@school/database';

import type { GradesDb } from '@/lib/modules/grades/infrastructure/repositories/result-repository';

export const migrationsFolder = path.resolve(process.cwd(), '../../database/drizzle/migrations');

export interface GradesTestDb {
  seed: ReturnType<typeof drizzle<typeof schema>>;
  db: GradesDb;
  client: PGlite;
}

export async function createGradesTestDb(): Promise<GradesTestDb> {
  const client = new PGlite();
  const seed = drizzle(client, { schema });

  await client.exec('CREATE SCHEMA IF NOT EXISTS auth');
  await client.exec(
    `CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY NOT NULL,
      email varchar(255),
      phone text UNIQUE,
      email_confirmed_at timestamp with time zone,
      phone_confirmed_at timestamp with time zone,
      last_sign_in_at timestamp with time zone,
      created_at timestamp with time zone,
      updated_at timestamp with time zone
    )`,
  );

  await migrate(seed, { migrationsFolder });

  return { seed, db: seed as unknown as GradesDb, client };
}

export interface SeededSchool {
  schoolId: string;
  yearId: string;
  period1Id: string;
  period2Id: string;
  classId: string;
  subjectMathId: string;
  subjectPhysicsId: string;
  curriculumVersionId: string;
  configVersionId: string;
}

/** Valid GradingRules payload (schemaVersion 1). */
export const DEFAULT_RULES = {
  schemaVersion: 1,
  periodCalculation: { mode: 'SIMPLE_AVERAGE' },
  annualCalculation: { mode: 'SIMPLE_AVERAGE' },
  assessmentWeighting: { mode: 'EQUAL' },
  coefficientUsage: { mode: 'IGNORE' },
  rounding: { mode: 'HALF_UP', scale: 2 },
  thresholds: { maxScore: 20, passingScore: 10 },
  requiredAssessments: { types: ['EXAM'] },
} as const;

export interface SeedSchoolOptions {
  rules?: unknown;
  yearStatus?: 'PLANNED' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
}

/**
 * Seeds one School with: an AcademicYear + two AcademicPeriods + one Class
 * (two Subjects with coefficients), a GradingConfigurationVersion, and an
 * enrollment helper. Returns the identifiers needed by the workflow.
 */
export async function seedSchool(
  seed: GradesTestDb['seed'],
  options: SeedSchoolOptions = {},
): Promise<SeededSchool> {
  const schoolId = randomUUID();
  await seed.insert(schema.schools).values({ id: schoolId, name: 'Seed School' });

  const yearId = randomUUID();
  await seed
    .insert(schema.academicYears)
    .values({
      id: yearId,
      schoolId,
      name: '2025/2026',
      startDate: '2025-09-01',
      endDate: '2026-07-01',
      status: options.yearStatus ?? 'ACTIVE',
    });

  const period1Id = randomUUID();
  await seed
    .insert(schema.academicPeriods)
    .values({ id: period1Id, schoolId, academicYearId: yearId, name: 'Term 1', sequence: 1, startDate: '2025-09-01', endDate: '2025-12-20' });
  const period2Id = randomUUID();
  await seed
    .insert(schema.academicPeriods)
    .values({ id: period2Id, schoolId, academicYearId: yearId, name: 'Term 2', sequence: 2, startDate: '2026-01-05', endDate: '2026-04-01' });

  const curriculumId = randomUUID();
  await seed.insert(schema.curricula).values({ id: curriculumId, schoolId, name: 'National' });
  const curriculumVersionId = randomUUID();
  await seed
    .insert(schema.curriculumVersions)
    .values({ id: curriculumVersionId, schoolId, curriculumId, name: '2025-2026', status: 'ACTIVE' });

  const stageId = randomUUID();
  await seed.insert(schema.stages).values({ id: stageId, schoolId, name: 'Primary', sequence: 1 });
  const levelId = randomUUID();
  await seed.insert(schema.levels).values({ id: levelId, schoolId, stageId, name: '5th', sequence: 1 });

  const subjectMathId = randomUUID();
  await seed.insert(schema.subjects).values({ id: subjectMathId, schoolId, name: 'Mathematics' });
  const subjectPhysicsId = randomUUID();
  await seed.insert(schema.subjects).values({ id: subjectPhysicsId, schoolId, name: 'Physics' });

  await seed
    .insert(schema.curriculumSubjects)
    .values([
      { schoolId, curriculumVersionId, subjectId: subjectMathId, coefficient: '7' },
      { schoolId, curriculumVersionId, subjectId: subjectPhysicsId, coefficient: '3' },
    ]);

  const classId = randomUUID();
  await seed
    .insert(schema.classes)
    .values({ id: classId, schoolId, academicYearId: yearId, levelId, curriculumVersionId, name: '5A' });

  const configId = randomUUID();
  await seed.insert(schema.gradingConfigurations).values({ id: configId, schoolId, name: 'Default' });
  const configVersionId = randomUUID();
  await seed
    .insert(schema.gradingConfigurationVersions)
    .values({
      id: configVersionId,
      schoolId,
      gradingConfigurationId: configId,
      versionNumber: 1,
      status: 'ACTIVE',
      rules: (options.rules ?? DEFAULT_RULES) as unknown as typeof schema.gradingConfigurationVersions.$inferSelect['rules'],
    });

  return {
    schoolId,
    yearId,
    period1Id,
    period2Id,
    classId,
    subjectMathId,
    subjectPhysicsId,
    curriculumVersionId,
    configVersionId,
  };
}

export interface SeededGradebook {
  gradebookId: string;
  assessmentQuizId: string;
  assessmentExamId: string;
}

/** Seeds a Gradebook (OPEN) bound to the shared config version, with QUIZ + EXAM assessments. */
export async function seedGradebook(
  seed: GradesTestDb['seed'],
  schoolId: string,
  ctx: Pick<SeededSchool, 'yearId' | 'period1Id' | 'classId' | 'configVersionId'>,
  subjectId: string,
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED' = 'OPEN',
): Promise<SeededGradebook> {
  const gradebookId = randomUUID();
  await seed
    .insert(schema.gradebooks)
    .values({
      id: gradebookId,
      schoolId,
      academicYearId: ctx.yearId,
      academicPeriodId: ctx.period1Id,
      classId: ctx.classId,
      subjectId,
      gradingConfigurationVersionId: ctx.configVersionId,
      status,
    });

  const assessmentQuizId = randomUUID();
  await seed
    .insert(schema.assessments)
    .values({ id: assessmentQuizId, schoolId, gradebookId, title: 'Quiz 1', assessmentType: 'QUIZ', maximumScore: '20', weight: '1', status: 'PUBLISHED' });
  const assessmentExamId = randomUUID();
  await seed
    .insert(schema.assessments)
    .values({ id: assessmentExamId, schoolId, gradebookId, title: 'Exam 1', assessmentType: 'EXAM', maximumScore: '20', weight: '1', status: 'PUBLISHED' });

  return { gradebookId, assessmentQuizId, assessmentExamId };
}

export interface SeededStudent {
  studentId: string;
  userId: string;
  teacherId: string;
  schoolAdminUserId: string;
  teacherUserId: string;
}

/** Seeds a Student enrolled in the class, plus School Admin and Teacher users with memberships. */
export async function seedStudentAndActors(
  seed: GradesTestDb['seed'],
  schoolId: string,
  yearId: string,
  classId: string,
): Promise<SeededStudent> {
  const studentId = randomUUID();
  await seed.insert(schema.students).values({ id: studentId, schoolId, firstName: 'Amine', lastName: 'Benali' });
  await seed
    .insert(schema.studentEnrollments)
    .values({ schoolId, studentId, academicYearId: yearId, classId, effectiveFrom: '2025-09-01', status: 'ACTIVE' });

  const schoolAdminUserId = randomUUID();
  const schoolAdminEmail = `${schoolAdminUserId}@test.example`;
  await seed.insert(authUsers).values({ id: schoolAdminUserId, email: schoolAdminEmail });
  await seed.insert(schema.users).values({ id: schoolAdminUserId, email: schoolAdminEmail });
  await seed
    .insert(schema.schoolMemberships)
    .values({ schoolId, userId: schoolAdminUserId, role: 'SCHOOL_ADMIN', status: 'ACTIVE' });

  const teacherUserId = randomUUID();
  const teacherEmail = `${teacherUserId}@test.example`;
  await seed.insert(authUsers).values({ id: teacherUserId, email: teacherEmail });
  await seed.insert(schema.users).values({ id: teacherUserId, email: teacherEmail });
  await seed
    .insert(schema.schoolMemberships)
    .values({ schoolId, userId: teacherUserId, role: 'TEACHER', status: 'ACTIVE' });

  const teacherId = randomUUID();
  await seed
    .insert(schema.teachers)
    .values({ id: teacherId, schoolId, userId: teacherUserId, firstName: 'Karim', lastName: 'Alaoui' });

  return { studentId, userId: studentId, teacherId, schoolAdminUserId, teacherUserId };
}

/** Seeds a PARENT user with an ACTIVE SchoolMembership (no ParentStudent link). */
export async function seedParentActor(
  seed: GradesTestDb['seed'],
  schoolId: string,
): Promise<{ parentUserId: string }> {
  const parentUserId = randomUUID();
  const parentEmail = `${parentUserId}@test.example`;
  await seed.insert(authUsers).values({ id: parentUserId, email: parentEmail });
  await seed.insert(schema.users).values({ id: parentUserId, email: parentEmail });
  await seed
    .insert(schema.schoolMemberships)
    .values({ schoolId, userId: parentUserId, role: 'PARENT', status: 'ACTIVE' });
  return { parentUserId };
}

/** Seeds a TeacherAssignment (ACTIVE) for the teacher over Math in the class. */
export async function seedTeacherAssignment(
  seed: GradesTestDb['seed'],
  schoolId: string,
  teacherId: string,
  classId: string,
  subjectId: string,
  yearId: string,
): Promise<void> {
  await seed
    .insert(schema.teacherAssignments)
    .values({ schoolId, teacherId, classId, subjectId, academicYearId: yearId, effectiveFrom: '2025-09-01', status: 'ACTIVE' });
}

export interface SeededGrades {
  quizGradeId: string;
  examGradeId: string;
}

/** Records Grades for a student on a gradebook's two assessments. */
export async function seedGrades(
  seed: GradesTestDb['seed'],
  schoolId: string,
  gradebookId: string,
  ctx: Pick<SeededGradebook, 'assessmentQuizId' | 'assessmentExamId'>,
  studentId: string,
  quizScore: string,
  examScore: string,
): Promise<SeededGrades> {
  const quizGradeId = randomUUID();
  await seed
    .insert(schema.grades)
    .values({ id: quizGradeId, schoolId, gradebookId, assessmentId: ctx.assessmentQuizId, studentId, score: quizScore, state: 'VALID' });
  const examGradeId = randomUUID();
  await seed
    .insert(schema.grades)
    .values({ id: examGradeId, schoolId, gradebookId, assessmentId: ctx.assessmentExamId, studentId, score: examScore, state: 'VALID' });
  return { quizGradeId, examGradeId };
}
