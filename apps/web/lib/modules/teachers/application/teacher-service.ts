import type { Role } from '@/lib/authorization/roles';
import {
  requireOperation, resolveCurrentContext, type AuthorizationDb,
} from '@/lib/authorization/server';

import type {
  AssignmentCreate, EndAssignment, PageInput, PageResult, TeacherCreate, TeacherPatch,
} from '../domain/contracts';
import { assertTeacherStatusTransition } from '../domain/lifecycle';
import * as repo from '../infrastructure/repositories/teacher-repository';
import type {
  AssignmentFilters, TeacherFilters, TeachersDb,
} from '../infrastructure/repositories/teacher-repository';
import { isUniqueViolation, TeacherDomainError } from './teacher-errors';

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
function teacherNotFound(): never {
  throw new TeacherDomainError('TEACHER_NOT_FOUND', 'Teacher was not found.');
}
function assignmentNotFound(): never {
  throw new TeacherDomainError('ASSIGNMENT_NOT_FOUND', 'Teacher assignment was not found.');
}

async function authorize(
  db: TeachersDb,
  actor: Actor,
  permission: 'teachers.read' | 'teachers.manage',
) {
  await requireOperation(db as unknown as AuthorizationDb, actor, {
    permission,
    scope: { kind: 'school' },
  });
  const context = await resolveCurrentContext(db as unknown as AuthorizationDb, actor);
  return context.role as Role;
}
async function read(db: TeachersDb, actor: Actor) {
  return authorize(db, actor, 'teachers.read');
}
async function manage(db: TeachersDb, actor: Actor) {
  await authorize(db, actor, 'teachers.manage');
}

async function assertTeacherReadable(
  db: TeachersDb,
  actor: Actor,
  teacherId: string,
  role?: Role,
) {
  const resolvedRole = role ?? await read(db, actor);
  const teacher = await repo.findTeacher(db, actor.schoolId, teacherId);
  if (!teacher) teacherNotFound();
  if (resolvedRole === 'SCHOOL_ADMIN' || resolvedRole === 'SUPER_ADMIN') return teacher;
  if (resolvedRole === 'TEACHER' && actor.userId && teacher.userId === actor.userId) return teacher;
  teacherNotFound();
}

async function assertValidUserLink(db: TeachersDb, actor: Actor, userId: string) {
  const [user, membership] = await Promise.all([
    repo.findUser(db, userId),
    repo.findMembership(db, actor.schoolId, userId),
  ]);
  if (!user || user.status !== 'ACTIVE' || !membership || membership.status !== 'ACTIVE') {
    throw new TeacherDomainError(
      'INVALID_USER_LINK',
      'Teacher userId must identify an ACTIVE User with an ACTIVE membership in this School.',
    );
  }
}

export async function listTeachers(
  db: TeachersDb,
  actor: Actor,
  input: PageInput & TeacherFilters,
) {
  const role = await read(db, actor);
  const result = await repo.listTeachers(
    db,
    actor.schoolId,
    paging(input),
    input,
    role === 'TEACHER' ? actor.userId! : undefined,
  );
  return page(result.rows.map(view), result.total, input);
}

export async function getTeacher(db: TeachersDb, actor: Actor, id: string) {
  return view(await assertTeacherReadable(db, actor, id));
}

export async function createTeacher(db: TeachersDb, actor: Actor, input: TeacherCreate) {
  await manage(db, actor);
  if (input.userId) await assertValidUserLink(db, actor, input.userId);
  try {
    return view(await repo.insertTeacher(db, actor.schoolId, input));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TeacherDomainError(
        'DUPLICATE_TEACHER_CODE',
        'The Teacher code is already in use in this School.',
      );
    }
    throw error;
  }
}

export async function patchTeacher(
  db: TeachersDb,
  actor: Actor,
  id: string,
  input: TeacherPatch,
) {
  await manage(db, actor);
  const current = await repo.findTeacher(db, actor.schoolId, id);
  if (!current) teacherNotFound();
  if (input.status) assertTeacherStatusTransition(current.status, input.status);
  if (input.userId) await assertValidUserLink(db, actor, input.userId);
  try {
    return view((await repo.updateTeacher(db, actor.schoolId, id, input)) ?? teacherNotFound());
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TeacherDomainError(
        'DUPLICATE_TEACHER_CODE',
        'The Teacher code is already in use in this School.',
      );
    }
    throw error;
  }
}

