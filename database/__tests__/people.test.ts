import { and, eq } from 'drizzle-orm';
import { authUsers } from 'drizzle-orm/supabase';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../drizzle/schema';
import { createTestDb, type Db } from './helpers';

let db: Db;

async function createSchool(name: string) {
  const [school] = await db.insert(schema.schools).values({ name }).returning();
  return school;
}

async function createUser() {
  const id = randomUUID();
  await db.insert(authUsers).values({ id, email: `${id}@test.example` });
  await db.insert(schema.users).values({ id, email: `${id}@test.example` });
  return id;
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
  const [row] = await db
    .insert(schema.classes)
    .values({ schoolId, academicYearId, levelId, curriculumVersionId, name })
    .returning();
  return row;
}

/** Creates an ADDITIONAL Class inside an already-existing academic context. */
async function addClass(
  schoolId: string,
  year: { id: string },
  levelId: string,
  curriculumVersionId: string,
  name: string,
) {
  return createClass(schoolId, year.id, levelId, curriculumVersionId, name);
}

/** Creates the academic scaffolding (year + curriculum/version + stage/level + class). */
async function academicContext(schoolId: string, yearName = '2025/2026', className = 'Class A') {
  const year = await createAcademicYear(schoolId, yearName);
  const curriculum = await createCurriculum(schoolId, 'National Curriculum');
  const version = await createCurriculumVersion(schoolId, curriculum.id, '2025-2026');
  const stage = await createStage(schoolId, 'Primary');
  const level = await createLevel(schoolId, stage.id, '1st Year');
  const klass = await createClass(schoolId, year.id, level.id, version.id, className);
  return { year, version, level, klass };
}

async function createStudent(schoolId: string, firstName = 'Amine', lastName = 'Benali', studentCode?: string) {
  const [row] = await db
    .insert(schema.students)
    .values({ schoolId, firstName, lastName, studentCode })
    .returning();
  return row;
}

async function createTeacher(schoolId: string, firstName = 'Karim', lastName = 'Alaoui', userId?: string) {
  const [row] = await db
    .insert(schema.teachers)
    .values({ schoolId, firstName, lastName, userId })
    .returning();
  return row;
}

async function createParent(schoolId: string, firstName = 'Sara', lastName = 'Benali', userId?: string) {
  const [row] = await db
    .insert(schema.parents)
    .values({ schoolId, firstName, lastName, userId })
    .returning();
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
  status: 'ACTIVE' | 'ENDED' = 'ACTIVE',
  effectiveFrom = '2025-09-01',
  effectiveUntil?: string,
) {
  const [row] = await db
    .insert(schema.teacherAssignments)
    .values({ schoolId, teacherId, classId, subjectId, academicYearId, status, effectiveFrom, effectiveUntil })
    .returning();
  return row;
}

async function createParentStudent(
  schoolId: string,
  parentId: string,
  studentId: string,
  status: 'ACTIVE' | 'ENDED' = 'ACTIVE',
) {
  const [row] = await db
    .insert(schema.parentStudents)
    .values({ schoolId, parentId, studentId, status })
    .returning();
  return row;
}

beforeEach(async () => {
  ({ db } = await createTestDb());
});

