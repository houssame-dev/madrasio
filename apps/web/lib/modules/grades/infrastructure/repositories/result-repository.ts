/**
 * Result persistence — repository for the Results module (Task 006D).
 *
 * This is the ONLY place Drizzle specifics touch the Results domain. Use
 * Cases consume plain records; the engine never sees the database (ADR-004,
 * CLAUDE.md §24).
 *
 * The `GradesDb` surface mirrors `AuthorizationDb`: both the node-postgres
 * client (`lib/db/client.ts`) and the PGlite test client satisfy it, keeping
 * every function driver-agnostic and testable against the committed
 * migrations.
 *
 * Query/upsert helpers keep School tenant integrity: every lookup is filtered
 * by `schoolId`, so a valid UUID from another School can never resolve.
 * Composite foreign keys in the schema provide the final database-level
 * guarantee (CLAUDE.md §13/§19).
 */

import { and, desc, eq, inArray } from 'drizzle-orm';
import * as schema from '@school/database';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

import type {
  AssessmentRecord,
  GradeRecord,
  ResultStatus,
  ResultType,
} from '../../domain';
import type { ResultRecipientCandidate } from '../../domain/result-recipients';

/** The minimal typed Drizzle surface the repository needs (driver-agnostic). */
export type GradesDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface GradebookContextRow {
  gradebookId: string;
  academicYearId: string;
  academicPeriodId: string;
  classId: string;
  subjectId: string;
  gradingConfigurationVersionId: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED';
  /** The Class's CurriculumVersion, needed to resolve CurriculumSubject coefficients. */
  curriculumVersionId: string | null;
}

export interface SubjectResultRow {
  id: string;
  schoolId: string;
  studentId: string;
  academicYearId: string;
  academicPeriodId: string;
  classId: string;
  subjectId: string;
  gradingConfigurationVersionId: string;
  value: string;
  status: ResultStatus;
}

export interface PeriodResultRow {
  id: string;
  schoolId: string;
  studentId: string;
  academicYearId: string;
  academicPeriodId: string;
  classId: string;
  gradingConfigurationVersionId: string;
  value: string;
  status: ResultStatus;
}

export interface AnnualResultRow {
  id: string;
  schoolId: string;
  studentId: string;
  academicYearId: string;
  classId: string;
  gradingConfigurationVersionId: string;
  value: string;
  status: ResultStatus;
}

/** Generic view over the three Result tables (Task 006D uses all three). */
export interface ResultRow {
  id: string;
  schoolId: string;
  studentId: string;
  academicYearId: string;
  academicPeriodId: string | null;
  classId: string;
  subjectId: string | null;
  gradingConfigurationVersionId: string;
  value: string;
  status: ResultStatus;
}

export interface SubjectResultUpsert {
  studentId: string;
  academicYearId: string;
  academicPeriodId: string;
  classId: string;
  subjectId: string;
  gradingConfigurationVersionId: string;
  value: string;
  status: ResultStatus;
}

export interface PeriodResultUpsert {
  studentId: string;
  academicYearId: string;
  academicPeriodId: string;
  classId: string;
  gradingConfigurationVersionId: string;
  value: string;
  status: ResultStatus;
}

export interface AnnualResultUpsert {
  studentId: string;
  academicYearId: string;
  classId: string;
  gradingConfigurationVersionId: string;
  value: string;
  status: ResultStatus;
}

/** The publication snapshot row the Application layer reads/writes. */
export interface PublicationRow {
  id: string;
  schoolId: string;
  resultType: ResultType;
  subjectResultId: string | null;
  periodResultId: string | null;
  annualResultId: string | null;
  studentId: string;
  academicYearId: string;
  academicPeriodId: string | null;
  classId: string;
  resultValue: string;
  gradingConfigurationVersionId: string;
  publicationVersion: number;
  publishedBy: string;
  publishedAt: string;
  idempotencyKey: string;
}

