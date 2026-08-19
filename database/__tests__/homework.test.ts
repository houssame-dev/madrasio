import { and, eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../drizzle/schema';
import { createTestDb, type Db } from './helpers';

/**
 * Homework foundation — database integration tests (Task 008 §30).
 *
 * These tests verify the SCHEMA invariants only:
 * - basic Homework / HomeworkTarget / HomeworkSubmission creation
 * - tenant isolation (cross-school Teacher / Subject / AcademicYear /
 *   AcademicPeriod / Class / Student rejected)
 * - AcademicPeriod ↔ AcademicYear context integrity on Homework
 * - Homework / Submission / Target lifecycles
 * - duplicate target / submission prevention
 * - historical integrity (transfer / closed Homework / inactive Teacher never
 *   destroy Homework data)
 * - RESTRICT delete behavior
 *
 * Application-layer invariants (TeacherAssignment scope, target-Class
 * eligibility, on-time/late determination, closed rejects new submissions) are
 * Task 008 §31 and are NOT tested here.
 */
let db: Db;

async function createSchool(name: string) {
  const [school] = await db.insert(schema.schools).values({ name }).returning();
  return school;
}

async function createAcademicYear(
  schoolId: string,
  name: string,
  startDate = '2025-09-01',
  endDate = '2026-07-01',
) {
  const [row] = await db
    .insert(schema.academicYears)
    .values({ schoolId, name, startDate, endDate })
    .returning();
  return row;
}

async function createAcademicPeriod(
  schoolId: string,
  academicYearId: string,
  name: string,
  sequence = 1,
  startDate = '2025-09-01',
  endDate = '2025-12-20',
) {
  const [row] = await db
    .insert(schema.academicPeriods)
    .values({ schoolId, academicYearId, name, sequence, startDate, endDate })
    .returning();
  return row;
}

async function createStage(schoolId: string, name: string, sequence = 1) {
  const [row] = await db.insert(schema.stages).values({ schoolId, name, sequence }).returning();
  return row;
}

async function createLevel(schoolId: string, stageId: string, name: string, sequence = 1) {
  const [row] = await db
    .insert(schema.levels)
    .values({ schoolId, stageId, name, sequence })
    .returning();
  return row;
}

async function createCurriculum(schoolId: string, name: string) {
  const [row] = await db.insert(schema.curricula).values({ schoolId, name }).returning();
  return row;
}

async function createCurriculumVersion(schoolId: string, curriculumId: string, name: string) {
  const [row] = await db
    .insert(schema.curriculumVersions)
    .values({ schoolId, curriculumId, name })
    .returning();
  return row;
}

async function createClass(
  schoolId: string,
  academicYearId: string,
  levelId: string,
  curriculumVersionId: string,
  name: string,
) {
  const [row] = await db
    .insert(schema.classes)
    .values({ schoolId, academicYearId, levelId, curriculumVersionId, name })
    .returning();
  return row;
}

/** Creates the academic scaffolding (year + period + curriculum/version + stage/level + class). */
async function academicContext(schoolId: string, yearName = '2025/2026', className = 'Class A') {
  const year = await createAcademicYear(schoolId, yearName);
  const period = await createAcademicPeriod(schoolId, year.id, 'Term 1');
  const curriculum = await createCurriculum(schoolId, 'National Curriculum');
  const version = await createCurriculumVersion(schoolId, curriculum.id, '2025-2026');
  const stage = await createStage(schoolId, 'Primary');
  const level = await createLevel(schoolId, stage.id, '1st Year');
  const klass = await createClass(schoolId, year.id, level.id, version.id, className);
  return { year, period, version, level, klass };
}

/** Creates an ADDITIONAL Class inside an already-existing academic context. */
async function addClass(schoolId: string, year: { id: string }, levelId: string, curriculumVersionId: string, name: string) {
  return createClass(schoolId, year.id, levelId, curriculumVersionId, name);
}

async function createStudent(schoolId: string, firstName = 'Amine', lastName = 'Benali') {
  const [row] = await db
    .insert(schema.students)
    .values({ schoolId, firstName, lastName })
    .returning();
  return row;
}

async function createTeacher(schoolId: string, firstName = 'Karim', lastName = 'Alaoui') {
  const [row] = await db
    .insert(schema.teachers)
    .values({ schoolId, firstName, lastName })
    .returning();
  return row;
}

async function createSubject(schoolId: string, name: string) {
  const [row] = await db.insert(schema.subjects).values({ schoolId, name }).returning();
  return row;
}

async function createEnrollment(
  schoolId: string,
  studentId: string,
  academicYearId: string,
  classId: string,
  status: 'ACTIVE' | 'ENDED' = 'ACTIVE',
  effectiveFrom = '2025-09-01',
  effectiveUntil?: string,
) {
  const [row] = await db
    .insert(schema.studentEnrollments)
    .values({ schoolId, studentId, academicYearId, classId, status, effectiveFrom, effectiveUntil })
    .returning();
  return row;
}

async function createAssignment(
  schoolId: string,
  teacherId: string,
  classId: string,
  subjectId: string,
  academicYearId: string,
) {
  const [row] = await db
    .insert(schema.teacherAssignments)
    .values({ schoolId, teacherId, classId, subjectId, academicYearId, effectiveFrom: '2025-09-01', status: 'ACTIVE' })
    .returning();
  return row;
}

async function createHomework(
  schoolId: string,
  teacherId: string,
  subjectId: string,
  academicYearId: string,
  academicPeriodId: string,
  title = 'Fractions Exercise',
  dueDate = '2026-10-15',
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'ARCHIVED' = 'DRAFT',
  description?: string,
) {
  const [row] = await db
    .insert(schema.homework)
    .values({ schoolId, teacherId, subjectId, academicYearId, academicPeriodId, title, dueDate, status, description })
    .returning();
  return row;
}

async function createTarget(schoolId: string, homeworkId: string, academicYearId: string, classId: string) {
  const [row] = await db
    .insert(schema.homeworkTargets)
    .values({ schoolId, homeworkId, academicYearId, classId })
    .returning();
  return row;
}

async function createSubmission(
  schoolId: string,
  homeworkId: string,
  studentId: string,
  status: 'SUBMITTED' | 'LATE' | 'REVIEWED' | 'RETURNED' = 'SUBMITTED',
  content?: string,
) {
  const [row] = await db
    .insert(schema.homeworkSubmissions)
    .values({ schoolId, homeworkId, studentId, status, content })
    .returning();
  return row;
}

beforeEach(async () => {
  ({ db } = await createTestDb());
});

describe('homework — basic record (Task 008 §30.1–§30.9)', () => {
  it('creates a valid Homework', async () => {
    const school = await createSchool('School A');
    const { year, period } = await academicContext(school.id);
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');

    const item = await createHomework(school.id, teacher.id, subject.id, year.id, period.id);

    expect(item.id).toBeDefined();
    expect(item.schoolId).toBe(school.id);
    expect(item.teacherId).toBe(teacher.id);
    expect(item.subjectId).toBe(subject.id);
    expect(item.academicYearId).toBe(year.id);
    expect(item.academicPeriodId).toBe(period.id);
    expect(item.title).toBe('Fractions Exercise');
    expect(item.status).toBe('DRAFT');
    expect(item.dueDate).toBe('2026-10-15');
    expect(item.description).toBeNull();
    expect(item.createdAt).toBeInstanceOf(Date);
  });

  it('stores the due date as a calendar DATE', async () => {
    const school = await createSchool('School A');
    const { year, period } = await academicContext(school.id);
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');

    const item = await createHomework(school.id, teacher.id, subject.id, year.id, period.id);

    expect(item.dueDate).toBe('2026-10-15');
    const [row] = await db.select().from(schema.homework).where(eq(schema.homework.id, item.id));
    expect(row.dueDate).toBe('2026-10-15');
  });

  it('stores an optional description and title', async () => {
    const school = await createSchool('School A');
    const { year, period } = await academicContext(school.id);
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');

    const item = await createHomework(school.id, teacher.id, subject.id, year.id, period.id, 'Poem Analysis', '2026-10-20', 'DRAFT', 'Analyze the poem and summarize it.');

    expect(item.title).toBe('Poem Analysis');
    expect(item.description).toBe('Analyze the poem and summarize it.');
  });

  it('enforces School ownership (unknown school rejected)', async () => {
    const { year, period } = await academicContext((await createSchool('School A')).id);
    const teacher = await createTeacher(year.schoolId);
    const subject = await createSubject(year.schoolId, 'Mathematics');

    await expect(
      db
        .insert(schema.homework)
        .values({ schoolId: '00000000-0000-0000-0000-000000000000', teacherId: teacher.id, subjectId: subject.id, academicYearId: year.id, academicPeriodId: period.id, title: 'X', dueDate: '2026-10-15' }),
    ).rejects.toThrow();
  });

  it('supports the full DRAFT → PUBLISHED → CLOSED → ARCHIVED lifecycle', async () => {
    const school = await createSchool('School A');
    const { year, period } = await academicContext(school.id);
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const item = await createHomework(school.id, teacher.id, subject.id, year.id, period.id);

    await db.update(schema.homework).set({ status: 'PUBLISHED' }).where(eq(schema.homework.id, item.id));
    await db.update(schema.homework).set({ status: 'CLOSED' }).where(eq(schema.homework.id, item.id));
    const [archived] = await db
      .update(schema.homework)
      .set({ status: 'ARCHIVED' })
      .where(eq(schema.homework.id, item.id))
      .returning();

    expect(archived.status).toBe('ARCHIVED');
  });

  it('rejects an invalid Homework status', async () => {
    const school = await createSchool('School A');
    const { year, period } = await academicContext(school.id);
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');

    await expect(
      db.execute(
        sql`INSERT INTO homework (school_id, teacher_id, subject_id, academic_year_id, academic_period_id, title, due_date, status)
            VALUES (${school.id}, ${teacher.id}, ${subject.id}, ${year.id}, ${period.id}, 'X', '2026-10-15', 'DELETED')`,
      ),
    ).rejects.toThrow();
  });
});

describe('homework — tenant + context integrity (Task 008 §30.3–§30.7, §30.10)', () => {
  it('rejects a cross-school Teacher', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const { year, period } = await academicContext(schoolA.id);
    const teacherB = await createTeacher(schoolB.id, 'Yassine', 'El Idrissi');
    const subject = await createSubject(schoolA.id, 'Mathematics');

    await expect(
      createHomework(schoolA.id, teacherB.id, subject.id, year.id, period.id),
    ).rejects.toThrow();
  });

  it('rejects a cross-school Subject', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const { year, period } = await academicContext(schoolA.id);
    const teacher = await createTeacher(schoolA.id);
    const subjectB = await createSubject(schoolB.id, 'Physics');

    await expect(
      createHomework(schoolA.id, teacher.id, subjectB.id, year.id, period.id),
    ).rejects.toThrow();
  });

  it('rejects a cross-school AcademicYear', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const { year: yearA, period } = await academicContext(schoolA.id);
    const { year: yearB, period: periodB } = await academicContext(schoolB.id, '2026/2027');
    const teacher = await createTeacher(schoolA.id);
    const subject = await createSubject(schoolA.id, 'Mathematics');

    await expect(
      createHomework(schoolA.id, teacher.id, subject.id, yearB.id, periodB.id),
    ).rejects.toThrow();
    expect(yearA.id).toBeDefined();
  });

  it('rejects a cross-school AcademicPeriod', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const { year } = await academicContext(schoolA.id);
    const { year: yearB, period: periodB } = await academicContext(schoolB.id, '2026/2027');
    const teacher = await createTeacher(schoolA.id);
    const subject = await createSubject(schoolA.id, 'Mathematics');

    // School A Homework + School B AcademicPeriod must fail.
    await expect(
      createHomework(schoolA.id, teacher.id, subject.id, year.id, periodB.id),
    ).rejects.toThrow();
    expect(yearB.id).toBeDefined();
  });

  it('rejects an AcademicPeriod that belongs to a different AcademicYear (same School)', async () => {
    const school = await createSchool('School A');
    const { year: year1, period: period1 } = await academicContext(school.id, '2025/2026');
    const year2 = await createAcademicYear(school.id, '2026/2027', '2026-09-01', '2027-07-01');
    const period2 = await createAcademicPeriod(school.id, year2.id, 'Term 1', 1, '2026-09-01', '2026-12-20');
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');

    // period1 belongs to year1; pairing it with year2 must fail at the DB.
    await expect(
      createHomework(school.id, teacher.id, subject.id, year2.id, period1.id),
    ).rejects.toThrow();
    // period2 belongs to year2; pairing it with year1 must fail too.
    await expect(
      createHomework(school.id, teacher.id, subject.id, year1.id, period2.id),
    ).rejects.toThrow();
  });

  it('rejects cross-school combinations of Teacher + Subject + Year + Period', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const { year: yearA } = await academicContext(schoolA.id);
    const { year: yearB, period: periodB } = await academicContext(schoolB.id, '2026/2027');
    const teacherB = await createTeacher(schoolB.id, 'Yassine', 'El Idrissi');
    const subjectB = await createSubject(schoolB.id, 'Physics');

    // Every cross-school combination must be rejected.
    await expect(
      createHomework(schoolA.id, teacherB.id, subjectB.id, yearA.id, periodB.id),
    ).rejects.toThrow();
    await expect(
      createHomework(schoolA.id, teacherB.id, subjectB.id, yearB.id, periodB.id),
    ).rejects.toThrow();
  });
});