describe('students', () => {
  it('belongs to a School', async () => {
    const school = await createSchool('School A');

    const student = await createStudent(school.id);

    expect(student.schoolId).toBe(school.id);
    expect(student.status).toBe('ACTIVE');
  });

  it('rejects a Student whose School does not exist', async () => {
    await expect(
      db.insert(schema.students).values({ schoolId: randomUUID(), firstName: 'A', lastName: 'B' }),
    ).rejects.toThrow();
  });

  it('rejects a duplicate school-scoped student code within the same School', async () => {
    const school = await createSchool('School A');
    await createStudent(school.id, 'Amine', 'Benali', 'STD-001');

    await expect(createStudent(school.id, 'Yassine', 'El Idrissi', 'STD-001')).rejects.toThrow();
  });

  it('allows the same student code in different Schools', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');

    const a = await createStudent(schoolA.id, 'Amine', 'Benali', 'STD-001');
    const b = await createStudent(schoolB.id, 'Yassine', 'El Idrissi', 'STD-001');

    expect(a.studentCode).toBe('STD-001');
    expect(b.studentCode).toBe('STD-001');
  });

  it('allows multiple students without a code', async () => {
    const school = await createSchool('School A');
    await createStudent(school.id, 'Amine', 'Benali');
    const second = await createStudent(school.id, 'Yassine', 'El Idrissi');

    expect(second.studentCode).toBeNull();
  });

  it('lifecycle/deactivation works without deleting the row', async () => {
    const school = await createSchool('School A');
    const student = await createStudent(school.id);

    const [updated] = await db
      .update(schema.students)
      .set({ status: 'INACTIVE' })
      .where(eq(schema.students.id, student.id))
      .returning();

    expect(updated.status).toBe('INACTIVE');

    const [withdrawn] = await db
      .update(schema.students)
      .set({ status: 'WITHDRAWN' })
      .where(eq(schema.students.id, student.id))
      .returning();
    expect(withdrawn.status).toBe('WITHDRAWN');
  });

  it('archive does not delete academic history', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const student = await createStudent(school.id);
    await createEnrollment(school.id, student.id, year.id, klass.id);

    const [archived] = await db
      .update(schema.students)
      .set({ status: 'ARCHIVED' })
      .where(eq(schema.students.id, student.id))
      .returning();
    expect(archived.status).toBe('ARCHIVED');

    const enrollments = await db
      .select()
      .from(schema.studentEnrollments)
      .where(eq(schema.studentEnrollments.studentId, student.id));
    expect(enrollments).toHaveLength(1);
  });

  it('does not require a User account (no user_id column)', async () => {
    expect(schema.students).not.toHaveProperty('userId');
  });
});

