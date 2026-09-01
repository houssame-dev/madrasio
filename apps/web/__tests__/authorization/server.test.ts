import { authUsers } from 'drizzle-orm/supabase';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import * as schema from '@school/database';

import { authorizeOperation, resolveCurrentContext, resolveParentScope, resolveTeacherScope, requireOperation } from '@/lib/authorization/server';
import { ForbiddenError, UnauthenticatedError } from '@/lib/errors';

import { createAuthzTestDb, type AuthzTestDb } from './test-helpers';

let t: AuthzTestDb;
let db: AuthzTestDb['db'];
let seed: AuthzTestDb['seed'];

async function createAuthUser(id: string = randomUUID()) {
  await seed.insert(authUsers).values({ id, email: `${id}@test.example` });
  return id;
}

async function createUser(id: string = randomUUID()) {
  await createAuthUser(id);
  await seed.insert(schema.users).values({ id, email: `${id}@test.example` });
  return id;
}

async function createSchool(name: string) {
  const [school] = await seed.insert(schema.schools).values({ name }).returning();
  return school;
}

async function createMembership(
  userId: string,
  schoolId: string,
  role: 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'TEACHER' | 'PARENT',
  status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
) {
  const [membership] = await seed
    .insert(schema.schoolMemberships)
    .values({ schoolId, userId, role, status })
    .returning();
  return membership;
}

async function academicContext(schoolId: string, yearName = '2025/2026', className = 'Class A') {
  const [year] = await seed
    .insert(schema.academicYears)
    .values({ schoolId, name: yearName, startDate: '2025-09-01', endDate: '2026-07-01' })
    .returning();
  const [curriculum] = await seed
    .insert(schema.curricula)
    .values({ schoolId, name: 'National Curriculum' })
    .returning();
  const [version] = await seed
    .insert(schema.curriculumVersions)
    .values({ schoolId, curriculumId: curriculum.id, name: '2025-2026' })
    .returning();
  const [stage] = await seed
    .insert(schema.stages)
    .values({ schoolId, name: 'Primary', sequence: 1 })
    .returning();
  const [level] = await seed
    .insert(schema.levels)
    .values({ schoolId, stageId: stage.id, name: '1st Year', sequence: 1 })
    .returning();
  const [klass] = await seed
    .insert(schema.classes)
    .values({ schoolId, academicYearId: year.id, levelId: level.id, curriculumVersionId: version.id, name: className })
    .returning();
  return { year, version, level, klass };
}

async function addClass(schoolId: string, yearId: string, levelId: string, versionId: string, name: string) {
  const [klass] = await seed
    .insert(schema.classes)
    .values({ schoolId, academicYearId: yearId, levelId, curriculumVersionId: versionId, name })
    .returning();
  return klass;
}

async function createSubject(schoolId: string, name: string) {
  const [subject] = await seed.insert(schema.subjects).values({ schoolId, name }).returning();
  return subject;
}

async function createTeacher(schoolId: string, userId: string) {
  const [teacher] = await seed
    .insert(schema.teachers)
    .values({ schoolId, userId, firstName: 'Karim', lastName: 'Alaoui' })
    .returning();
  return teacher;
}

async function createAssignment(
  schoolId: string,
  teacherId: string,
  classId: string,
  subjectId: string,
  academicYearId: string,
  status: 'ACTIVE' | 'ENDED' = 'ACTIVE',
) {
  const [assignment] = await seed
    .insert(schema.teacherAssignments)
    .values({
      schoolId,
      teacherId,
      classId,
      subjectId,
      academicYearId,
      effectiveFrom: '2025-09-01',
      status,
    })
    .returning();
  return assignment;
}

async function createParent(schoolId: string, userId: string) {
  const [parent] = await seed
    .insert(schema.parents)
    .values({ schoolId, userId, firstName: 'Sara', lastName: 'Benali' })
    .returning();
  return parent;
}

async function createStudent(schoolId: string) {
  const [student] = await seed
    .insert(schema.students)
    .values({ schoolId, firstName: 'Amine', lastName: 'Benali' })
    .returning();
  return student;
}