describe('homework_targets — targeting (Task 008 §30.11–§30.15)', () => {
  it('accepts a valid Class target', async () => {
    const school = await createSchool('School A');
    const { year, period, klass } = await academicContext(school.id);
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const item = await createHomework(school.id, teacher.id, subject.id, year.id, period.id);

    const target = await createTarget(school.id, item.id, year.id, klass.id);

    expect(target.id).toBeDefined();
    expect(target.homeworkId).toBe(item.id);
    expect(target.classId).toBe(klass.id);
    expect(target.academicYearId).toBe(year.id);
    expect(target.targetType).toBe('CLASS');
  });

  it('rejects a cross-school Class target', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const { year, period } = await academicContext(schoolA.id);
    const { year: yearB, klass: classB } = await academicContext(schoolB.id, '2026/2027', 'Class B');
    const teacher = await createTeacher(schoolA.id);
    const subject = await createSubject(schoolA.id, 'Mathematics');
    const item = await createHomework(schoolA.id, teacher.id, subject.id, year.id, period.id);

    // School A homework + School B class (with School B year) must fail.
    await expect(
      createTarget(schoolA.id, item.id, yearB.id, classB.id),
    ).rejects.toThrow();
  });

  it('rejects a Class target from a different AcademicYear', async () => {
    const school = await createSchool('School A');
    const { year: year1, period, version, level, klass: classA } = await academicContext(school.id, '2025/2026');
    const year2 = await createAcademicYear(school.id, '2026/2027', '2026-09-01', '2027-07-01');
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const item = await createHomework(school.id, teacher.id, subject.id, year1.id, period.id);

    // classA belongs to year1; targeting it with year2 must fail at the DB.
    await expect(
      createTarget(school.id, item.id, year2.id, classA.id),
    ).rejects.toThrow();
    expect(level.id).toBeDefined();
    expect(version.id).toBeDefined();
  });

  it('rejects a duplicate Homework + Class target', async () => {
    const school = await createSchool('School A');
    const { year, period, klass } = await academicContext(school.id);
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const item = await createHomework(school.id, teacher.id, subject.id, year.id, period.id);
    await createTarget(school.id, item.id, year.id, klass.id);

    await expect(
      createTarget(school.id, item.id, year.id, klass.id),
    ).rejects.toThrow();
  });

  it('allows the same Homework to target multiple Classes', async () => {
    const school = await createSchool('School A');
    const { year, period, version, level, klass: classA } = await academicContext(school.id, '2025/2026');
    const classB = await addClass(school.id, year, level.id, version.id, 'Class B');
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const item = await createHomework(school.id, teacher.id, subject.id, year.id, period.id);

    await createTarget(school.id, item.id, year.id, classA.id);
    const targetB = await createTarget(school.id, item.id, year.id, classB.id);

    expect(targetB.classId).toBe(classB.id);
    const rows = await db
      .select()
      .from(schema.homeworkTargets)
      .where(eq(schema.homeworkTargets.homeworkId, item.id));
    expect(rows).toHaveLength(2);
  });

  it('rejects an invalid target type', async () => {
    const school = await createSchool('School A');
    const { year, period, klass } = await academicContext(school.id);
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const item = await createHomework(school.id, teacher.id, subject.id, year.id, period.id);

    await expect(
      db.execute(
        sql`INSERT INTO homework_targets (school_id, homework_id, target_type, academic_year_id, class_id)
            VALUES (${school.id}, ${item.id}, 'STUDENT', ${year.id}, ${klass.id})`,
      ),
    ).rejects.toThrow();
  });

  it('closing and archiving Homework preserves its targets', async () => {
    const school = await createSchool('School A');
    const { year, period, klass } = await academicContext(school.id);
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const item = await createHomework(school.id, teacher.id, subject.id, year.id, period.id);
    await createTarget(school.id, item.id, year.id, klass.id);

    await db.update(schema.homework).set({ status: 'CLOSED' }).where(eq(schema.homework.id, item.id));
    await db.update(schema.homework).set({ status: 'ARCHIVED' }).where(eq(schema.homework.id, item.id));

    const rows = await db
      .select()
      .from(schema.homeworkTargets)
      .where(eq(schema.homeworkTargets.homeworkId, item.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].classId).toBe(klass.id);
  });
});