describe('student_enrollments', () => {
  it('creates a valid Student + AcademicYear + Class enrollment', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const student = await createStudent(school.id);

    const enrollment = await createEnrollment(school.id, student.id, year.id, klass.id);

    expect(enrollment.studentId).toBe(student.id);
    expect(enrollment.academicYearId).toBe(year.id);
    expect(enrollment.classId).toBe(klass.id);
    expect(enrollment.status).toBe('ACTIVE');
    expect(enrollment.effectiveFrom).toBe('2025-09-01');
    expect(enrollment.effectiveUntil).toBeNull();
  });

  it('rejects a cross-school Student', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const { year: yearA, klass: classA } = await academicContext(schoolA.id);
    const studentA = await createStudent(schoolA.id);

    await expect(
      createEnrollment(schoolB.id, studentA.id, yearA.id, classA.id),
    ).rejects.toThrow();
  });

  it('rejects a cross-school AcademicYear', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const { year: yearA, klass: classA } = await academicContext(schoolA.id);
    const { year: yearB } = await academicContext(schoolB.id, '2025/2026', 'Class B');
    const studentB = await createStudent(schoolB.id);

    await expect(
      createEnrollment(schoolB.id, studentB.id, yearA.id, classA.id),
    ).rejects.toThrow();
    await expect(
      createEnrollment(schoolB.id, studentB.id, yearB.id, classA.id),
    ).rejects.toThrow();
  });

  it('rejects a cross-school Class', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const { year: yearA, klass: classA } = await academicContext(schoolA.id);
    const { year: yearB, klass: classB } = await academicContext(schoolB.id, '2025/2026', 'Class B');
    const studentA = await createStudent(schoolA.id);

    await expect(
      createEnrollment(schoolA.id, studentA.id, yearA.id, classB.id),
    ).rejects.toThrow();
    await expect(
      createEnrollment(schoolB.id, studentA.id, yearB.id, classB.id),
    ).rejects.toThrow();
  });

  it('rejects a Class that belongs to a different AcademicYear', async () => {
    const school = await createSchool('School A');
    const { year: year1, version, level } = await academicContext(school.id, '2025/2026', 'Class A');
    const year2 = await createAcademicYear(school.id, '2026/2027', '2026-09-01', '2027-07-01');
    const class2 = await addClass(school.id, year1, level.id, version.id, 'Class B');
    const student = await createStudent(school.id);

    // class2 belongs to year1; enrolling it into year2 must fail at the DB.
    await expect(
      createEnrollment(school.id, student.id, year2.id, class2.id),
    ).rejects.toThrow();
    expect(year1.id).toBeDefined();
  });

  it('rejects a second simultaneously active enrollment for the same Student + AcademicYear', async () => {
    const school = await createSchool('School A');
    const { year, version, level, klass: classA } = await academicContext(school.id, '2025/2026', 'Class A');
    const classB = await addClass(school.id, year, level.id, version.id, 'Class B');
    const student = await createStudent(school.id);
    await createEnrollment(school.id, student.id, year.id, classA.id);

    await expect(
      createEnrollment(school.id, student.id, year.id, classB.id),
    ).rejects.toThrow();
  });

  it('allows an ACTIVE enrollment in different AcademicYears', async () => {
    const school = await createSchool('School A');
    const year1 = await createAcademicYear(school.id, '2025/2026', '2025-09-01', '2026-07-01');
    const year2 = await createAcademicYear(school.id, '2026/2027', '2026-09-01', '2027-07-01');
    const curriculum = await createCurriculum(school.id, 'National Curriculum');
    const version = await createCurriculumVersion(school.id, curriculum.id, '2025-2026');
    const stage = await createStage(school.id, 'Primary');
    const level = await createLevel(school.id, stage.id, '1st Year');
    const class1 = await createClass(school.id, year1.id, level.id, version.id, 'Class A');
    const class2 = await createClass(school.id, year2.id, level.id, version.id, 'Class A');
    const student = await createStudent(school.id);

    const a = await createEnrollment(school.id, student.id, year1.id, class1.id);
    const b = await createEnrollment(school.id, student.id, year2.id, class2.id);

    expect(a.academicYearId).toBe(year1.id);
    expect(b.academicYearId).toBe(year2.id);
  });

  it('preserves a historical ended enrollment', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const student = await createStudent(school.id);
    const enrollment = await createEnrollment(school.id, student.id, year.id, klass.id, 'ACTIVE', '2025-09-01');

    const [ended] = await db
      .update(schema.studentEnrollments)
      .set({ status: 'ENDED', effectiveUntil: '2026-01-15' })
      .where(eq(schema.studentEnrollments.id, enrollment.id))
      .returning();

    expect(ended.status).toBe('ENDED');
    expect(ended.effectiveUntil).toBe('2026-01-15');

    const remaining = await db
      .select()
      .from(schema.studentEnrollments)
      .where(eq(schema.studentEnrollments.id, enrollment.id));
    expect(remaining).toHaveLength(1);
  });

  it('rejects an effective_until before effective_from', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const student = await createStudent(school.id);

    await expect(
      createEnrollment(school.id, student.id, year.id, klass.id, 'ACTIVE', '2026-01-15', '2025-09-01'),
    ).rejects.toThrow();
  });

  it('allows a historical ended enrollment and a later active enrollment in the same year', async () => {
    const school = await createSchool('School A');
    const { year, version, level, klass: classA } = await academicContext(school.id, '2025/2026', 'Class A');
    const classB = await addClass(school.id, year, level.id, version.id, 'Class B');
    const student = await createStudent(school.id);

    const first = await createEnrollment(school.id, student.id, year.id, classA.id);
    await db
      .update(schema.studentEnrollments)
      .set({ status: 'ENDED', effectiveUntil: '2025-11-01' })
      .where(eq(schema.studentEnrollments.id, first.id));

    const second = await createEnrollment(school.id, student.id, year.id, classB.id);

    const rows = await db
      .select()
      .from(schema.studentEnrollments)
      .where(eq(schema.studentEnrollments.studentId, student.id));
    expect(rows).toHaveLength(2);
    expect(second.status).toBe('ACTIVE');
    expect(rows.map((r) => r.classId)).toContain(classA.id);
    expect(rows.map((r) => r.classId)).toContain(classB.id);
  });

  it('works without any User account for the Student', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const student = await createStudent(school.id);

    const enrollment = await createEnrollment(school.id, student.id, year.id, klass.id);

    expect(enrollment.id).toBeDefined();
  });
});