export async function findGradebookContext(
  db: GradesDb,
  schoolId: string,
  gradebookId: string,
): Promise<GradebookContextRow | null> {
  const [row] = await db
    .select({
      gradebookId: schema.gradebooks.id,
      academicYearId: schema.gradebooks.academicYearId,
      academicPeriodId: schema.gradebooks.academicPeriodId,
      classId: schema.gradebooks.classId,
      subjectId: schema.gradebooks.subjectId,
      gradingConfigurationVersionId: schema.gradebooks.gradingConfigurationVersionId,
      status: schema.gradebooks.status,
      curriculumVersionId: schema.classes.curriculumVersionId,
    })
    .from(schema.gradebooks)
    .leftJoin(schema.classes, eq(schema.classes.id, schema.gradebooks.classId))
    .where(and(eq(schema.gradebooks.schoolId, schoolId), eq(schema.gradebooks.id, gradebookId)))
    .limit(1);

  return row ?? null;
}

export async function findGradebookByContext(
  db: GradesDb,
  schoolId: string,
  academicYearId: string,
  academicPeriodId: string,
  classId: string,
  subjectId: string,
): Promise<GradebookContextRow | null> {
  const [row] = await db
    .select({
      gradebookId: schema.gradebooks.id,
      academicYearId: schema.gradebooks.academicYearId,
      academicPeriodId: schema.gradebooks.academicPeriodId,
      classId: schema.gradebooks.classId,
      subjectId: schema.gradebooks.subjectId,
      gradingConfigurationVersionId: schema.gradebooks.gradingConfigurationVersionId,
      status: schema.gradebooks.status,
      curriculumVersionId: schema.classes.curriculumVersionId,
    })
    .from(schema.gradebooks)
    .leftJoin(schema.classes, eq(schema.classes.id, schema.gradebooks.classId))
    .where(
      and(
        eq(schema.gradebooks.schoolId, schoolId),
        eq(schema.gradebooks.academicYearId, academicYearId),
        eq(schema.gradebooks.academicPeriodId, academicPeriodId),
        eq(schema.gradebooks.classId, classId),
        eq(schema.gradebooks.subjectId, subjectId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function findAssessments(
  db: GradesDb,
  schoolId: string,
  gradebookId: string,
): Promise<AssessmentRecord[]> {
  const rows = await db
    .select({
      id: schema.assessments.id,
      assessmentType: schema.assessments.assessmentType,
      maximumScore: schema.assessments.maximumScore,
      weight: schema.assessments.weight,
    })
    .from(schema.assessments)
    .where(
      and(eq(schema.assessments.schoolId, schoolId), eq(schema.assessments.gradebookId, gradebookId)),
    );

  return rows.map((row) => ({
    id: row.id,
    assessmentType: row.assessmentType,
    maximumScore: row.maximumScore,
    weight: row.weight,
  }));
}

export async function findGrades(
  db: GradesDb,
  schoolId: string,
  gradebookId: string,
  assessmentIds: string[],
  studentId: string,
): Promise<GradeRecord[]> {
  if (assessmentIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({
      assessmentId: schema.grades.assessmentId,
      score: schema.grades.score,
      state: schema.grades.state,
    })
    .from(schema.grades)
    .where(
      and(
        eq(schema.grades.schoolId, schoolId),
        eq(schema.grades.gradebookId, gradebookId),
        eq(schema.grades.studentId, studentId),
        inArray(schema.grades.assessmentId, assessmentIds),
      ),
    );

  return rows.map((row) => ({
    assessmentId: row.assessmentId,
    score: row.score,
    state: row.state,
  }));
}

export async function findCurriculumCoefficient(
  db: GradesDb,
  schoolId: string,
  curriculumVersionId: string,
  subjectId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ coefficient: schema.curriculumSubjects.coefficient })
    .from(schema.curriculumSubjects)
    .where(
      and(
        eq(schema.curriculumSubjects.schoolId, schoolId),
        eq(schema.curriculumSubjects.curriculumVersionId, curriculumVersionId),
        eq(schema.curriculumSubjects.subjectId, subjectId),
      ),
    )
    .limit(1);

  return row?.coefficient ?? null;
}

export async function findClassCurriculumVersionId(
  db: GradesDb,
  schoolId: string,
  classId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ curriculumVersionId: schema.classes.curriculumVersionId })
    .from(schema.classes)
    .where(and(eq(schema.classes.schoolId, schoolId), eq(schema.classes.id, classId)))
    .limit(1);

  return row?.curriculumVersionId ?? null;
}

export async function findConfigurationRules(
  db: GradesDb,
  schoolId: string,
  gradingConfigurationVersionId: string,
): Promise<unknown | null> {
  const [row] = await db
    .select({ rules: schema.gradingConfigurationVersions.rules })
    .from(schema.gradingConfigurationVersions)
    .where(
      and(
        eq(schema.gradingConfigurationVersions.schoolId, schoolId),
        eq(schema.gradingConfigurationVersions.id, gradingConfigurationVersionId),
      ),
    )
    .limit(1);

  return row?.rules ?? null;
}

export async function findSubjectResultsForPeriod(
  db: GradesDb,
  schoolId: string,
  studentId: string,
  academicYearId: string,
  academicPeriodId: string,
  classId: string,
): Promise<SubjectResultRow[]> {
  return db
    .select()
    .from(schema.subjectResults)
    .where(
      and(
        eq(schema.subjectResults.schoolId, schoolId),
        eq(schema.subjectResults.studentId, studentId),
        eq(schema.subjectResults.academicYearId, academicYearId),
        eq(schema.subjectResults.academicPeriodId, academicPeriodId),
        eq(schema.subjectResults.classId, classId),
      ),
    );
}

export async function findPeriodResultsForAnnual(
  db: GradesDb,
  schoolId: string,
  studentId: string,
  academicYearId: string,
  classId: string,
): Promise<PeriodResultRow[]> {
  return db
    .select()
    .from(schema.periodResults)
    .where(
      and(
        eq(schema.periodResults.schoolId, schoolId),
        eq(schema.periodResults.studentId, studentId),
        eq(schema.periodResults.academicYearId, academicYearId),
        eq(schema.periodResults.classId, classId),
      ),
    );
}

export async function findStudentEnrollment(
  db: GradesDb,
  schoolId: string,
  studentId: string,
  academicYearId: string,
  classId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.studentEnrollments.id })
    .from(schema.studentEnrollments)
    .where(
      and(
        eq(schema.studentEnrollments.schoolId, schoolId),
        eq(schema.studentEnrollments.studentId, studentId),
        eq(schema.studentEnrollments.academicYearId, academicYearId),
        eq(schema.studentEnrollments.classId, classId),
      ),
    )
    .limit(1);

  return row !== undefined;
}

