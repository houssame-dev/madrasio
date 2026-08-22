import type { Role } from '@/lib/authorization/roles';
import {
  requireOperation, resolveCurrentContext, type AuthorizationDb,
} from '@/lib/authorization/server';
import { ForbiddenError } from '@/lib/errors';

import type {
  EndEnrollment, EnrollmentCreate, PageInput, PageResult, StudentCreate,
  StudentPatch, TransferStudent,
} from '../domain/contracts';
import { assertStudentStatusTransition, previousCalendarDay } from '../domain/lifecycle';
import * as repo from '../infrastructure/repositories/student-repository';
import type { StudentFilters, StudentsDb } from '../infrastructure/repositories/student-repository';
import { isUniqueViolation, StudentDomainError } from './student-errors';

export interface Actor { userId: string | null; schoolId: string }

function paging(input: PageInput) {
  return { limit: input.pageSize, offset: (input.page - 1) * input.pageSize };
}
function page<T>(rows: T[], total: number, input: PageInput): PageResult<T> {
  return { data: rows, meta: { page: input.page, pageSize: input.pageSize, total } };
}
function view<T extends { schoolId?: string }>(row: T): Omit<T, 'schoolId'> {
  const { schoolId: _schoolId, ...data } = row;
  return data;
}
function studentNotFound(): never {
  throw new StudentDomainError('STUDENT_NOT_FOUND', 'Student was not found.');
}
function enrollmentNotFound(): never {
  throw new StudentDomainError('ENROLLMENT_NOT_FOUND', 'Student enrollment was not found.');
}

async function authorize(db: StudentsDb, actor: Actor, permission: 'students.read' | 'students.manage') {
  await requireOperation(db as unknown as AuthorizationDb, actor, {
    permission,
    scope: { kind: 'school' },
  });
  const context = await resolveCurrentContext(db as unknown as AuthorizationDb, actor);
  return context.role as Role;
}

async function readRole(db: StudentsDb, actor: Actor) {
  return authorize(db, actor, 'students.read');
}
async function manage(db: StudentsDb, actor: Actor) {
  await authorize(db, actor, 'students.manage');
}

async function assertStudentReadable(
  db: StudentsDb,
  actor: Actor,
  studentId: string,
  role?: Role,
) {
  const resolvedRole = role ?? await readRole(db, actor);
  const student = await repo.findStudent(db, actor.schoolId, studentId);
  if (!student) studentNotFound();

  if (resolvedRole === 'SCHOOL_ADMIN' || resolvedRole === 'SUPER_ADMIN') return student;
  if (!actor.userId) studentNotFound();
  if (resolvedRole === 'TEACHER') {
    if (await repo.teacherCanReadStudent(db, actor.userId, actor.schoolId, studentId)) return student;
    studentNotFound();
  }
  if (resolvedRole === 'PARENT') {
    if (await repo.parentCanReadStudent(db, actor.userId, actor.schoolId, studentId)) return student;
    studentNotFound();
  }
  studentNotFound();
}

export async function listStudents(
  db: StudentsDb,
  actor: Actor,
  input: PageInput & StudentFilters,
) {
  const role = await readRole(db, actor);
  if (input.classId && !input.academicYearId) {
    throw new StudentDomainError(
      'INVALID_ACADEMIC_CONTEXT',
      'classId requires an explicit academicYearId filter.',
    );
  }
  if (role === 'PARENT') throw new ForbiddenError('Parents cannot access the general Student list.');
  const result = role === 'TEACHER'
    ? await repo.listTeacherStudents(db, actor.userId!, actor.schoolId, paging(input), input)
    : await repo.listStudents(db, actor.schoolId, paging(input), input);
  return page(result.rows.map(view), result.total, input);
}

export async function getStudent(db: StudentsDb, actor: Actor, id: string) {
  const student = await assertStudentReadable(db, actor, id);
  return view(student);
}

export async function createStudent(db: StudentsDb, actor: Actor, input: StudentCreate) {
  await manage(db, actor);
  try {
    return view(await repo.insertStudent(db, actor.schoolId, input));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new StudentDomainError(
        'DUPLICATE_STUDENT_CODE',
        'The Student code is already in use in this School.',
      );
    }
    throw error;
  }
}

