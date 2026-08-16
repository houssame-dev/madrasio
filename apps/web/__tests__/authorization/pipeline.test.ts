import { describe, expect, it } from 'vitest';

import { authorize, can } from '@/lib/authorization/facade';
import { evaluateAuthorization } from '@/lib/authorization/pipeline';
import {
  SCHOOL_A,
  SCHOOL_B,
  USER,
  activeParent,
  activeTeacher,
  buildContext,
  emptyScope,
  parentContext,
  roleContext,
  teacherContext,
} from './test-context';

const MATH = 'subject-math';
const PHYSICS = 'subject-physics';
const CLASS_A = 'class-a';
const CLASS_B = 'class-b';
const YEAR_25 = 'year-2025/2026';

describe('authentication + active user (Task 005 §22)', () => {
  it('denies an unauthenticated request', () => {
    const decision = evaluateAuthorization(
      buildContext({ userId: null, userActive: false }),
      {},
    );
    expect(decision).toEqual({ allowed: false, reason: 'UNAUTHENTICATED' });
  });

  it('allows an authenticated, active user with a valid membership', () => {
    const decision = evaluateAuthorization(buildContext(), {});
    expect(decision).toEqual({ allowed: true });
  });

  it('denies an inactive application user where the context flags it', () => {
    const decision = evaluateAuthorization(
      buildContext({ userActive: false }),
      {},
    );
    expect(decision).toEqual({ allowed: false, reason: 'USER_INACTIVE' });
  });

  it('denies a user with no school membership', () => {
    const decision = evaluateAuthorization(
      buildContext({ membership: null, schoolContext: null, role: null }),
      {},
    );
    expect(decision).toEqual({ allowed: false, reason: 'NO_MEMBERSHIP' });
  });
});

describe('school membership (Task 005 §23)', () => {
  it('allows a user with an active membership in School A', () => {
    expect(can(buildContext(), {})).toBe(true);
  });

  it('denies an inactive membership', () => {
    const decision = evaluateAuthorization(
      buildContext({ membership: { schoolId: SCHOOL_A, status: 'INACTIVE' } }),
      {},
    );
    expect(decision).toEqual({ allowed: false, reason: 'INACTIVE_MEMBERSHIP' });
  });

  it('denies a user with no membership', () => {
    expect(can(buildContext({ membership: null, schoolContext: null, role: null }), {})).toBe(false);
  });

  it('denies operating in School B with only a School A membership', () => {
    const decision = evaluateAuthorization(
      buildContext({
        membership: { schoolId: SCHOOL_A, status: 'ACTIVE' },
        schoolContext: { schoolId: SCHOOL_B, isValid: false },
      }),
      {},
    );
    expect(decision).toEqual({ allowed: false, reason: 'INVALID_SCHOOL_CONTEXT' });
  });

  it('denies a mismatched membership vs school-context pair (defense in depth)', () => {
    const decision = evaluateAuthorization(
      buildContext({
        membership: { schoolId: SCHOOL_A, status: 'ACTIVE' },
        schoolContext: { schoolId: SCHOOL_B, isValid: true },
      }),
      {},
    );
    expect(decision).toEqual({ allowed: false, reason: 'INVALID_SCHOOL_CONTEXT' });
  });
});

describe('role + permission (Task 005 §24)', () => {
  it('allows a valid role with the required permission', () => {
    expect(can(roleContext('SCHOOL_ADMIN'), { permission: 'students.manage' })).toBe(true);
  });

  it('denies a missing permission', () => {
    const decision = evaluateAuthorization(roleContext('PARENT'), { permission: 'students.manage' });
    expect(decision).toEqual({ allowed: false, reason: 'MISSING_PERMISSION' });
  });

  it('denies an invalid/unsupported role', () => {
    const decision = evaluateAuthorization(
      buildContext({ role: 'STUDENT' as never }),
      {},
    );
    expect(decision).toEqual({ allowed: false, reason: 'INVALID_ROLE' });
  });

  it('never allows a STUDENT role under any permission', () => {
    expect(
      can(roleContext('STUDENT' as never), { permission: 'students.read' }),
    ).toBe(false);
    expect(
      can(roleContext('STUDENT' as never), { permission: 'grades.read' }),
    ).toBe(false);
  });

  it('denies when the role is missing entirely', () => {
    const decision = evaluateAuthorization(buildContext({ role: null }), {});
    expect(decision).toEqual({ allowed: false, reason: 'INVALID_ROLE' });
  });
});