/**
 * Loads the Result notification recipient candidate facts for one Student
 * (Task 012 §1/§3): the Parents of the Student in the SAME School with the
 * relationship + membership statuses needed by the pure resolver.
 *
 * The query is School-scoped (tenant isolation, CLAUDE.md §13) and the join on
 * `parents.user_id` naturally excludes Parents with no authenticated User (a
 * NULL `user_id` can never match a membership row). The pure resolver
 * (`domain/result-recipients`) applies the approved eligibility policy
 * (ACTIVE ParentStudent + non-null user_id + ACTIVE SchoolMembership),
 * deduplicates and orders the result.
 */
export async function findResultNotificationRecipientCandidates(
  db: GradesDb,
  schoolId: string,
  studentId: string,
): Promise<ResultRecipientCandidate[]> {
  const rows = await db
    .select({
      userId: schema.parents.userId,
      parentStudentStatus: schema.parentStudents.status,
      membershipStatus: schema.schoolMemberships.status,
    })
    .from(schema.parents)
    .innerJoin(
      schema.parentStudents,
      and(
        eq(schema.parentStudents.parentId, schema.parents.id),
        eq(schema.parentStudents.studentId, studentId),
        eq(schema.parentStudents.schoolId, schoolId),
      ),
    )
    .innerJoin(
      schema.schoolMemberships,
      and(
        eq(schema.schoolMemberships.userId, schema.parents.userId),
        eq(schema.schoolMemberships.schoolId, schoolId),
      ),
    )
    .where(eq(schema.parents.schoolId, schoolId));

  return rows.map((row) => ({
    userId: row.userId,
    parentStudentStatus: row.parentStudentStatus,
    membershipStatus: row.membershipStatus,
  }));
}