describe('homework_submissions — submissions (Task 008 §30.16–§30.23)', () => {
  it('creates a valid Student + Homework submission', async () => {
    const school = await createSchool('School A');
    const { year, period } = await academicContext(school.id);
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const item = await createHomework(school.id, teacher.id, subject.id, year.id, period.id);
    const student = await createStudent(school.id);

    const submission = await createSubmission(school.id, item.id, student.id);

    expect(submission.id).toBeDefined();
    expect(submission.homeworkId).toBe(item.id);
    expect(submission.studentId).toBe(student.id);
    expect(submission.status).toBe('SUBMITTED');
    expect(submission.submittedAt).toBeInstanceOf(Date);
    expect(submission.content).toBeNull();
  });

  it('stores an optional submission content', async () => {
    const school = await createSchool('School A');
    const { year, period } = await academicContext(school.id);
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const item = await createHomework(school.id, teacher.id, subject.id, year.id, period.id);
    const student = await createStudent(school.id);

    const submission = await createSubmission(school.id, item.id, student.id, 'SUBMITTED', 'My answer text');

    expect(submission.content).toBe('My answer text');
  });

  it('rejects a cross-school Student', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const { year, period } = await academicContext(schoolA.id);
    const teacher = await createTeacher(schoolA.id);
    const subject = await createSubject(schoolA.id, 'Mathematics');
    const item = await createHomework(schoolA.id, teacher.id, subject.id, year.id, period.id);
    const studentB = await createStudent(schoolB.id, 'Yassine', 'El Idrissi');

    await expect(
      createSubmission(schoolA.id, item.id, studentB.id),
    ).rejects.toThrow();
  });

  it('rejects a cross-school Homework', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const { year, period } = await academicContext(schoolA.id);
    const { year: yearB, period: periodB } = await academicContext(schoolB.id, '2026/2027');
    const teacherB = await createTeacher(schoolB.id, 'Yassine', 'El Idrissi');
    const subjectB = await createSubject(schoolB.id, 'Physics');
    const itemB = await createHomework(schoolB.id, teacherB.id, subjectB.id, yearB.id, periodB.id);
    const student = await createStudent(schoolA.id);

    // School A student submitting to School B homework with School A school_id.
    await expect(
      createSubmission(schoolA.id, itemB.id, student.id),
    ).rejects.toThrow();
    expect(year.id).toBeDefined();
  });

  it('rejects a duplicate Homework + Student submission', async () => {
    const school = await createSchool('School A');
    const { year, period } = await academicContext(school.id);
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const item = await createHomework(school.id, teacher.id, subject.id, year.id, period.id);
    const student = await createStudent(school.id);
    await createSubmission(school.id, item.id, student.id);

    await expect(
      createSubmission(school.id, item.id, student.id),
    ).rejects.toThrow();
  });

  it('supports the submission lifecycle SUBMITTED → LATE → REVIEWED → RETURNED', async () => {
    const school = await createSchool('School A');
    const { year, period } = await academicContext(school.id);
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const item = await createHomework(school.id, teacher.id, subject.id, year.id, period.id);
    const student = await createStudent(school.id);
    const submission = await createSubmission(school.id, item.id, student.id);

    await db.update(schema.homeworkSubmissions).set({ status: 'LATE' }).where(eq(schema.homeworkSubmissions.id, submission.id));
    await db.update(schema.homeworkSubmissions).set({ status: 'REVIEWED' }).where(eq(schema.homeworkSubmissions.id, submission.id));
    const [returned] = await db
      .update(schema.homeworkSubmissions)
      .set({ status: 'RETURNED' })
      .where(eq(schema.homeworkSubmissions.id, submission.id))
      .returning();

    expect(returned.status).toBe('RETURNED');
  });

  it('rejects an invalid submission state', async () => {
    const school = await createSchool('School A');
    const { year, period } = await academicContext(school.id);
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const item = await createHomework(school.id, teacher.id, subject.id, year.id, period.id);
    const student = await createStudent(school.id);

    await expect(
      db.execute(
        sql`INSERT INTO homework_submissions (school_id, homework_id, student_id, status)
            VALUES (${school.id}, ${item.id}, ${student.id}, 'GRADED')`,
      ),
    ).rejects.toThrow();
  });

  it('historical submission survives a Student transfer', async () => {
    const school = await createSchool('School A');
    const { year, period, version, level, klass: classA } = await academicContext(school.id, '2025/2026');
    const classB = await addClass(school.id, year, level.id, version.id, 'Class B');
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const item = await createHomework(school.id, teacher.id, subject.id, year.id, period.id);
    const student = await createStudent(school.id);
    const enrollmentA = await createEnrollment(school.id, student.id, year.id, classA.id);
    const submission = await createSubmission(school.id, item.id, student.id);

    // Transfer: end enrollment A, create enrollment B.
    await db
      .update(schema.studentEnrollments)
      .set({ status: 'ENDED', effectiveUntil: '2025-11-01' })
      .where(eq(schema.studentEnrollments.id, enrollmentA.id));
    await createEnrollment(school.id, student.id, year.id, classB.id);

    const rows = await db
      .select()
      .from(schema.homeworkSubmissions)
      .where(and(eq(schema.homeworkSubmissions.homeworkId, item.id), eq(schema.homeworkSubmissions.studentId, student.id)));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(submission.id);
    expect(rows[0].status).toBe('SUBMITTED');
  });

  it('closing Homework preserves its submissions', async () => {
    const school = await createSchool('School A');
    const { year, period } = await academicContext(school.id);
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const item = await createHomework(school.id, teacher.id, subject.id, year.id, period.id);
    const student = await createStudent(school.id);
    const submission = await createSubmission(school.id, item.id, student.id);

    await db.update(schema.homework).set({ status: 'CLOSED' }).where(eq(schema.homework.id, item.id));

    const rows = await db
      .select()
      .from(schema.homeworkSubmissions)
      .where(eq(schema.homeworkSubmissions.id, submission.id));
    expect(rows).toHaveLength(1);
  });

  it('deactivating a Teacher preserves Homework and submissions', async () => {
    const school = await createSchool('School A');
    const { year, period, klass } = await academicContext(school.id);
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    await createAssignment(school.id, teacher.id, klass.id, subject.id, year.id);
    const item = await createHomework(school.id, teacher.id, subject.id, year.id, period.id);
    const student = await createStudent(school.id);
    const submission = await createSubmission(school.id, item.id, student.id);

    await db.update(schema.teachers).set({ status: 'INACTIVE' }).where(eq(schema.teachers.id, teacher.id));

    const homeworkRows = await db.select().from(schema.homework).where(eq(schema.homework.id, item.id));
    const submissionRows = await db
      .select()
      .from(schema.homeworkSubmissions)
      .where(eq(schema.homeworkSubmissions.id, submission.id));
    expect(homeworkRows).toHaveLength(1);
    expect(submissionRows).toHaveLength(1);
  });

  it('does NOT create any Grade/Assessment/Result record when a submission is created', async () => {
    const school = await createSchool('School A');
    const { year, period } = await academicContext(school.id);
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const item = await createHomework(school.id, teacher.id, subject.id, year.id, period.id);
    const student = await createStudent(school.id);

    await createSubmission(school.id, item.id, student.id);

    const grades = await db.select().from(schema.grades);
    const assessments = await db.select().from(schema.assessments);
    const subjectResults = await db.select().from(schema.subjectResults);
    expect(grades).toHaveLength(0);
    expect(assessments).toHaveLength(0);
    expect(subjectResults).toHaveLength(0);
  });
});