describe('teachers', () => {
  it('belongs to a School', async () => {
    const school = await createSchool('School A');

    const teacher = await createTeacher(school.id);

    expect(teacher.schoolId).toBe(school.id);
    expect(teacher.status).toBe('ACTIVE');
  });

  it('supports an optional User relation', async () => {
    const school = await createSchool('School A');
    const userId = await createUser();

    const teacher = await createTeacher(school.id, 'Karim', 'Alaoui', userId);

    expect(teacher.userId).toBe(userId);
  });

  it('keeps the profile separate from the User', async () => {
    const school = await createSchool('School A');

    const withoutUser = await createTeacher(school.id, 'Karim', 'Alaoui');
    const userId = await createUser();
    const withUser = await createTeacher(school.id, 'Rachid', 'Bennani', userId);

    expect(withoutUser.userId).toBeNull();
    expect(withUser.userId).toBe(userId);
  });

  it('lifecycle works without deleting the row', async () => {
    const school = await createSchool('School A');
    const teacher = await createTeacher(school.id);

    const [updated] = await db
      .update(schema.teachers)
      .set({ status: 'ARCHIVED' })
      .where(eq(schema.teachers.id, teacher.id))
      .returning();

    expect(updated.status).toBe('ARCHIVED');

    const remaining = await db.select().from(schema.teachers).where(eq(schema.teachers.id, teacher.id));
    expect(remaining).toHaveLength(1);
  });

  it('restricts deleting a User that still has a Teacher profile', async () => {
    const school = await createSchool('School A');
    const userId = await createUser();
    await createTeacher(school.id, 'Karim', 'Alaoui', userId);

    await expect(db.delete(schema.users).where(eq(schema.users.id, userId))).rejects.toThrow();
  });
});