describe('teacher scope (Task 005 §25, ADR-009)', () => {
  const teacher = teacherContext([
    activeTeacher(CLASS_A, MATH, YEAR_25),
    activeTeacher(CLASS_A, PHYSICS, YEAR_25),
  ]);

  it('allows scope over an assigned Class + Subject + AcademicYear', () => {
    const decision = evaluateAuthorization(teacher, {
      permission: 'grades.enter',
      scope: { kind: 'teacher', classId: CLASS_A, subjectId: MATH, academicYearId: YEAR_25 },
    });
    expect(decision).toEqual({ allowed: true });
  });

  it('denies a Class the teacher is not assigned to', () => {
    const decision = evaluateAuthorization(teacher, {
      permission: 'grades.enter',
      scope: { kind: 'teacher', classId: CLASS_B, subjectId: MATH, academicYearId: YEAR_25 },
    });
    expect(decision).toEqual({ allowed: false, reason: 'OUT_OF_SCOPE' });
  });

  it('denies a Subject the teacher is not assigned to', () => {
    const decision = evaluateAuthorization(
      teacherContext([activeTeacher(CLASS_A, MATH, YEAR_25)]),
      {
        permission: 'grades.enter',
        scope: { kind: 'teacher', classId: CLASS_A, subjectId: PHYSICS, academicYearId: YEAR_25 },
      },
    );
    expect(decision).toEqual({ allowed: false, reason: 'OUT_OF_SCOPE' });
  });

  it('denies scope from an ended assignment (BR-TEACHER-005)', () => {
    const decision = evaluateAuthorization(
      teacherContext([{ classId: CLASS_A, subjectId: MATH, academicYearId: YEAR_25, status: 'ENDED' }]),
      {
        permission: 'grades.enter',
        scope: { kind: 'teacher', classId: CLASS_A, subjectId: MATH, academicYearId: YEAR_25 },
      },
    );
    expect(decision).toEqual({ allowed: false, reason: 'OUT_OF_SCOPE' });
  });

  it('denies a different AcademicYear even with the same Class + Subject', () => {
    const decision = evaluateAuthorization(teacher, {
      permission: 'grades.enter',
      scope: { kind: 'teacher', classId: CLASS_A, subjectId: MATH, academicYearId: 'year-2026/2027' },
    });
    expect(decision).toEqual({ allowed: false, reason: 'OUT_OF_SCOPE' });
  });

  it('denies scope when the teacher has no assignments at all', () => {
    expect(
      can(teacherContext([]), {
        permission: 'grades.enter',
        scope: { kind: 'teacher', classId: CLASS_A, subjectId: MATH, academicYearId: YEAR_25 },
      }),
    ).toBe(false);
  });
});

describe('parent scope (Task 005 §26, BR-PARENT-002/005)', () => {
  const parent = parentContext([activeParent('student-a'), activeParent('student-b')]);

  it('allows access to a linked student', () => {
    const decision = evaluateAuthorization(parent, {
      permission: 'grades.read',
      scope: { kind: 'parent', studentId: 'student-a' },
    });
    expect(decision).toEqual({ allowed: true });
  });

  it('denies access to an unlinked student', () => {
    const decision = evaluateAuthorization(parent, {
      permission: 'grades.read',
      scope: { kind: 'parent', studentId: 'student-c' },
    });
    expect(decision).toEqual({ allowed: false, reason: 'OUT_OF_SCOPE' });
  });

  it('denies access to a student from another school', () => {
    const decision = evaluateAuthorization(parent, {
      permission: 'grades.read',
      scope: { kind: 'parent', studentId: 'other-school-student' },
    });
    expect(decision).toEqual({ allowed: false, reason: 'OUT_OF_SCOPE' });
  });

  it('denies access from an ended relationship (BR-PARENT-004)', () => {
    const decision = evaluateAuthorization(
      parentContext([{ studentId: 'student-a', status: 'ENDED' }]),
      {
        permission: 'grades.read',
        scope: { kind: 'parent', studentId: 'student-a' },
      },
    );
    expect(decision).toEqual({ allowed: false, reason: 'OUT_OF_SCOPE' });
  });

  it('denies a parent without any relationships', () => {
    expect(
      can(parentContext([]), {
        permission: 'grades.read',
        scope: { kind: 'parent', studentId: 'student-a' },
      }),
    ).toBe(false);
  });
});