async function assertAssignmentTarget(
  db: TeachersDb,
  actor: Actor,
  input: AssignmentCreate,
) {
  const [year, klass, subject] = await Promise.all([
    repo.findAcademicYear(db, actor.schoolId, input.academicYearId),
    repo.findClass(db, actor.schoolId, input.classId),
    repo.findSubject(db, actor.schoolId, input.subjectId),
  ]);
  if (!year || !klass || !subject) {
    throw new TeacherDomainError(
      'INVALID_ACADEMIC_CONTEXT',
      'AcademicYear, Class, or Subject is not available in the current School.',
    );
  }
  if (klass.academicYearId !== input.academicYearId) {
    throw new TeacherDomainError(
      'INVALID_ACADEMIC_CONTEXT',
      'The Class does not belong to the requested AcademicYear.',
    );
  }
  if (klass.status !== 'ACTIVE') {
    throw new TeacherDomainError(
      'INVALID_ACADEMIC_CONTEXT',
      'New assignment requires an ACTIVE Class.',
    );
  }
  if (year.status !== 'PLANNED' && year.status !== 'ACTIVE') {
    throw new TeacherDomainError(
      'INVALID_ACADEMIC_CONTEXT',
      'New assignment is not allowed in a CLOSED or ARCHIVED AcademicYear.',
    );
  }
  if (subject.status !== 'ACTIVE') {
    throw new TeacherDomainError(
      'INVALID_ACADEMIC_CONTEXT',
      'New assignment requires an ACTIVE Subject.',
    );
  }
}

export async function createAssignment(
  db: TeachersDb,
  actor: Actor,
  teacherId: string,
  input: AssignmentCreate,
) {
  await manage(db, actor);
  const teacher = await repo.findTeacher(db, actor.schoolId, teacherId);
  if (!teacher) teacherNotFound();
  if (teacher.status !== 'ACTIVE') {
    throw new TeacherDomainError(
      'TEACHER_NOT_ACTIVE',
      'Only an ACTIVE Teacher may receive a new assignment.',
    );
  }
  await assertAssignmentTarget(db, actor, input);
  const identity = { schoolId: actor.schoolId, teacherId, ...input };
  if (await repo.findActiveLogicalAssignment(db, identity)) {
    throw new TeacherDomainError(
      'DUPLICATE_ASSIGNMENT',
      'The Teacher already has this ACTIVE assignment.',
    );
  }
  try {
    return view(await repo.insertAssignment(db, {
      ...identity,
      status: 'ACTIVE',
    }));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TeacherDomainError(
        'DUPLICATE_ASSIGNMENT',
        'A concurrent request already created this ACTIVE assignment.',
      );
    }
    throw error;
  }
}

export async function listAssignmentHistory(
  db: TeachersDb,
  actor: Actor,
  teacherId: string,
  input: PageInput & AssignmentFilters,
) {
  const role = await read(db, actor);
  await assertTeacherReadable(db, actor, teacherId, role);
  const result = await repo.listAssignments(
    db,
    actor.schoolId,
    teacherId,
    paging(input),
    input,
  );
  return page(result.rows.map(view), result.total, input);
}

export async function endAssignment(
  db: TeachersDb,
  actor: Actor,
  assignmentId: string,
  input: EndAssignment,
) {
  await manage(db, actor);
  const current = await repo.findAssignment(db, actor.schoolId, assignmentId);
  if (!current) assignmentNotFound();
  if (current.status === 'ENDED') return view(current);
  if (input.effectiveUntil < current.effectiveFrom) {
    throw new TeacherDomainError(
      'INVALID_ASSIGNMENT_STATE',
      'effectiveUntil must be on or after effectiveFrom.',
    );
  }
  const ended = await repo.endAssignmentIfActive(
    db,
    actor.schoolId,
    assignmentId,
    input.effectiveUntil,
  );
  if (ended) return view(ended);
  const raced = await repo.findAssignment(db, actor.schoolId, assignmentId);
  if (raced?.status === 'ENDED') return view(raced);
  assignmentNotFound();
}
