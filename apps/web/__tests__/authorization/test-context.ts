import type { CurrentContext } from '@/lib/authorization/context';
import type { Role } from '@/lib/authorization/roles';
import type { ScopeSummary, TeacherAssignmentScope, ParentStudentScope } from '@/lib/authorization/context';

const SCHOOL_A = 'school-a';
const SCHOOL_B = 'school-b';
const USER = 'user-1';

export function buildContext(
  overrides: Partial<CurrentContext> = {},
): CurrentContext {
  return {
    userId: USER,
    userActive: true,
    membership: { schoolId: SCHOOL_A, status: 'ACTIVE' },
    schoolContext: { schoolId: SCHOOL_A, isValid: true },
    role: 'SCHOOL_ADMIN',
    scope: emptyScope(),
    ...overrides,
  };
}

export function emptyScope(): ScopeSummary {
  return { teacherAssignments: [], parentStudents: [] };
}

export function teacherContext(
  assignments: TeacherAssignmentScope[],
  overrides: Partial<CurrentContext> = {},
): CurrentContext {
  return buildContext({
    role: 'TEACHER',
    scope: { ...emptyScope(), teacherAssignments: assignments },
    ...overrides,
  });
}

export function parentContext(
  relationships: ParentStudentScope[],
  overrides: Partial<CurrentContext> = {},
): CurrentContext {
  return buildContext({
    role: 'PARENT',
    scope: { ...emptyScope(), parentStudents: relationships },
    ...overrides,
  });
}

export function activeTeacher(
  classId: string,
  subjectId: string,
  academicYearId: string,
): TeacherAssignmentScope {
  return { classId, subjectId, academicYearId, status: 'ACTIVE' };
}

export function activeParent(studentId: string): ParentStudentScope {
  return { studentId, status: 'ACTIVE' };
}

export function roleContext(role: Role, overrides: Partial<CurrentContext> = {}): CurrentContext {
  return buildContext({ role, ...overrides });
}

export { SCHOOL_A, SCHOOL_B, USER };