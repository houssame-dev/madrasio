import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@school/database';

import { requireCurrentContext } from '@/lib/auth/require-context';
import { authorizeOperation, resolveTeacherScope } from '@/lib/authorization/server';
import { ForbiddenError } from '@/lib/errors';
import * as studentApp from '@/lib/modules/students/application';
import * as app from '@/lib/modules/teachers/application';
import { teacherPatchSchema } from '@/lib/modules/teachers/domain';

import { seedMembership, seedSchool, seedUser } from '../auth/test-helpers';
import { seedStudent } from '../students/test-helpers';
import {
  createActor, createTeachersTestContext, seedTeacher, type TeachersTestContext,
} from './test-helpers';

let context: TeachersTestContext;
beforeEach(async () => { context = await createTeachersTestContext(); });

const assignmentInput = () => ({
  academicYearId: context.yearId,
  classId: context.classAId,
  subjectId: context.subjectId,
  effectiveFrom: '2025-09-01',
});

describe('Teacher identity, linking, and lifecycle', () => {
  it('creates, lists, searches, safely patches, and hides foreign Teachers', async () => {
    const teacher = await app.createTeacher(context.teacherDb, context.admin, {
      firstName: 'Karim', lastName: 'Alaoui', teacherCode: 'T-001',
    });
    expect(teacher).not.toHaveProperty('classId');
    expect((await app.listTeachers(context.teacherDb, context.admin, {
      page: 1, pageSize: 50, search: 'karim',
    })).data).toHaveLength(1);
    expect((await app.patchTeacher(context.teacherDb, context.admin, teacher.id, {
      firstName: 'Kareem',
    })).firstName).toBe('Kareem');

    const foreign = await createTeachersTestContext();
    await expect(app.getTeacher(foreign.teacherDb, foreign.admin, teacher.id))
      .rejects.toMatchObject({ featureCode: 'TEACHER_NOT_FOUND' });
  });

  it('rejects assignment, scope, role, and School fields in Teacher PATCH', () => {
    for (const field of [
      'schoolId', 'classId', 'subjectId', 'academicYearId', 'assignments', 'role', 'permissions',
    ]) {
      expect(teacherPatchSchema.safeParse({ [field]: randomUUID() }).success).toBe(false);
    }
  });

  it('surfaces duplicate optional Teacher codes and preserves NULL-code semantics', async () => {
    await app.createTeacher(context.teacherDb, context.admin, {
      firstName: 'A', lastName: 'One', teacherCode: 'T-1',
    });
    await expect(app.createTeacher(context.teacherDb, context.admin, {
      firstName: 'B', lastName: 'Two', teacherCode: 'T-1',
    })).rejects.toMatchObject({ featureCode: 'DUPLICATE_TEACHER_CODE' });
    await app.createTeacher(context.teacherDb, context.admin, { firstName: 'C', lastName: 'Three' });
    await app.createTeacher(context.teacherDb, context.admin, { firstName: 'D', lastName: 'Four' });
  });

  it('uses a conservative lifecycle without mutating assignment history', async () => {
    const teacher = await seedTeacher(context);
    const assignment = await app.createAssignment(
      context.teacherDb, context.admin, teacher.id, assignmentInput(),
    );
    expect((await app.patchTeacher(context.teacherDb, context.admin, teacher.id, {
      status: 'INACTIVE',
    })).status).toBe('INACTIVE');
    expect((await app.patchTeacher(context.teacherDb, context.admin, teacher.id, {
      status: 'ARCHIVED',
    })).status).toBe('ARCHIVED');
    const [preserved] = await context.test.seed.select().from(schema.teacherAssignments)
      .where(eq(schema.teacherAssignments.id, assignment.id));
    expect(preserved.status).toBe('ACTIVE');
    await expect(app.patchTeacher(context.teacherDb, context.admin, teacher.id, {
      status: 'ACTIVE',
    })).rejects.toMatchObject({ featureCode: 'INVALID_TEACHER_STATUS_TRANSITION' });
  });

  it('links only an ACTIVE User with ACTIVE same-School membership and never changes role', async () => {
    const userId = await seedUser(context.test.seed);
    await seedMembership(context.test.seed, userId, context.schoolId, 'PARENT');
    const teacher = await app.createTeacher(context.teacherDb, context.admin, {
      firstName: 'Linked', lastName: 'Teacher', userId,
    });
    expect(teacher.userId).toBe(userId);
    const [membership] = await context.test.seed.select().from(schema.schoolMemberships)
      .where(and(
        eq(schema.schoolMemberships.schoolId, context.schoolId),
        eq(schema.schoolMemberships.userId, userId),
      ));
    expect(membership.role).toBe('PARENT');

    const missing = randomUUID();
    await expect(app.patchTeacher(context.teacherDb, context.admin, teacher.id, { userId: missing }))
      .rejects.toMatchObject({ featureCode: 'INVALID_USER_LINK' });
    const foreignUser = await seedUser(context.test.seed);
    const foreignSchool = await seedSchool(context.test.seed, 'Foreign');
    await seedMembership(context.test.seed, foreignUser, foreignSchool.id, 'TEACHER');
    await expect(app.patchTeacher(context.teacherDb, context.admin, teacher.id, { userId: foreignUser }))
      .rejects.toMatchObject({ featureCode: 'INVALID_USER_LINK' });
    const suspended = await seedUser(context.test.seed, randomUUID(), undefined, 'SUSPENDED');
    await seedMembership(context.test.seed, suspended, context.schoolId, 'TEACHER');
    await expect(app.patchTeacher(context.teacherDb, context.admin, teacher.id, { userId: suspended }))
      .rejects.toMatchObject({ featureCode: 'INVALID_USER_LINK' });
    const inactiveMember = await seedUser(context.test.seed);
    await seedMembership(context.test.seed, inactiveMember, context.schoolId, 'TEACHER', 'INACTIVE');
    await expect(app.patchTeacher(
      context.teacherDb, context.admin, teacher.id, { userId: inactiveMember },
    )).rejects.toMatchObject({ featureCode: 'INVALID_USER_LINK' });
  });
});