export async function patchStudent(db: StudentsDb, actor: Actor, id: string, input: StudentPatch) {
  await manage(db, actor);
  const current = await repo.findStudent(db, actor.schoolId, id);
  if (!current) studentNotFound();
  if (input.status) assertStudentStatusTransition(current.status, input.status);
  try {
    return view((await repo.updateStudent(db, actor.schoolId, id, input)) ?? studentNotFound());
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new StudentDomainError(
        'DUPLICATE_STUDENT_CODE',
        'The Student code is already in use in this School.',
      );
    }
    throw error;
  }
}

async function assertPlacementTarget(
  db: StudentsDb,
  actor: Actor,
  academicYearId: string,
  classId: string,
) {
  const year = await repo.findAcademicYear(db, actor.schoolId, academicYearId);
  const klass = await repo.findClass(db, actor.schoolId, classId);
  if (!year || !klass) {
    throw new StudentDomainError(
      'INVALID_ACADEMIC_CONTEXT',
      'AcademicYear or Class is not available in the current School.',
    );
  }
  if (klass.academicYearId !== academicYearId) {
    throw new StudentDomainError(
      'INVALID_ACADEMIC_CONTEXT',
      'The Class does not belong to the requested AcademicYear.',
    );
  }
  if (klass.status !== 'ACTIVE') {
    throw new StudentDomainError(
      'INVALID_ACADEMIC_CONTEXT',
      'New placement requires an ACTIVE Class.',
    );
  }
  if (year.status !== 'PLANNED' && year.status !== 'ACTIVE') {
    throw new StudentDomainError(
      'INVALID_ACADEMIC_CONTEXT',
      'New placement is not allowed in a CLOSED or ARCHIVED AcademicYear.',
    );
  }
  return { year, klass };
}

async function requireEnrollableStudent(db: StudentsDb, actor: Actor, studentId: string) {
  const student = await repo.findStudent(db, actor.schoolId, studentId);
  if (!student) studentNotFound();
  if (student.status !== 'ACTIVE') {
    throw new StudentDomainError(
      'STUDENT_NOT_ENROLLABLE',
      'Only an ACTIVE Student may be enrolled or transferred.',
    );
  }
  return student;
}

export async function createEnrollment(
  db: StudentsDb,
  actor: Actor,
  studentId: string,
  input: EnrollmentCreate,
) {
  await manage(db, actor);
  await requireEnrollableStudent(db, actor, studentId);
  await assertPlacementTarget(db, actor, input.academicYearId, input.classId);
  if (await repo.findActiveEnrollment(db, actor.schoolId, studentId, input.academicYearId)) {
    throw new StudentDomainError(
      'DUPLICATE_ENROLLMENT',
      'The Student already has an ACTIVE enrollment in this AcademicYear.',
    );
  }
  try {
    return view(await repo.insertEnrollment(db, {
      schoolId: actor.schoolId,
      studentId,
      academicYearId: input.academicYearId,
      classId: input.classId,
      effectiveFrom: input.effectiveFrom,
      status: 'ACTIVE',
    }));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new StudentDomainError(
        'DUPLICATE_ENROLLMENT',
        'A concurrent ACTIVE enrollment already exists for this Student and AcademicYear.',
      );
    }
    throw error;
  }
}

