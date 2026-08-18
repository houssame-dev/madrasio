import { and, eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../drizzle/schema';
import { createTestDb, type Db } from './helpers';

/**
 * Attendance foundation — database integration tests (Task 007 §23).
 *
 * These tests verify the SCHEMA invariants only:
 * - basic record creation with valid Student/Class/School references
 * - tenant isolation (cross-school Student / Class rejected)
 * - Class → AcademicYear context integrity
 * - one-daily-record uniqueness
 * - the four V1 statuses and rejection of invalid statuses
 * - historical integrity (transfer / ended enrollment / closed class /
 *   ended assignment never destroy attendance)
 * - RESTRICT delete behavior
 *
 * The enrollment-validity-on-date invariant is an Application-layer rule
 * (Task 007 §6) and is NOT tested here.
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

async function createTeacher(schoolId: string, firstName = 'Karim', lastName = 'Alaoui') {
  const [row] = await db
    .insert(schema.teachers)
    .values({ schoolId, firstName, lastName })
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

async function createSubject(schoolId: string, name: string) {
  const [row] = await db.insert(schema.subjects).values({ schoolId, name }).returning();
  return row;
}

async function createAttendance(
  schoolId: string,
  studentId: string,
  classId: string,
  academicYearId: string,
  attendanceDate = '2026-09-15',
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' = 'PRESENT',
  note?: string,
) {
  const [row] = await db
    .insert(schema.attendanceRecords)
    .values({ schoolId, studentId, classId, academicYearId, attendanceDate, status, note })
    .returning();
  return row;
}

beforeEach(async () => {
  ({ db } = await createTestDb());
});

describe('attendance_records — basic record (Task 007 §23.1–§23.4)', () => {
  it('creates a valid AttendanceRecord', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const student = await createStudent(school.id);

    const record = await createAttendance(school.id, student.id, klass.id, year.id);

    expect(record.id).toBeDefined();
    expect(record.schoolId).toBe(school.id);
    expect(record.studentId).toBe(student.id);
    expect(record.classId).toBe(klass.id);
    expect(record.academicYearId).toBe(year.id);
    expect(record.attendanceDate).toBe('2026-09-15');
    expect(record.status).toBe('PRESENT');
    expect(record.note).toBeNull();
    expect(record.createdAt).toBeInstanceOf(Date);
  });

  it('stores a valid Student reference', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const student = await createStudent(school.id);

    const record = await createAttendance(school.id, student.id, klass.id, year.id);

    expect(record.studentId).toBe(student.id);
  });

  it('stores a valid Class reference', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const student = await createStudent(school.id);

    const record = await createAttendance(school.id, student.id, klass.id, year.id);

    expect(record.classId).toBe(klass.id);
  });

  it('stores a valid School reference', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const student = await createStudent(school.id);

    const record = await createAttendance(school.id, student.id, klass.id, year.id);

    expect(record.schoolId).toBe(school.id);
  });

  it('accepts an optional note without requiring one', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const student = await createStudent(school.id);

    const withNote = await createAttendance(school.id, student.id, klass.id, year.id, '2026-09-15', 'ABSENT', 'family travel');
    const withoutNote = await createAttendance(school.id, student.id, klass.id, year.id, '2026-09-16', 'LATE');

    expect(withNote.note).toBe('family travel');
    expect(withoutNote.note).toBeNull();
  });
});

describe('attendance_records — tenant isolation (Task 007 §23.5–§23.6)', () => {
  it('rejects a cross-school Student', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const { year: yearA, klass: classA } = await academicContext(schoolA.id);
    const studentB = await createStudent(schoolB.id, 'Yassine', 'El Idrissi');

    await expect(
      createAttendance(schoolA.id, studentB.id, classA.id, yearA.id),
    ).rejects.toThrow();
  });

  it('rejects a cross-school Class', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const { year: yearA } = await academicContext(schoolA.id);
    const { year: yearB, klass: classB } = await academicContext(schoolB.id, '2025/2026', 'Class B');
    const studentA = await createStudent(schoolA.id);

    // School B class with School A year.
    await expect(
      createAttendance(schoolA.id, studentA.id, classB.id, yearA.id),
    ).rejects.toThrow();
    // School B class with School B year recorded against School A school_id.
    await expect(
      createAttendance(schoolA.id, studentA.id, classB.id, yearB.id),
    ).rejects.toThrow();
  });
});

describe('attendance_records — academic context (Task 007 §23.7–§23.8)', () => {
  it('preserves the Class → AcademicYear context', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const student = await createStudent(school.id);

    const record = await createAttendance(school.id, student.id, klass.id, year.id);

    // The record's academic_year_id must match the Class's AcademicYear.
    const [klassRow] = await db.select().from(schema.classes).where(eq(schema.classes.id, klass.id));
    expect(klassRow.academicYearId).toBe(year.id);
    expect(record.academicYearId).toBe(year.id);
  });

  it('rejects a Class that belongs to a different AcademicYear', async () => {
    const school = await createSchool('School A');
    const { year: year1, version, level, klass: class1 } = await academicContext(school.id, '2025/2026', 'Class A');
    const year2 = await createAcademicYear(school.id, '2026/2027', '2026-09-01', '2027-07-01');
    const class2 = await addClass(school.id, year1, level.id, version.id, 'Class B');
    const student = await createStudent(school.id);

    // class1 belongs to year1; pairing it with year2 must fail at the DB.
    await expect(
      createAttendance(school.id, student.id, class1.id, year2.id),
    ).rejects.toThrow();
    // class2 also belongs to year1; pairing it with year2 must fail too.
    await expect(
      createAttendance(school.id, student.id, class2.id, year2.id),
    ).rejects.toThrow();
    expect(year1.id).toBeDefined();
  });

  it('rejects an invalid Student/Class School combination', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const { year: yearA, klass: classA } = await academicContext(schoolA.id);
    const { year: yearB, klass: classB } = await academicContext(schoolB.id, '2025/2026', 'Class B');
    const studentB = await createStudent(schoolB.id, 'Yassine', 'El Idrissi');

    // School A context with a School B student.
    await expect(
      createAttendance(schoolA.id, studentB.id, classA.id, yearA.id),
    ).rejects.toThrow();
    // School A context with a School B class.
    await expect(
      createAttendance(schoolA.id, studentB.id, classB.id, yearB.id),
    ).rejects.toThrow();
  });
});

describe('attendance_records — one daily record (Task 007 §23.9–§23.10)', () => {
  it('rejects a duplicate daily record', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const student = await createStudent(school.id);
    await createAttendance(school.id, student.id, klass.id, year.id, '2026-09-15');

    await expect(
      createAttendance(school.id, student.id, klass.id, year.id, '2026-09-15'),
    ).rejects.toThrow();
  });

  it('allows the same Student + date in different Classes (historical moves stay possible)', async () => {
    const school = await createSchool('School A');
    const { year, version, level, klass: classA } = await academicContext(school.id, '2025/2026', 'Class A');
    const classB = await addClass(school.id, year, level.id, version.id, 'Class B');
    const student = await createStudent(school.id);

    const inA = await createAttendance(school.id, student.id, classA.id, year.id, '2026-09-15');
    const inB = await createAttendance(school.id, student.id, classB.id, year.id, '2026-09-15');

    expect(inA.classId).toBe(classA.id);
    expect(inB.classId).toBe(classB.id);

    const rows = await db
      .select()
      .from(schema.attendanceRecords)
      .where(
        and(
          eq(schema.attendanceRecords.studentId, student.id),
          eq(schema.attendanceRecords.attendanceDate, '2026-09-15'),
        ),
      );
    expect(rows).toHaveLength(2);
  });

  it('allows the same Class + Student on different dates', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const student = await createStudent(school.id);

    await createAttendance(school.id, student.id, klass.id, year.id, '2026-09-15');
    await createAttendance(school.id, student.id, klass.id, year.id, '2026-09-16');
    await createAttendance(school.id, student.id, klass.id, year.id, '2026-09-17');

    const rows = await db
      .select()
      .from(schema.attendanceRecords)
      .where(eq(schema.attendanceRecords.studentId, student.id));
    expect(rows).toHaveLength(3);
  });
});

describe('attendance_records — statuses (Task 007 §23.11–§23.15)', () => {
  it.each(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const)('accepts the %s status', async (status) => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const student = await createStudent(school.id);

    const record = await createAttendance(school.id, student.id, klass.id, year.id, '2026-09-15', status);

    expect(record.status).toBe(status);
  });

  it('rejects an invalid status', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const student = await createStudent(school.id);

    await expect(
      db.execute(
        sql`INSERT INTO attendance_records (school_id, student_id, class_id, academic_year_id, attendance_date, status)
            VALUES (${school.id}, ${student.id}, ${klass.id}, ${year.id}, '2026-09-15', 'SICK')`,
      ),
    ).rejects.toThrow();
  });

  it('allows a status correction without deleting the record (ABSENT → EXCUSED)', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const student = await createStudent(school.id);
    const record = await createAttendance(school.id, student.id, klass.id, year.id, '2026-09-15', 'ABSENT');

    const [corrected] = await db
      .update(schema.attendanceRecords)
      .set({ status: 'EXCUSED' })
      .where(eq(schema.attendanceRecords.id, record.id))
      .returning();

    expect(corrected.status).toBe('EXCUSED');

    const rows = await db
      .select()
      .from(schema.attendanceRecords)
      .where(eq(schema.attendanceRecords.studentId, student.id));
    expect(rows).toHaveLength(1);
  });
});

describe('attendance_records — historical integrity (Task 007 §23.16–§23.19)', () => {
  it('attendance stays linked to the historical Class after a Student transfer', async () => {
    const school = await createSchool('School A');
    const { year, version, level, klass: classA } = await academicContext(school.id, '2025/2026', 'Class A');
    const classB = await addClass(school.id, year, level.id, version.id, 'Class B');
    const student = await createStudent(school.id);

    const enrollmentA = await createEnrollment(school.id, student.id, year.id, classA.id);
    const attendance = await createAttendance(school.id, student.id, classA.id, year.id, '2026-09-10');

    // Transfer: end enrollment A, create enrollment B.
    await db
      .update(schema.studentEnrollments)
      .set({ status: 'ENDED', effectiveUntil: '2025-11-01' })
      .where(eq(schema.studentEnrollments.id, enrollmentA.id));
    await createEnrollment(school.id, student.id, year.id, classB.id);

    const historical = await db
      .select()
      .from(schema.attendanceRecords)
      .where(eq(schema.attendanceRecords.id, attendance.id));
    expect(historical).toHaveLength(1);
    expect(historical[0].classId).toBe(classA.id);
    expect(historical[0].academicYearId).toBe(year.id);
  });

  it('ending a StudentEnrollment does not delete attendance', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const student = await createStudent(school.id);
    const enrollment = await createEnrollment(school.id, student.id, year.id, klass.id);
    const attendance = await createAttendance(school.id, student.id, klass.id, year.id, '2026-09-10');

    await db
      .update(schema.studentEnrollments)
      .set({ status: 'ENDED', effectiveUntil: '2025-11-01' })
      .where(eq(schema.studentEnrollments.id, enrollment.id));

    const rows = await db
      .select()
      .from(schema.attendanceRecords)
      .where(eq(schema.attendanceRecords.id, attendance.id));
    expect(rows).toHaveLength(1);
  });

  it('closing a Class does not delete attendance', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const student = await createStudent(school.id);
    const attendance = await createAttendance(school.id, student.id, klass.id, year.id, '2026-09-10');

    await db.update(schema.classes).set({ status: 'CLOSED' }).where(eq(schema.classes.id, klass.id));

    const rows = await db
      .select()
      .from(schema.attendanceRecords)
      .where(eq(schema.attendanceRecords.id, attendance.id));
    expect(rows).toHaveLength(1);
  });

  it('ending a TeacherAssignment does not delete attendance', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const student = await createStudent(school.id);
    const teacher = await createTeacher(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const assignment = await createAssignment(school.id, teacher.id, klass.id, subject.id, year.id);
    const attendance = await createAttendance(school.id, student.id, klass.id, year.id, '2026-09-10');

    await db
      .update(schema.teacherAssignments)
      .set({ status: 'ENDED', effectiveUntil: '2025-12-01' })
      .where(eq(schema.teacherAssignments.id, assignment.id));

    const rows = await db
      .select()
      .from(schema.attendanceRecords)
      .where(eq(schema.attendanceRecords.id, attendance.id));
    expect(rows).toHaveLength(1);
  });
});

describe('attendance_records — delete behavior (Task 007 §23.20–§23.22)', () => {
  it('restricts deleting a School that still has AttendanceRecords', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const student = await createStudent(school.id);
    await createAttendance(school.id, student.id, klass.id, year.id);

    await expect(db.delete(schema.schools).where(eq(schema.schools.id, school.id))).rejects.toThrow();
  });

  it('restricts deleting a Student that still has AttendanceRecords', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const student = await createStudent(school.id);
    await createAttendance(school.id, student.id, klass.id, year.id);

    await expect(db.delete(schema.students).where(eq(schema.students.id, student.id))).rejects.toThrow();
  });

  it('restricts deleting a Class that still has AttendanceRecords', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const student = await createStudent(school.id);
    await createAttendance(school.id, student.id, klass.id, year.id);

    await expect(db.delete(schema.classes).where(eq(schema.classes.id, klass.id))).rejects.toThrow();
  });
});