describe('teacher_assignments', () => {
  it('creates a valid Teacher + Class + Subject + AcademicYear assignment', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const teacher = await createTeacher(school.id);

    const assignment = await createAssignment(school.id, teacher.id, klass.id, subject.id, year.id);

    expect(assignment.teacherId).toBe(teacher.id);
    expect(assignment.classId).toBe(klass.id);
    expect(assignment.subjectId).toBe(subject.id);
    expect(assignment.academicYearId).toBe(year.id);
    expect(assignment.status).toBe('ACTIVE');
  });

  it('rejects a cross-school Teacher', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const { year: yearA, klass: classA } = await academicContext(schoolA.id);
    const subjectA = await createSubject(schoolA.id, 'Mathematics');
    const teacherB = await createTeacher(schoolB.id, 'Karim', 'Alaoui');

    await expect(
      createAssignment(schoolA.id, teacherB.id, classA.id, subjectA.id, yearA.id),
    ).rejects.toThrow();
  });

  it('rejects a cross-school Class', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const { year: yearA, klass: classA } = await academicContext(schoolA.id);
    const { klass: classB } = await academicContext(schoolB.id, '2025/2026', 'Class B');
    const subjectA = await createSubject(schoolA.id, 'Mathematics');
    const teacherA = await createTeacher(schoolA.id);

    await expect(
      createAssignment(schoolA.id, teacherA.id, classB.id, subjectA.id, yearA.id),
    ).rejects.toThrow();
  });

  it('rejects a cross-school Subject', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const { year: yearA, klass: classA } = await academicContext(schoolA.id);
    const subjectA = await createSubject(schoolA.id, 'Mathematics');
    const subjectB = await createSubject(schoolB.id, 'Physics');
    const teacherA = await createTeacher(schoolA.id);

    await expect(
      createAssignment(schoolA.id, teacherA.id, classA.id, subjectB.id, yearA.id),
    ).rejects.toThrow();
    expect(subjectA.id).toBeDefined();
  });

  it('rejects a cross-school AcademicYear', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const { year: yearA, klass: classA } = await academicContext(schoolA.id);
    const { year: yearB } = await academicContext(schoolB.id, '2025/2026', 'Class B');
    const subjectA = await createSubject(schoolA.id, 'Mathematics');
    const teacherA = await createTeacher(schoolA.id);

    await expect(
      createAssignment(schoolA.id, teacherA.id, classA.id, subjectA.id, yearB.id),
    ).rejects.toThrow();
  });

  it('rejects a Class that belongs to a different AcademicYear', async () => {
    const school = await createSchool('School A');
    const { year: year1, klass: class1 } = await academicContext(school.id, '2025/2026', 'Class A');
    const year2 = await createAcademicYear(school.id, '2026/2027', '2026-09-01', '2027-07-01');
    const subject = await createSubject(school.id, 'Mathematics');
    const teacher = await createTeacher(school.id);

    // class1 belongs to year1; assigning it under year2 must fail at the DB.
    await expect(
      createAssignment(school.id, teacher.id, class1.id, subject.id, year2.id),
    ).rejects.toThrow();
    expect(year1.id).toBeDefined();
  });

  it('rejects a duplicate logical active assignment', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const teacher = await createTeacher(school.id);
    await createAssignment(school.id, teacher.id, klass.id, subject.id, year.id);

    await expect(
      createAssignment(school.id, teacher.id, klass.id, subject.id, year.id),
    ).rejects.toThrow();
  });

  it('allows an ended assignment to coexist with a new active one in the same context', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const teacher = await createTeacher(school.id);

    const first = await createAssignment(school.id, teacher.id, klass.id, subject.id, year.id);
    await db
      .update(schema.teacherAssignments)
      .set({ status: 'ENDED', effectiveUntil: '2025-12-01' })
      .where(eq(schema.teacherAssignments.id, first.id));

    const second = await createAssignment(school.id, teacher.id, klass.id, subject.id, year.id);

    const rows = await db
      .select()
      .from(schema.teacherAssignments)
      .where(and(eq(schema.teacherAssignments.teacherId, teacher.id), eq(schema.teacherAssignments.subjectId, subject.id)));
    expect(rows).toHaveLength(2);
    expect(second.status).toBe('ACTIVE');
  });

  it('keeps a ended assignment historically stored', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const teacher = await createTeacher(school.id);
    const assignment = await createAssignment(school.id, teacher.id, klass.id, subject.id, year.id);

    await db
      .update(schema.teacherAssignments)
      .set({ status: 'ENDED', effectiveUntil: '2025-12-01' })
      .where(eq(schema.teacherAssignments.id, assignment.id));

    const remaining = await db
      .select()
      .from(schema.teacherAssignments)
      .where(eq(schema.teacherAssignments.id, assignment.id));
    expect(remaining).toHaveLength(1);
    expect(remaining[0].classId).toBe(klass.id);
  });

  it('historical assignments survive Teacher status changes', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const teacher = await createTeacher(school.id);
    const assignment = await createAssignment(school.id, teacher.id, klass.id, subject.id, year.id);

    await db.update(schema.teachers).set({ status: 'ARCHIVED' }).where(eq(schema.teachers.id, teacher.id));

    const remaining = await db
      .select()
      .from(schema.teacherAssignments)
      .where(eq(schema.teacherAssignments.id, assignment.id));
    expect(remaining).toHaveLength(1);
  });

  it('rejects an effective_until before effective_from', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const teacher = await createTeacher(school.id);

    await expect(
      createAssignment(school.id, teacher.id, klass.id, subject.id, year.id, 'ACTIVE', '2025-12-01', '2025-09-01'),
    ).rejects.toThrow();
  });
});

describe('parents', () => {
  it('belongs to a School', async () => {
    const school = await createSchool('School A');

    const parent = await createParent(school.id);

    expect(parent.schoolId).toBe(school.id);
    expect(parent.status).toBe('ACTIVE');
  });

  it('supports an optional User relation', async () => {
    const school = await createSchool('School A');
    const userId = await createUser();

    const parent = await createParent(school.id, 'Sara', 'Benali', userId);

    expect(parent.userId).toBe(userId);
  });

  it('lifecycle works without deleting the row', async () => {
    const school = await createSchool('School A');
    const parent = await createParent(school.id);

    const [updated] = await db
      .update(schema.parents)
      .set({ status: 'ARCHIVED' })
      .where(eq(schema.parents.id, parent.id))
      .returning();

    expect(updated.status).toBe('ARCHIVED');

    const remaining = await db.select().from(schema.parents).where(eq(schema.parents.id, parent.id));
    expect(remaining).toHaveLength(1);
  });

  it('restricts deleting a User that still has a Parent profile', async () => {
    const school = await createSchool('School A');
    const userId = await createUser();
    await createParent(school.id, 'Sara', 'Benali', userId);

    await expect(db.delete(schema.users).where(eq(schema.users.id, userId))).rejects.toThrow();
  });
});