async function linkParentStudent(schoolId: string, parentId: string, studentId: string, status: 'ACTIVE' | 'ENDED' = 'ACTIVE') {
  const [relationship] = await seed
    .insert(schema.parentStudents)
    .values({ schoolId, parentId, studentId, status })
    .returning();
  return relationship;
}

beforeEach(async () => {
  t = await createAuthzTestDb();
  db = t.db;
  seed = t.seed;
});

describe('resolveCurrentContext (Task 005 §2/§3)', () => {
  it('resolves a full context for an authenticated user with an active membership', async () => {
    const user = await createUser();
    const school = await createSchool('School A');
    await createMembership(user, school.id, 'SCHOOL_ADMIN');

    const context = await resolveCurrentContext(db, { userId: user, schoolId: school.id });

    expect(context.userId).toBe(user);
    expect(context.userActive).toBe(true);
    expect(context.membership).toEqual({ schoolId: school.id, status: 'ACTIVE' });
    expect(context.schoolContext).toEqual({ schoolId: school.id, isValid: true });
    expect(context.role).toBe('SCHOOL_ADMIN');
  });

  it('keeps an inactive membership visible so the pipeline reports it', async () => {
    const user = await createUser();
    const school = await createSchool('School A');
    await createMembership(user, school.id, 'TEACHER', 'INACTIVE');

    const context = await resolveCurrentContext(db, { userId: user, schoolId: school.id });

    expect(context.membership).toEqual({ schoolId: school.id, status: 'INACTIVE' });
    const decision = await authorizeOperation(
      db,
      { userId: user, schoolId: school.id },
      {},
    );
    expect(decision).toEqual({ allowed: false, reason: 'INACTIVE_MEMBERSHIP' });
  });

  it('returns an unauthenticated context when there is no user', async () => {
    const context = await resolveCurrentContext(db, { userId: null, schoolId: 'school-x' });
    expect(context.userId).toBeNull();
    expect(context.membership).toBeNull();
    expect(context.schoolContext).toBeNull();
    expect(context.role).toBeNull();
  });

  it('denies a user with no membership in the requested school', async () => {
    const user = await createUser();
    const school = await createSchool('School A');

    const decision = await authorizeOperation(db, { userId: user, schoolId: school.id }, {});
    expect(decision).toEqual({ allowed: false, reason: 'NO_MEMBERSHIP' });
  });

  it('denies operating in School B with only a School A membership', async () => {
    const user = await createUser();
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    await createMembership(user, schoolA.id, 'TEACHER');

    const context = await resolveCurrentContext(db, { userId: user, schoolId: schoolB.id });
    expect(context.membership).toBeNull();
    expect(context.schoolContext).toBeNull();
  });
});

describe('resolveTeacherScope (Task 005 §25, ADR-009)', () => {
  it('returns ACTIVE and ENDED assignments for the user’s teacher profile in the school', async () => {
    const user = await createUser();
    const school = await createSchool('School A');
    await createMembership(user, school.id, 'TEACHER');
    const teacher = await createTeacher(school.id, user);
    const { year, version, level, klass: classA } = await academicContext(school.id);
    const math = await createSubject(school.id, 'Mathematics');
    const physics = await createSubject(school.id, 'Physics');
    await createAssignment(school.id, teacher.id, classA.id, math.id, year.id, 'ACTIVE');
    await createAssignment(school.id, teacher.id, classA.id, physics.id, year.id, 'ENDED');

    const scope = await resolveTeacherScope(db, user, school.id);

    expect(scope).toHaveLength(2);
    expect(scope).toContainEqual({
      classId: classA.id,
      subjectId: math.id,
      academicYearId: year.id,
      status: 'ACTIVE',
    });
    expect(scope).toContainEqual({
      classId: classA.id,
      subjectId: physics.id,
      academicYearId: year.id,
      status: 'ENDED',
    });
    expect(level.id).toBeDefined();
    expect(version.id).toBeDefined();
  });

  it('returns nothing for a user without a teacher profile in the school', async () => {
    const user = await createUser();
    const school = await createSchool('School A');
    const otherTeacher = await createTeacher(school.id, await createUser());
    await createMembership(otherTeacher.userId!, school.id, 'TEACHER');

    const scope = await resolveTeacherScope(db, user, school.id);
    expect(scope).toEqual([]);
  });

  it('keeps scope school-isolated — no assignments leak from another school', async () => {
    const user = await createUser();
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const teacher = await createTeacher(schoolA.id, user);
    const { year, version, level, klass } = await academicContext(schoolA.id);
    const math = await createSubject(schoolA.id, 'Mathematics');
    await createAssignment(schoolA.id, teacher.id, klass.id, math.id, year.id, 'ACTIVE');
    void version;
    void level;

    const scopeB = await resolveTeacherScope(db, user, schoolB.id);
    expect(scopeB).toEqual([]);
  });
});