export async function transferStudent(
  db: StudentsDb,
  actor: Actor,
  studentId: string,
  input: TransferStudent,
) {
  await manage(db, actor);
  await requireEnrollableStudent(db, actor, studentId);
  await assertPlacementTarget(db, actor, input.academicYearId, input.toClassId);

  try {
    return await db.transaction(async (tx) => {
      const source = await repo.findActiveEnrollment(
        tx as StudentsDb,
        actor.schoolId,
        studentId,
        input.academicYearId,
      );
      if (!source) enrollmentNotFound();
      if (source.classId === input.toClassId) {
        throw new StudentDomainError(
          'SAME_CLASS_TRANSFER',
          'The target Class must differ from the current Class.',
        );
      }
      if (input.effectiveDate <= source.effectiveFrom) {
        throw new StudentDomainError(
          'INVALID_TRANSFER_DATE',
          'Transfer effectiveDate must be after the current enrollment effectiveFrom.',
        );
      }

      const ended = await repo.endEnrollmentIfActive(
        tx as StudentsDb,
        actor.schoolId,
        source.id,
        previousCalendarDay(input.effectiveDate),
      );
      if (!ended) {
        throw new StudentDomainError(
          'ENROLLMENT_CONFLICT',
          'The active enrollment changed during transfer. Retry the operation.',
        );
      }
      const created = await repo.insertEnrollment(tx as StudentsDb, {
        schoolId: actor.schoolId,
        studentId,
        academicYearId: input.academicYearId,
        classId: input.toClassId,
        effectiveFrom: input.effectiveDate,
        status: 'ACTIVE',
      });
      return { previousEnrollment: view(ended), currentEnrollment: view(created) };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new StudentDomainError(
        'ENROLLMENT_CONFLICT',
        'A concurrent enrollment or transfer won the race. No partial transfer was committed.',
      );
    }
    throw error;
  }
}

export async function endEnrollment(
  db: StudentsDb,
  actor: Actor,
  enrollmentId: string,
  input: EndEnrollment,
) {
  await manage(db, actor);
  const current = await repo.findEnrollment(db, actor.schoolId, enrollmentId);
  if (!current) enrollmentNotFound();
  if (current.status === 'ENDED') return view(current);
  if (input.effectiveUntil < current.effectiveFrom) {
    throw new StudentDomainError(
      'INVALID_TRANSFER_DATE',
      'effectiveUntil must be on or after effectiveFrom.',
    );
  }
  const ended = await repo.endEnrollmentIfActive(
    db,
    actor.schoolId,
    enrollmentId,
    input.effectiveUntil,
  );
  if (ended) return view(ended);
  const raced = await repo.findEnrollment(db, actor.schoolId, enrollmentId);
  if (raced?.status === 'ENDED') return view(raced);
  throw new StudentDomainError(
    'ENROLLMENT_CONFLICT',
    'The enrollment changed while it was being ended.',
  );
}

export async function listEnrollmentHistory(
  db: StudentsDb,
  actor: Actor,
  studentId: string,
  input: PageInput & { academicYearId?: string },
) {
  const role = await readRole(db, actor);
  if (role !== 'SCHOOL_ADMIN' && role !== 'SUPER_ADMIN') {
    throw new ForbiddenError('Enrollment history is restricted to School administrators.');
  }
  if (!await repo.findStudent(db, actor.schoolId, studentId)) studentNotFound();
  const result = await repo.listEnrollments(
    db,
    actor.schoolId,
    studentId,
    paging(input),
    input.academicYearId,
  );
  return page(result.rows.map(view), result.total, input);
}

export async function getCurrentEnrollment(
  db: StudentsDb,
  actor: Actor,
  studentId: string,
  academicYearId: string,
) {
  const role = await readRole(db, actor);
  const student = await repo.findStudent(db, actor.schoolId, studentId);
  if (!student) studentNotFound();
  const enrollment = await repo.findActiveEnrollment(
    db,
    actor.schoolId,
    studentId,
    academicYearId,
  );

  if (role === 'TEACHER') {
    if (!actor.userId || !enrollment || !await repo.teacherCanReadPlacement(
      db,
      actor.userId,
      actor.schoolId,
      enrollment.classId,
      enrollment.academicYearId,
    )) studentNotFound();
  } else if (role === 'PARENT') {
    if (!actor.userId || !await repo.parentCanReadStudent(
      db,
      actor.userId,
      actor.schoolId,
      studentId,
    )) studentNotFound();
  }

  return enrollment ? view(enrollment) : null;
}

/** Date-based history lookup used by Attendance and future historical policies. */
export async function getEnrollmentOnDate(
  db: StudentsDb,
  actor: Actor,
  input: { studentId: string; classId: string; date: string },
) {
  await manage(db, actor);
  const enrollment = await repo.findEnrollmentOnDate(
    db,
    actor.schoolId,
    input.studentId,
    input.classId,
    input.date,
  );
  return enrollment ? view(enrollment) : null;
}