describe('homework — delete behavior (Task 008 §24)', () => {
  it('restricts deleting a School that still has Homework', async () => {
    const school = await createSchool('School A');
    const { year, period } = await academicContext(school.id);
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    await createHomework(school.id, teacher.id, subject.id, year.id, period.id);

    await expect(db.delete(schema.schools).where(eq(schema.schools.id, school.id))).rejects.toThrow();
  });

  it('restricts deleting a Teacher that still has Homework', async () => {
    const school = await createSchool('School A');
    const { year, period } = await academicContext(school.id);
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    await createHomework(school.id, teacher.id, subject.id, year.id, period.id);

    await expect(db.delete(schema.teachers).where(eq(schema.teachers.id, teacher.id))).rejects.toThrow();
  });

  it('restricts deleting a Student that still has a submission', async () => {
    const school = await createSchool('School A');
    const { year, period } = await academicContext(school.id);
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const item = await createHomework(school.id, teacher.id, subject.id, year.id, period.id);
    const student = await createStudent(school.id);
    await createSubmission(school.id, item.id, student.id);

    await expect(db.delete(schema.students).where(eq(schema.students.id, student.id))).rejects.toThrow();
  });

  it('restricts deleting Homework that still has targets or submissions', async () => {
    const school = await createSchool('School A');
    const { year, period, klass } = await academicContext(school.id);
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const item = await createHomework(school.id, teacher.id, subject.id, year.id, period.id);
    const student = await createStudent(school.id);
    await createTarget(school.id, item.id, year.id, klass.id);
    await createSubmission(school.id, item.id, student.id);

    await expect(db.delete(schema.homework).where(eq(schema.homework.id, item.id))).rejects.toThrow();
  });
});