describe('resolveParentScope (Task 005 §26, BR-PARENT-002)', () => {
  it('returns ACTIVE and ENDED relationships for the user’s parent profile', async () => {
    const user = await createUser();
    const school = await createSchool('School A');
    await createMembership(user, school.id, 'PARENT');
    const parent = await createParent(school.id, user);
    const studentA = await createStudent(school.id);
    const studentB = await createStudent(school.id);
    await linkParentStudent(school.id, parent.id, studentA.id, 'ACTIVE');
    await linkParentStudent(school.id, parent.id, studentB.id, 'ENDED');

    const scope = await resolveParentScope(db, user, school.id);

    expect(scope).toHaveLength(2);
    expect(scope).toContainEqual({ studentId: studentA.id, status: 'ACTIVE' });
    expect(scope).toContainEqual({ studentId: studentB.id, status: 'ENDED' });
  });

  it('keeps parent scope school-isolated', async () => {
    const user = await createUser();
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const parent = await createParent(schoolA.id, user);
    const student = await createStudent(schoolA.id);
    await linkParentStudent(schoolA.id, parent.id, student.id, 'ACTIVE');

    const scopeB = await resolveParentScope(db, user, schoolB.id);
    expect(scopeB).toEqual([]);
  });
});

describe('authorizeOperation — full server flow (Task 005 §25/§26/§27)', () => {
  it('allows a teacher to enter grades within their assignment scope', async () => {
    const user = await createUser();
    const school = await createSchool('School A');
    await createMembership(user, school.id, 'TEACHER');
    const teacher = await createTeacher(school.id, user);
    const { year, klass } = await academicContext(school.id);
    const math = await createSubject(school.id, 'Mathematics');
    await createAssignment(school.id, teacher.id, klass.id, math.id, year.id, 'ACTIVE');

    const decision = await authorizeOperation(
      db,
      { userId: user, schoolId: school.id },
      {
        permission: 'grades.enter',
        scope: { kind: 'teacher', classId: klass.id, subjectId: math.id, academicYearId: year.id },
      },
    );
    expect(decision).toEqual({ allowed: true });
  });

  it('denies a teacher outside their assignment scope', async () => {
    const user = await createUser();
    const school = await createSchool('School A');
    await createMembership(user, school.id, 'TEACHER');
    const teacher = await createTeacher(school.id, user);
    const { year, version, level, klass } = await academicContext(school.id);
    const classB = await addClass(school.id, year.id, level.id, version.id, 'Class B');
    const math = await createSubject(school.id, 'Mathematics');
    await createAssignment(school.id, teacher.id, klass.id, math.id, year.id, 'ACTIVE');

    const decision = await authorizeOperation(
      db,
      { userId: user, schoolId: school.id },
      {
        permission: 'grades.enter',
        scope: { kind: 'teacher', classId: classB.id, subjectId: math.id, academicYearId: year.id },
      },
    );
    expect(decision).toEqual({ allowed: false, reason: 'OUT_OF_SCOPE' });
  });

  it('denies a teacher with an ended assignment (BR-TEACHER-005)', async () => {
    const user = await createUser();
    const school = await createSchool('School A');
    await createMembership(user, school.id, 'TEACHER');
    const teacher = await createTeacher(school.id, user);
    const { year, klass } = await academicContext(school.id);
    const math = await createSubject(school.id, 'Mathematics');
    await createAssignment(school.id, teacher.id, klass.id, math.id, year.id, 'ENDED');

    const decision = await authorizeOperation(
      db,
      { userId: user, schoolId: school.id },
      {
        permission: 'grades.enter',
        scope: { kind: 'teacher', classId: klass.id, subjectId: math.id, academicYearId: year.id },
      },
    );
    expect(decision).toEqual({ allowed: false, reason: 'OUT_OF_SCOPE' });
  });

  it('denies a teacher operating in another school entirely', async () => {
    const user = await createUser();
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    await createMembership(user, schoolA.id, 'TEACHER');
    const teacher = await createTeacher(schoolA.id, user);
    const { year, klass } = await academicContext(schoolA.id);
    const math = await createSubject(schoolA.id, 'Mathematics');
    await createAssignment(schoolA.id, teacher.id, klass.id, math.id, year.id, 'ACTIVE');

    const decision = await authorizeOperation(
      db,
      { userId: user, schoolId: schoolB.id },
      {
        permission: 'grades.enter',
        scope: { kind: 'teacher', classId: klass.id, subjectId: math.id, academicYearId: year.id },
      },
    );
    expect(decision).toEqual({ allowed: false, reason: 'NO_MEMBERSHIP' });
  });

  it('allows a parent to read their own child and denies another child', async () => {
    const user = await createUser();
    const school = await createSchool('School A');
    await createMembership(user, school.id, 'PARENT');
    const parent = await createParent(school.id, user);
    const myChild = await createStudent(school.id);
    const otherChild = await createStudent(school.id);
    await linkParentStudent(school.id, parent.id, myChild.id, 'ACTIVE');

    const allowed = await authorizeOperation(
      db,
      { userId: user, schoolId: school.id },
      { permission: 'grades.read', scope: { kind: 'parent', studentId: myChild.id } },
    );
    expect(allowed).toEqual({ allowed: true });

    const denied = await authorizeOperation(
      db,
      { userId: user, schoolId: school.id },
      { permission: 'grades.read', scope: { kind: 'parent', studentId: otherChild.id } },
    );
    expect(denied).toEqual({ allowed: false, reason: 'OUT_OF_SCOPE' });
  });

  it('denies a parent access to a child in another school', async () => {
    const user = await createUser();
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    await createMembership(user, schoolA.id, 'PARENT');
    const parent = await createParent(schoolA.id, user);
    const childA = await createStudent(schoolA.id);
    await linkParentStudent(schoolA.id, parent.id, childA.id, 'ACTIVE');
    const studentInB = await createStudent(schoolB.id);

    const decision = await authorizeOperation(
      db,
      { userId: user, schoolId: schoolA.id },
      { permission: 'grades.read', scope: { kind: 'parent', studentId: studentInB.id } },
    );
    expect(decision).toEqual({ allowed: false, reason: 'OUT_OF_SCOPE' });
  });
});

describe('requireOperation — throwing guard (Task 005 §8/§17)', () => {
  it('does not throw for an allowed operation', async () => {
    const user = await createUser();
    const school = await createSchool('School A');
    await createMembership(user, school.id, 'SCHOOL_ADMIN');

    await expect(
      requireOperation(db, { userId: user, schoolId: school.id }, { permission: 'students.manage' }),
    ).resolves.toBeUndefined();
  });

  it('throws ForbiddenError for a permission denial', async () => {
    const user = await createUser();
    const school = await createSchool('School A');
    await createMembership(user, school.id, 'PARENT');

    await expect(
      requireOperation(db, { userId: user, schoolId: school.id }, { permission: 'students.manage' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws UnauthenticatedError when there is no session user', async () => {
    await expect(
      requireOperation(db, { userId: null, schoolId: 'school-x' }, {}),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});