export async function findSubjectResultByContext(
  db: GradesDb,
  schoolId: string,
  studentId: string,
  academicYearId: string,
  academicPeriodId: string,
  classId: string,
  subjectId: string,
): Promise<SubjectResultRow | null> {
  const [row] = await db
    .select()
    .from(schema.subjectResults)
    .where(
      and(
        eq(schema.subjectResults.schoolId, schoolId),
        eq(schema.subjectResults.studentId, studentId),
        eq(schema.subjectResults.academicYearId, academicYearId),
        eq(schema.subjectResults.academicPeriodId, academicPeriodId),
        eq(schema.subjectResults.classId, classId),
        eq(schema.subjectResults.subjectId, subjectId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function findPeriodResultByContext(
  db: GradesDb,
  schoolId: string,
  studentId: string,
  academicYearId: string,
  academicPeriodId: string,
  classId: string,
): Promise<PeriodResultRow | null> {
  const [row] = await db
    .select()
    .from(schema.periodResults)
    .where(
      and(
        eq(schema.periodResults.schoolId, schoolId),
        eq(schema.periodResults.studentId, studentId),
        eq(schema.periodResults.academicYearId, academicYearId),
        eq(schema.periodResults.academicPeriodId, academicPeriodId),
        eq(schema.periodResults.classId, classId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function findAnnualResultByContext(
  db: GradesDb,
  schoolId: string,
  studentId: string,
  academicYearId: string,
  classId: string,
): Promise<AnnualResultRow | null> {
  const [row] = await db
    .select()
    .from(schema.annualResults)
    .where(
      and(
        eq(schema.annualResults.schoolId, schoolId),
        eq(schema.annualResults.studentId, studentId),
        eq(schema.annualResults.academicYearId, academicYearId),
        eq(schema.annualResults.classId, classId),
      ),
    )
    .limit(1);

  return row ?? null;
}

/**
 * Generic result-row loader over the three Result tables. Returns the
 * normalized `ResultRow` view. This is how finalize/publish/revise address a
 * result without knowing which concrete table backs it.
 */
export async function findResultRow(
  db: GradesDb,
  schoolId: string,
  resultType: ResultType,
  resultId: string,
): Promise<ResultRow | null> {
  if (resultType === 'SUBJECT') {
    const [row] = await db
      .select()
      .from(schema.subjectResults)
      .where(and(eq(schema.subjectResults.schoolId, schoolId), eq(schema.subjectResults.id, resultId)))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      schoolId: row.schoolId,
      studentId: row.studentId,
      academicYearId: row.academicYearId,
      academicPeriodId: row.academicPeriodId,
      classId: row.classId,
      subjectId: row.subjectId,
      gradingConfigurationVersionId: row.gradingConfigurationVersionId,
      value: row.value,
      status: row.status,
    };
  }
  if (resultType === 'PERIOD') {
    const [row] = await db
      .select()
      .from(schema.periodResults)
      .where(and(eq(schema.periodResults.schoolId, schoolId), eq(schema.periodResults.id, resultId)))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      schoolId: row.schoolId,
      studentId: row.studentId,
      academicYearId: row.academicYearId,
      academicPeriodId: row.academicPeriodId,
      classId: row.classId,
      subjectId: null,
      gradingConfigurationVersionId: row.gradingConfigurationVersionId,
      value: row.value,
      status: row.status,
    };
  }
  const [row] = await db
    .select()
    .from(schema.annualResults)
    .where(and(eq(schema.annualResults.schoolId, schoolId), eq(schema.annualResults.id, resultId)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    schoolId: row.schoolId,
    studentId: row.studentId,
    academicYearId: row.academicYearId,
    academicPeriodId: null,
    classId: row.classId,
    subjectId: null,
    gradingConfigurationVersionId: row.gradingConfigurationVersionId,
    value: row.value,
    status: row.status,
  };
}

export async function upsertSubjectResult(
  db: GradesDb,
  schoolId: string,
  input: SubjectResultUpsert,
): Promise<SubjectResultRow> {
  const [row] = await db
    .insert(schema.subjectResults)
    .values({
      schoolId,
      studentId: input.studentId,
      academicYearId: input.academicYearId,
      academicPeriodId: input.academicPeriodId,
      classId: input.classId,
      subjectId: input.subjectId,
      gradingConfigurationVersionId: input.gradingConfigurationVersionId,
      value: input.value,
      status: input.status,
    })
    .onConflictDoUpdate({
      target: [
        schema.subjectResults.schoolId,
        schema.subjectResults.academicYearId,
        schema.subjectResults.academicPeriodId,
        schema.subjectResults.classId,
        schema.subjectResults.studentId,
        schema.subjectResults.subjectId,
      ],
      set: {
        gradingConfigurationVersionId: input.gradingConfigurationVersionId,
        value: input.value,
        status: input.status,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row;
}

export async function upsertPeriodResult(
  db: GradesDb,
  schoolId: string,
  input: PeriodResultUpsert,
): Promise<PeriodResultRow> {
  const [row] = await db
    .insert(schema.periodResults)
    .values({
      schoolId,
      studentId: input.studentId,
      academicYearId: input.academicYearId,
      academicPeriodId: input.academicPeriodId,
      classId: input.classId,
      gradingConfigurationVersionId: input.gradingConfigurationVersionId,
      value: input.value,
      status: input.status,
    })
    .onConflictDoUpdate({
      target: [
        schema.periodResults.schoolId,
        schema.periodResults.academicYearId,
        schema.periodResults.academicPeriodId,
        schema.periodResults.classId,
        schema.periodResults.studentId,
      ],
      set: {
        gradingConfigurationVersionId: input.gradingConfigurationVersionId,
        value: input.value,
        status: input.status,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row;
}

export async function upsertAnnualResult(
  db: GradesDb,
  schoolId: string,
  input: AnnualResultUpsert,
): Promise<AnnualResultRow> {
  const [row] = await db
    .insert(schema.annualResults)
    .values({
      schoolId,
      studentId: input.studentId,
      academicYearId: input.academicYearId,
      classId: input.classId,
      gradingConfigurationVersionId: input.gradingConfigurationVersionId,
      value: input.value,
      status: input.status,
    })
    .onConflictDoUpdate({
      target: [
        schema.annualResults.schoolId,
        schema.annualResults.academicYearId,
        schema.annualResults.classId,
        schema.annualResults.studentId,
      ],
      set: {
        gradingConfigurationVersionId: input.gradingConfigurationVersionId,
        value: input.value,
        status: input.status,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row;
}

export async function setResultFinalized(
  db: GradesDb,
  schoolId: string,
  resultType: ResultType,
  resultId: string,
): Promise<boolean> {
  if (resultType === 'SUBJECT') {
    const [row] = await db
      .update(schema.subjectResults)
      .set({ status: 'FINALIZED', updatedAt: new Date() })
      .where(and(eq(schema.subjectResults.schoolId, schoolId), eq(schema.subjectResults.id, resultId)))
      .returning({ status: schema.subjectResults.status });
    return row !== undefined;
  }
  if (resultType === 'PERIOD') {
    const [row] = await db
      .update(schema.periodResults)
      .set({ status: 'FINALIZED', updatedAt: new Date() })
      .where(and(eq(schema.periodResults.schoolId, schoolId), eq(schema.periodResults.id, resultId)))
      .returning({ status: schema.periodResults.status });
    return row !== undefined;
  }
  const [row] = await db
    .update(schema.annualResults)
    .set({ status: 'FINALIZED', updatedAt: new Date() })
    .where(and(eq(schema.annualResults.schoolId, schoolId), eq(schema.annualResults.id, resultId)))
    .returning({ status: schema.annualResults.status });
  return row !== undefined;
}

export async function findLatestPublication(
  db: GradesDb,
  schoolId: string,
  resultType: ResultType,
  resultId: string,
): Promise<PublicationRow | null> {
  const resultColumn =
    resultType === 'SUBJECT'
      ? schema.resultPublications.subjectResultId
      : resultType === 'PERIOD'
        ? schema.resultPublications.periodResultId
        : schema.resultPublications.annualResultId;

  const [row] = await db
    .select()
    .from(schema.resultPublications)
    .where(and(eq(schema.resultPublications.schoolId, schoolId), eq(resultColumn, resultId)))
    .orderBy(desc(schema.resultPublications.publicationVersion))
    .limit(1);

  return row ? toPublicationRow(row) : null;
}

export async function findPublicationByIdempotencyKey(
  db: GradesDb,
  idempotencyKey: string,
): Promise<PublicationRow | null> {
  const [row] = await db
    .select()
    .from(schema.resultPublications)
    .where(eq(schema.resultPublications.idempotencyKey, idempotencyKey))
    .limit(1);

  return row ? toPublicationRow(row) : null;
}

export async function findPublication(
  db: GradesDb,
  publicationId: string,
): Promise<PublicationRow | null> {
  const [row] = await db
    .select()
    .from(schema.resultPublications)
    .where(eq(schema.resultPublications.id, publicationId))
    .limit(1);

  return row ? toPublicationRow(row) : null;
}

export interface PublicationInsert {
  schoolId: string;
  resultType: ResultType;
  subjectResultId: string | null;
  periodResultId: string | null;
  annualResultId: string | null;
  studentId: string;
  academicYearId: string;
  academicPeriodId: string | null;
  classId: string;
  resultValue: string;
  gradingConfigurationVersionId: string;
  publicationVersion: number;
  publishedBy: string;
  idempotencyKey: string;
}

export async function insertPublication(
  db: GradesDb,
  input: PublicationInsert,
): Promise<PublicationRow> {
  const [row] = await db
    .insert(schema.resultPublications)
    .values({
      schoolId: input.schoolId,
      resultType: input.resultType,
      subjectResultId: input.subjectResultId,
      periodResultId: input.periodResultId,
      annualResultId: input.annualResultId,
      studentId: input.studentId,
      academicYearId: input.academicYearId,
      academicPeriodId: input.academicPeriodId,
      classId: input.classId,
      resultValue: input.resultValue,
      gradingConfigurationVersionId: input.gradingConfigurationVersionId,
      publicationVersion: input.publicationVersion,
      publishedBy: input.publishedBy,
      idempotencyKey: input.idempotencyKey,
    })
    .returning();

  return toPublicationRow(row);
}

function toPublicationRow(row: typeof schema.resultPublications.$inferSelect): PublicationRow {
  return {
    id: row.id,
    schoolId: row.schoolId,
    resultType: row.resultType,
    subjectResultId: row.subjectResultId,
    periodResultId: row.periodResultId,
    annualResultId: row.annualResultId,
    studentId: row.studentId,
    academicYearId: row.academicYearId,
    academicPeriodId: row.academicPeriodId,
    classId: row.classId,
    resultValue: row.resultValue,
    gradingConfigurationVersionId: row.gradingConfigurationVersionId,
    publicationVersion: row.publicationVersion,
    publishedBy: row.publishedBy,
    publishedAt: row.publishedAt.toISOString(),
    idempotencyKey: row.idempotencyKey,
  };
}