describe('parent_students', () => {
  it('creates a valid Parent + Student relationship', async () => {
    const school = await createSchool('School A');
    const parent = await createParent(school.id);
    const student = await createStudent(school.id);

    const relationship = await createParentStudent(school.id, parent.id, student.id);

    expect(relationship.parentId).toBe(parent.id);
    expect(relationship.studentId).toBe(student.id);
    expect(relationship.status).toBe('ACTIVE');
  });

  it('rejects a cross-school relationship', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const parentA = await createParent(schoolA.id);
    const studentA = await createStudent(schoolA.id);
    const studentB = await createStudent(schoolB.id);

    await expect(
      createParentStudent(schoolA.id, parentA.id, studentB.id),
    ).rejects.toThrow();
    await expect(
      createParentStudent(schoolB.id, parentA.id, studentA.id),
    ).rejects.toThrow();
  });

  it('rejects a duplicate active relationship for the same Parent + Student', async () => {
    const school = await createSchool('School A');
    const parent = await createParent(school.id);
    const student = await createStudent(school.id);
    await createParentStudent(school.id, parent.id, student.id);

    await expect(
      createParentStudent(school.id, parent.id, student.id),
    ).rejects.toThrow();
  });

  it('ending a relationship preserves the historical row', async () => {
    const school = await createSchool('School A');
    const parent = await createParent(school.id);
    const student = await createStudent(school.id);
    const relationship = await createParentStudent(school.id, parent.id, student.id);

    await db
      .update(schema.parentStudents)
      .set({ status: 'ENDED' })
      .where(eq(schema.parentStudents.id, relationship.id));

    const remaining = await db
      .select()
      .from(schema.parentStudents)
      .where(eq(schema.parentStudents.id, relationship.id));
    expect(remaining).toHaveLength(1);
    expect(remaining[0].status).toBe('ENDED');
  });

  it('an inactive relationship does not represent current access', async () => {
    const school = await createSchool('School A');
    const parent = await createParent(school.id);
    const student = await createStudent(school.id);
    const relationship = await createParentStudent(school.id, parent.id, student.id);
    await db
      .update(schema.parentStudents)
      .set({ status: 'ENDED' })
      .where(eq(schema.parentStudents.id, relationship.id));

    const active = await db
      .select()
      .from(schema.parentStudents)
      .where(
        and(
          eq(schema.parentStudents.parentId, parent.id),
          eq(schema.parentStudents.studentId, student.id),
          eq(schema.parentStudents.status, 'ACTIVE'),
        ),
      );

    expect(active).toHaveLength(0);
  });

  it('allows re-linking after ending (one ACTIVE per pair)', async () => {
    const school = await createSchool('School A');
    const parent = await createParent(school.id);
    const student = await createStudent(school.id);
    const first = await createParentStudent(school.id, parent.id, student.id);
    await db
      .update(schema.parentStudents)
      .set({ status: 'ENDED' })
      .where(eq(schema.parentStudents.id, first.id));

    const second = await createParentStudent(school.id, parent.id, student.id);

    expect(second.status).toBe('ACTIVE');
    const rows = await db
      .select()
      .from(schema.parentStudents)
      .where(eq(schema.parentStudents.studentId, student.id));
    expect(rows).toHaveLength(2);
  });
});