describe('Assignment creation, context, history, and concurrency', () => {
  it('creates multiple legitimate assignments and filters Teachers through ACTIVE scope', async () => {
    const teacher = await seedTeacher(context);
    const first = await app.createAssignment(
      context.teacherDb, context.admin, teacher.id, assignmentInput(),
    );
    const [secondSubject] = await context.test.seed.insert(schema.subjects).values({
      schoolId: context.schoolId, name: 'Physics', status: 'ACTIVE',
    }).returning();
    const second = await app.createAssignment(context.teacherDb, context.admin, teacher.id, {
      ...assignmentInput(), subjectId: secondSubject.id,
    });
    expect(first.status).toBe('ACTIVE');
    expect(second.subjectId).toBe(secondSubject.id);
    const filtered = await app.listTeachers(context.teacherDb, context.admin, {
      page: 1, pageSize: 50, academicYearId: context.yearId,
      classId: context.classAId, subjectId: secondSubject.id,
    });
    expect(filtered.data.map((row) => row.id)).toEqual([teacher.id]);
  });

  it('rejects duplicate ACTIVE logical assignments and concurrent duplicates safely', async () => {
    const teacher = await seedTeacher(context);
    await app.createAssignment(context.teacherDb, context.admin, teacher.id, assignmentInput());
    await expect(app.createAssignment(context.teacherDb, context.admin, teacher.id, assignmentInput()))
      .rejects.toMatchObject({ featureCode: 'DUPLICATE_ASSIGNMENT' });

    const other = await seedTeacher(context);
    const raced = await Promise.allSettled([
      app.createAssignment(context.teacherDb, context.admin, other.id, assignmentInput()),
      app.createAssignment(context.teacherDb, context.admin, other.id, assignmentInput()),
    ]);
    expect(raced.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rows = await context.test.seed.select().from(schema.teacherAssignments).where(and(
      eq(schema.teacherAssignments.teacherId, other.id),
      eq(schema.teacherAssignments.status, 'ACTIVE'),
    ));
    expect(rows).toHaveLength(1);
  });

  it('requires an ACTIVE Teacher and operational exact academic context', async () => {
    const inactive = await seedTeacher(context, { status: 'INACTIVE' });
    await expect(app.createAssignment(context.teacherDb, context.admin, inactive.id, assignmentInput()))
      .rejects.toMatchObject({ featureCode: 'TEACHER_NOT_ACTIVE' });
    const archived = await seedTeacher(context, { status: 'ARCHIVED' });
    await expect(app.createAssignment(context.teacherDb, context.admin, archived.id, assignmentInput()))
      .rejects.toMatchObject({ featureCode: 'TEACHER_NOT_ACTIVE' });
    const teacher = await seedTeacher(context);

    const otherYear = randomUUID();
    await context.test.seed.insert(schema.academicYears).values({
      id: otherYear, schoolId: context.schoolId, name: '2026/2027',
      startDate: '2026-09-01', endDate: '2027-07-01', status: 'ACTIVE',
    });
    await expect(app.createAssignment(context.teacherDb, context.admin, teacher.id, {
      ...assignmentInput(), academicYearId: otherYear,
    })).rejects.toMatchObject({ featureCode: 'INVALID_ACADEMIC_CONTEXT' });

    await context.test.seed.update(schema.subjects).set({ status: 'INACTIVE' })
      .where(eq(schema.subjects.id, context.subjectId));
    await expect(app.createAssignment(context.teacherDb, context.admin, teacher.id, assignmentInput()))
      .rejects.toMatchObject({ featureCode: 'INVALID_ACADEMIC_CONTEXT' });
    await context.test.seed.update(schema.subjects).set({ status: 'ACTIVE' })
      .where(eq(schema.subjects.id, context.subjectId));
    await context.test.seed.update(schema.classes).set({ status: 'CLOSED' })
      .where(eq(schema.classes.id, context.classAId));
    await expect(app.createAssignment(context.teacherDb, context.admin, teacher.id, assignmentInput()))
      .rejects.toMatchObject({ featureCode: 'INVALID_ACADEMIC_CONTEXT' });
    await context.test.seed.update(schema.classes).set({ status: 'ACTIVE' })
      .where(eq(schema.classes.id, context.classAId));
    await context.test.seed.update(schema.academicYears).set({ status: 'CLOSED' })
      .where(eq(schema.academicYears.id, context.yearId));
    await expect(app.createAssignment(context.teacherDb, context.admin, teacher.id, assignmentInput()))
      .rejects.toMatchObject({ featureCode: 'INVALID_ACADEMIC_CONTEXT' });
  });

  it('rejects foreign Teacher/Class/Subject/Year without tenant leakage', async () => {
    const teacher = await seedTeacher(context);
    const foreignSchool = await seedSchool(context.test.seed, 'Foreign academic context');
    const [foreignYear] = await context.test.seed.insert(schema.academicYears).values({
      schoolId: foreignSchool.id, name: '2025/2026',
      startDate: '2025-09-01', endDate: '2026-07-01', status: 'ACTIVE',
    }).returning();
    const [foreignSubject] = await context.test.seed.insert(schema.subjects).values({
      schoolId: foreignSchool.id, name: 'Foreign subject', status: 'ACTIVE',
    }).returning();
    const [foreignCurriculum] = await context.test.seed.insert(schema.curricula).values({
      schoolId: foreignSchool.id, name: 'Foreign curriculum',
    }).returning();
    const [foreignVersion] = await context.test.seed.insert(schema.curriculumVersions).values({
      schoolId: foreignSchool.id, curriculumId: foreignCurriculum.id, name: 'v1', status: 'ACTIVE',
    }).returning();
    const [foreignStage] = await context.test.seed.insert(schema.stages).values({
      schoolId: foreignSchool.id, name: 'Foreign stage', sequence: 1,
    }).returning();
    const [foreignLevel] = await context.test.seed.insert(schema.levels).values({
      schoolId: foreignSchool.id, stageId: foreignStage.id, name: 'Foreign level', sequence: 1,
    }).returning();
    const [foreignClass] = await context.test.seed.insert(schema.classes).values({
      schoolId: foreignSchool.id,
      academicYearId: foreignYear.id,
      levelId: foreignLevel.id,
      curriculumVersionId: foreignVersion.id,
      name: 'Foreign class',
    }).returning();
    const [foreignTeacher] = await context.test.seed.insert(schema.teachers).values({
      schoolId: foreignSchool.id, firstName: 'Foreign', lastName: 'Teacher',
    }).returning();
    await expect(app.createAssignment(context.teacherDb, context.admin, teacher.id, {
      academicYearId: foreignYear.id,
      classId: context.classAId,
      subjectId: context.subjectId,
      effectiveFrom: '2025-09-01',
    })).rejects.toMatchObject({ featureCode: 'INVALID_ACADEMIC_CONTEXT' });
    await expect(app.createAssignment(context.teacherDb, context.admin, teacher.id, {
      ...assignmentInput(), subjectId: foreignSubject.id,
    })).rejects.toMatchObject({ featureCode: 'INVALID_ACADEMIC_CONTEXT' });
    await expect(app.createAssignment(context.teacherDb, context.admin, teacher.id, {
      ...assignmentInput(), classId: foreignClass.id,
    })).rejects.toMatchObject({ featureCode: 'INVALID_ACADEMIC_CONTEXT' });
    await expect(app.listAssignmentHistory(
      context.teacherDb, context.admin, foreignTeacher.id, { page: 1, pageSize: 50 },
    )).rejects.toMatchObject({ featureCode: 'TEACHER_NOT_FOUND' });
  });

  it('ends idempotently, validates dates, and preserves deterministic history', async () => {
    const teacher = await seedTeacher(context);
    const first = await app.createAssignment(
      context.teacherDb, context.admin, teacher.id, assignmentInput(),
    );
    await expect(app.endAssignment(context.teacherDb, context.admin, first.id, {
      effectiveUntil: '2025-08-31',
    })).rejects.toMatchObject({ featureCode: 'INVALID_ASSIGNMENT_STATE' });
    const ended = await app.endAssignment(context.teacherDb, context.admin, first.id, {
      effectiveUntil: '2025-10-01',
    });
    expect(ended).toMatchObject({ status: 'ENDED', effectiveUntil: '2025-10-01' });
    expect(await app.endAssignment(context.teacherDb, context.admin, first.id, {
      effectiveUntil: '2025-12-01',
    })).toEqual(ended);
    const replacement = await app.createAssignment(context.teacherDb, context.admin, teacher.id, {
      ...assignmentInput(), effectiveFrom: '2025-10-02',
    });
    const history = await app.listAssignmentHistory(context.teacherDb, context.admin, teacher.id, {
      page: 1, pageSize: 50,
    });
    expect(history.data.map((row) => row.id)).toEqual([replacement.id, first.id]);
    expect((await app.listAssignmentHistory(context.teacherDb, context.admin, teacher.id, {
      page: 1, pageSize: 50, status: 'ACTIVE',
    })).data).toHaveLength(1);
  });
});

describe('Authorization and cross-module scope regression', () => {
  it('allows Teacher self reads only and denies management, other profiles, and Parents', async () => {
    const teacherActor = await createActor(context, 'TEACHER');
    const own = await seedTeacher(context, { userId: teacherActor.userId });
    const other = await seedTeacher(context);
    await app.createAssignment(context.teacherDb, context.admin, own.id, assignmentInput());
    expect((await app.listTeachers(context.teacherDb, teacherActor, {
      page: 1, pageSize: 50,
    })).data.map((row) => row.id)).toEqual([own.id]);
    expect(await app.getTeacher(context.teacherDb, teacherActor, own.id)).toMatchObject({ id: own.id });
    expect((await app.listAssignmentHistory(context.teacherDb, teacherActor, own.id, {
      page: 1, pageSize: 50,
    })).data).toHaveLength(1);
    const [ownAssignment] = await context.test.seed.select().from(schema.teacherAssignments)
      .where(eq(schema.teacherAssignments.teacherId, own.id));
    await app.endAssignment(context.teacherDb, context.admin, ownAssignment.id, {
      effectiveUntil: '2025-10-01',
    });
    expect((await app.listAssignmentHistory(context.teacherDb, teacherActor, own.id, {
      page: 1, pageSize: 50, status: 'ENDED',
    })).data).toHaveLength(1);
    await expect(app.getTeacher(context.teacherDb, teacherActor, other.id))
      .rejects.toMatchObject({ featureCode: 'TEACHER_NOT_FOUND' });
    await expect(app.createTeacher(context.teacherDb, teacherActor, {
      firstName: 'No', lastName: 'Write',
    })).rejects.toBeInstanceOf(ForbiddenError);
    const parent = await createActor(context, 'PARENT');
    await expect(app.listTeachers(context.teacherDb, parent, { page: 1, pageSize: 50 }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('role without profile and profile without ACTIVE assignment grant no academic scope', async () => {
    const roleOnly = await createActor(context, 'TEACHER');
    expect(await resolveTeacherScope(
      context.teacherDb as never, roleOnly.userId!, context.schoolId,
    )).toEqual([]);
    const profileOnly = await createActor(context, 'TEACHER');
    await seedTeacher(context, { userId: profileOnly.userId });
    expect(await resolveTeacherScope(
      context.teacherDb as never, profileOnly.userId!, context.schoolId,
    )).toEqual([]);
  });

  it('ending assignment removes Student and Grades scope without mutating Student history', async () => {
    const teacherActor = await createActor(context, 'TEACHER');
    const teacher = await seedTeacher(context, { userId: teacherActor.userId });
    const assignment = await app.createAssignment(
      context.teacherDb, context.admin, teacher.id, assignmentInput(),
    );
    const student = await seedStudent(context.test, context.schoolId);
    const enrollment = await studentApp.createEnrollment(context.db, context.admin, student.id, {
      academicYearId: context.yearId,
      classId: context.classAId,
      effectiveFrom: '2025-09-01',
    });
    expect(await studentApp.getStudent(context.db, teacherActor, student.id))
      .toMatchObject({ id: student.id });
    expect(await authorizeOperation(context.teacherDb as never, teacherActor, {
      permission: 'grades.enter',
      scope: {
        kind: 'teacher', classId: context.classAId,
        subjectId: context.subjectId, academicYearId: context.yearId,
      },
    })).toEqual({ allowed: true });

    await app.endAssignment(context.teacherDb, context.admin, assignment.id, {
      effectiveUntil: '2025-10-01',
    });
    await expect(studentApp.getStudent(context.db, teacherActor, student.id))
      .rejects.toMatchObject({ featureCode: 'STUDENT_NOT_FOUND' });
    expect((await authorizeOperation(context.teacherDb as never, teacherActor, {
      permission: 'grades.enter',
      scope: {
        kind: 'teacher', classId: context.classAId,
        subjectId: context.subjectId, academicYearId: context.yearId,
      },
    })).allowed).toBe(false);
    const [preserved] = await context.test.seed.select().from(schema.studentEnrollments)
      .where(eq(schema.studentEnrollments.id, enrollment.id));
    expect(preserved).toMatchObject({ status: 'ACTIVE', classId: context.classAId });
  });

  it('an INACTIVE Teacher profile contributes no current scope while history remains', async () => {
    const teacherActor = await createActor(context, 'TEACHER');
    const teacher = await seedTeacher(context, { userId: teacherActor.userId });
    const assignment = await app.createAssignment(
      context.teacherDb, context.admin, teacher.id, assignmentInput(),
    );
    await app.patchTeacher(context.teacherDb, context.admin, teacher.id, { status: 'INACTIVE' });
    expect(await resolveTeacherScope(
      context.teacherDb as never, teacherActor.userId!, context.schoolId,
    )).toEqual([]);
    const [preserved] = await context.test.seed.select().from(schema.teacherAssignments)
      .where(eq(schema.teacherAssignments.id, assignment.id));
    expect(preserved.status).toBe('ACTIVE');
  });

  it('real authentication/current-context stages deny unauthenticated, inactive users/memberships, and ambiguity', async () => {
    await expect(app.listTeachers(context.teacherDb, {
      userId: null, schoolId: context.schoolId,
    }, { page: 1, pageSize: 50 })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

    const suspended = await seedUser(context.test.seed, randomUUID(), undefined, 'SUSPENDED');
    await seedMembership(context.test.seed, suspended, context.schoolId, 'SCHOOL_ADMIN');
    await expect(app.listTeachers(context.teacherDb, {
      userId: suspended, schoolId: context.schoolId,
    }, { page: 1, pageSize: 50 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const inactive = await seedUser(context.test.seed);
    await seedMembership(context.test.seed, inactive, context.schoolId, 'SCHOOL_ADMIN', 'INACTIVE');
    await expect(app.listTeachers(context.teacherDb, {
      userId: inactive, schoolId: context.schoolId,
    }, { page: 1, pageSize: 50 })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const ambiguous = await seedUser(context.test.seed);
    const otherSchool = await seedSchool(context.test.seed, 'Second');
    await seedMembership(context.test.seed, ambiguous, context.schoolId, 'SCHOOL_ADMIN');
    await seedMembership(context.test.seed, ambiguous, otherSchool.id, 'SCHOOL_ADMIN');
    await expect(requireCurrentContext(context.test.db, {
      sessionResolver: async () => ({ id: ambiguous }),
      readSelectedSchoolId: async () => null,
    })).rejects.toMatchObject({ featureCode: 'SCHOOL_CONTEXT_REQUIRED' });
  });
});