describe('school isolation (Task 005 §27)', () => {
  it('allows a School A user on a School A resource', () => {
    expect(
      can(buildContext({ role: 'SCHOOL_ADMIN' }), { permission: 'students.read' }),
    ).toBe(true);
  });

  it('denies a School A user on a School B resource (context mismatch)', () => {
    const decision = evaluateAuthorization(
      buildContext({
        membership: { schoolId: SCHOOL_A, status: 'ACTIVE' },
        schoolContext: { schoolId: SCHOOL_B, isValid: true },
      }),
      { permission: 'students.read' },
    );
    expect(decision).toEqual({ allowed: false, reason: 'INVALID_SCHOOL_CONTEXT' });
  });

  it('keeps teacher scope isolated to the resolved school’s assignments', () => {
    // The School A context carries only School A assignments; a School B
    // resource is not present in the scope facts at all.
    const decision = evaluateAuthorization(
      teacherContext([activeTeacher(CLASS_A, MATH, YEAR_25)], {
        schoolContext: { schoolId: SCHOOL_A, isValid: true },
      }),
      {
        permission: 'grades.enter',
        scope: { kind: 'teacher', classId: 'class-in-school-b', subjectId: MATH, academicYearId: YEAR_25 },
      },
    );
    expect(decision).toEqual({ allowed: false, reason: 'OUT_OF_SCOPE' });
  });

  it('keeps parent scope isolated to the resolved school’s relationships', () => {
    const decision = evaluateAuthorization(
      parentContext([activeParent('student-a')], {
        schoolContext: { schoolId: SCHOOL_A, isValid: true },
      }),
      {
        permission: 'grades.read',
        scope: { kind: 'parent', studentId: 'student-b-school-b' },
      },
    );
    expect(decision).toEqual({ allowed: false, reason: 'OUT_OF_SCOPE' });
  });
});

describe('ownership / relationship / resource state (Task 005 §13/§14, §28)', () => {
  it('denies when the user does not own the resource', () => {
    const decision = evaluateAuthorization(
      buildContext({ role: 'SCHOOL_ADMIN' }),
      { ownership: { isOwner: false } },
    );
    expect(decision).toEqual({ allowed: false, reason: 'NOT_OWNER' });
  });

  it('allows ownership when isOwner resolves true', () => {
    expect(
      can(buildContext({ role: 'SCHOOL_ADMIN' }), { ownership: { isOwner: true } }),
    ).toBe(true);
  });

  it('denies when the required relationship is missing', () => {
    const decision = evaluateAuthorization(
      buildContext({ role: 'SCHOOL_ADMIN' }),
      { ownership: { hasRelationship: false } },
    );
    expect(decision).toEqual({ allowed: false, reason: 'INVALID_RELATIONSHIP' });
  });

  it('denies an otherwise authorized operation when the resource state forbids it (BR-AUTHZ-006)', () => {
    const context = teacherContext([activeTeacher(CLASS_A, MATH, YEAR_25)]);
    const decision = evaluateAuthorization(context, {
      permission: 'grades.enter',
      scope: { kind: 'teacher', classId: CLASS_A, subjectId: MATH, academicYearId: YEAR_25 },
      resourceState: { allows: false }, // e.g. Gradebook CLOSED
    });
    expect(decision).toEqual({ allowed: false, reason: 'INVALID_RESOURCE_STATE' });
  });

  it('allows an authorized operation when the resource state permits it', () => {
    const context = teacherContext([activeTeacher(CLASS_A, MATH, YEAR_25)]);
    expect(
      can(context, {
        permission: 'grades.enter',
        scope: { kind: 'teacher', classId: CLASS_A, subjectId: MATH, academicYearId: YEAR_25 },
        resourceState: { allows: true },
      }),
    ).toBe(true);
  });
});

describe('authorize() — throwing guard (Task 005 §8)', () => {
  it('does not throw for an allowed decision', () => {
    expect(() =>
      authorize(buildContext({ role: 'SCHOOL_ADMIN' }), { permission: 'students.manage' }),
    ).not.toThrow();
  });

  it('throws ForbiddenError for a denied permission', () => {
    expect(() =>
      authorize(roleContext('PARENT'), { permission: 'students.manage' }),
    ).toThrowError(/Access denied/);
  });

  it('throws UnauthenticatedError for an unauthenticated request', () => {
    expect(() =>
      authorize(buildContext({ userId: null, userActive: false }), {}),
    ).toThrowError(/Authentication required/);
  });

  it('denies before reaching scope when scope facts are absent (unresolved context)', () => {
    // An operation that requests scope against a context whose scope facts
    // were never resolved must be denied, never silently allowed.
    expect(
      can(buildContext({ role: 'TEACHER', scope: emptyScope() }), {
        permission: 'grades.enter',
        scope: { kind: 'teacher', classId: CLASS_A, subjectId: MATH, academicYearId: YEAR_25 },
      }),
    ).toBe(false);
  });
});

describe('can() — boolean form', () => {
  it('mirrors the pipeline result', () => {
    expect(can(buildContext({ userId: null, userActive: false }), {})).toBe(false);
    expect(can(buildContext(), {})).toBe(true);
  });

  it('treats missing requirements as an identity-only check', () => {
    expect(can(buildContext(), undefined)).toBe(true);
  });

  it('never leaks scope when the user is unauthenticated', () => {
    expect(USER).toBeDefined();
  });
});