describe('historical integrity (BR-HISTORY-001/002, Task 004 §33)', () => {
  it('student transfer: Enrollment A ENDED → Enrollment B ACTIVE, A stays queryable and points to Class A', async () => {
    const school = await createSchool('School A');
    const { year, version, level, klass: classA } = await academicContext(school.id, '2025/2026', 'Class A');
    const classB = await addClass(school.id, year, level.id, version.id, 'Class B');
    const student = await createStudent(school.id);

    const enrollmentA = await createEnrollment(school.id, student.id, year.id, classA.id);
    await db
      .update(schema.studentEnrollments)
      .set({ status: 'ENDED', effectiveUntil: '2025-11-01' })
      .where(eq(schema.studentEnrollments.id, enrollmentA.id));

    await createEnrollment(school.id, student.id, year.id, classB.id);

    const historical = await db
      .select()
      .from(schema.studentEnrollments)
      .where(eq(schema.studentEnrollments.id, enrollmentA.id));
    expect(historical).toHaveLength(1);
    expect(historical[0].status).toBe('ENDED');
    expect(historical[0].classId).toBe(classA.id);
    expect(historical[0].effectiveUntil).toBe('2025-11-01');
  });

  it('student transfer across years preserves both enrollments', async () => {
    const school = await createSchool('School A');
    const year1 = await createAcademicYear(school.id, '2025/2026', '2025-09-01', '2026-07-01');
    const year2 = await createAcademicYear(school.id, '2026/2027', '2026-09-01', '2027-07-01');
    const curriculum = await createCurriculum(school.id, 'National Curriculum');
    const version = await createCurriculumVersion(school.id, curriculum.id, '2025-2026');
    const stage = await createStage(school.id, 'Primary');
    const level = await createLevel(school.id, stage.id, '1st Year');
    const classA = await createClass(school.id, year1.id, level.id, version.id, 'Class A');
    const classB = await createClass(school.id, year2.id, level.id, version.id, 'Class B');
    const student = await createStudent(school.id);

    const enrollmentA = await createEnrollment(school.id, student.id, year1.id, classA.id, 'ACTIVE', '2025-09-01');
    const enrollmentB = await createEnrollment(school.id, student.id, year2.id, classB.id, 'ACTIVE', '2026-09-01');

    const rows = await db
      .select()
      .from(schema.studentEnrollments)
      .where(eq(schema.studentEnrollments.studentId, student.id));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id)).toEqual(
      expect.arrayContaining([enrollmentA.id, enrollmentB.id]),
    );
  });

  it('teacher reassignment: Assignment A ENDED → Assignment B ACTIVE, A stays queryable', async () => {
    const school = await createSchool('School A');
    const { year, version, level, klass: classA } = await academicContext(school.id, '2025/2026', 'Class A');
    const classB = await addClass(school.id, year, level.id, version.id, 'Class B');
    const subject = await createSubject(school.id, 'Mathematics');
    const teacher = await createTeacher(school.id);

    const assignmentA = await createAssignment(school.id, teacher.id, classA.id, subject.id, year.id);
    await db
      .update(schema.teacherAssignments)
      .set({ status: 'ENDED', effectiveUntil: '2025-12-01' })
      .where(eq(schema.teacherAssignments.id, assignmentA.id));

    const assignmentB = await createAssignment(school.id, teacher.id, classB.id, subject.id, year.id);

    const historical = await db
      .select()
      .from(schema.teacherAssignments)
      .where(eq(schema.teacherAssignments.id, assignmentA.id));
    expect(historical).toHaveLength(1);
    expect(historical[0].status).toBe('ENDED');
    expect(historical[0].classId).toBe(classA.id);

    const active = await db
      .select()
      .from(schema.teacherAssignments)
      .where(eq(schema.teacherAssignments.id, assignmentB.id));
    expect(active[0].status).toBe('ACTIVE');
  });

  it('parent relationship: ParentStudent A ENDED → the historical row remains', async () => {
    const school = await createSchool('School A');
    const parent = await createParent(school.id);
    const student = await createStudent(school.id);
    const relationship = await createParentStudent(school.id, parent.id, student.id);

    await db
      .update(schema.parentStudents)
      .set({ status: 'ENDED' })
      .where(eq(schema.parentStudents.id, relationship.id));

    const remaining = await db
      .select()
      .from(schema.parentStudents)
      .where(eq(schema.parentStudents.id, relationship.id));
    expect(remaining).toHaveLength(1);
    expect(remaining[0].parentId).toBe(parent.id);
    expect(remaining[0].studentId).toBe(student.id);
    expect(remaining[0].status).toBe('ENDED');
  });

  it('restricts deleting a School that still has People/Academic data', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const student = await createStudent(school.id);
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const parent = await createParent(school.id);
    await createEnrollment(school.id, student.id, year.id, klass.id);
    await createAssignment(school.id, teacher.id, klass.id, subject.id, year.id);
    await createParentStudent(school.id, parent.id, student.id);

    await expect(db.delete(schema.schools).where(eq(schema.schools.id, school.id))).rejects.toThrow();
  });
});
