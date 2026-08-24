import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@school/database';

import { requireCurrentContext } from '@/lib/auth/require-context';
import { resolveParentScope } from '@/lib/authorization/server';
import { ForbiddenError } from '@/lib/errors';
import { resolveAnnouncementRecipients } from '@/lib/modules/announcements/domain';
import { loadParentRecipientCandidates } from '@/lib/modules/announcements/infrastructure/repositories/announcement-repository';
import { resolveResultNotificationRecipients } from '@/lib/modules/grades/domain/result-recipients';
import { findResultNotificationRecipientCandidates } from '@/lib/modules/grades/infrastructure/repositories/result-repository';
import * as app from '@/lib/modules/parents/application';
import { parentPatchSchema } from '@/lib/modules/parents/domain';
import * as studentApp from '@/lib/modules/students/application';

import { seedMembership, seedSchool, seedUser } from '../auth/test-helpers';
import { seedStudent } from '../students/test-helpers';
import {
  createActor, createParentsTestContext, seedParent, type ParentsTestContext,
} from './test-helpers';

let context: ParentsTestContext;
beforeEach(async () => { context = await createParentsTestContext(); });

describe('Parent identity, linking, lifecycle, and authorization', () => {
  it('creates, lists, searches, safely patches, and hides foreign Parents', async () => {
    const parent = await app.createParent(context.parentDb, context.admin, {
      firstName: 'Sara', lastName: 'Benali', parentCode: 'P-001',
    });
    expect(parent).not.toHaveProperty('studentIds');
    expect((await app.listParents(context.parentDb, context.admin, {
      page: 1, pageSize: 50, search: 'sara',
    })).data).toHaveLength(1);
    expect((await app.patchParent(context.parentDb, context.admin, parent.id, {
      firstName: 'Sarah',
    })).firstName).toBe('Sarah');
    const foreign = await createParentsTestContext();
    await expect(app.getParent(foreign.parentDb, foreign.admin, parent.id))
      .rejects.toMatchObject({ featureCode: 'PARENT_NOT_FOUND' });
  });

  it('rejects authoritative relationship and role fields in Parent PATCH', () => {
    for (const field of ['schoolId', 'studentIds', 'childIds', 'relationships', 'role', 'permissions']) {
      expect(parentPatchSchema.safeParse({ [field]: randomUUID() }).success).toBe(false);
    }
  });

  it('surfaces duplicate optional Parent codes and preserves NULL-code semantics', async () => {
    await app.createParent(context.parentDb, context.admin, {
      firstName: 'A', lastName: 'One', parentCode: 'P-1',
    });
    await expect(app.createParent(context.parentDb, context.admin, {
      firstName: 'B', lastName: 'Two', parentCode: 'P-1',
    })).rejects.toMatchObject({ featureCode: 'DUPLICATE_PARENT_CODE' });
    await app.createParent(context.parentDb, context.admin, { firstName: 'C', lastName: 'Three' });
    await app.createParent(context.parentDb, context.admin, { firstName: 'D', lastName: 'Four' });
  });

  it('uses a conservative lifecycle without mutating relationship history', async () => {
    const parent = await seedParent(context);
    const student = await seedStudent(context.test, context.schoolId);
    const relationship = await app.createRelationship(
      context.parentDb, context.admin, parent.id, { studentId: student.id },
    );
    expect((await app.patchParent(context.parentDb, context.admin, parent.id, {
      status: 'INACTIVE',
    })).status).toBe('INACTIVE');
    expect((await app.patchParent(context.parentDb, context.admin, parent.id, {
      status: 'ARCHIVED',
    })).status).toBe('ARCHIVED');
    const [preserved] = await context.test.seed.select().from(schema.parentStudents)
      .where(eq(schema.parentStudents.id, relationship.id));
    expect(preserved.status).toBe('ACTIVE');
    await expect(app.patchParent(context.parentDb, context.admin, parent.id, { status: 'ACTIVE' }))
      .rejects.toMatchObject({ featureCode: 'INVALID_PARENT_STATUS_TRANSITION' });
  });

  it('links only ACTIVE same-School Users and never mutates membership role', async () => {
    const userId = await seedUser(context.test.seed);
    await seedMembership(context.test.seed, userId, context.schoolId, 'TEACHER');
    const parent = await app.createParent(context.parentDb, context.admin, {
      firstName: 'Linked', lastName: 'Parent', userId,
    });
    const [membership] = await context.test.seed.select().from(schema.schoolMemberships).where(and(
      eq(schema.schoolMemberships.schoolId, context.schoolId),
      eq(schema.schoolMemberships.userId, userId),
    ));
    expect(parent.userId).toBe(userId);
    expect(membership.role).toBe('TEACHER');

    const missing = randomUUID();
    await expect(app.patchParent(context.parentDb, context.admin, parent.id, { userId: missing }))
      .rejects.toMatchObject({ featureCode: 'INVALID_USER_LINK' });
    const foreignUser = await seedUser(context.test.seed);
    const foreignSchool = await seedSchool(context.test.seed, 'Foreign');
    await seedMembership(context.test.seed, foreignUser, foreignSchool.id, 'PARENT');
    await expect(app.patchParent(context.parentDb, context.admin, parent.id, { userId: foreignUser }))
      .rejects.toMatchObject({ featureCode: 'INVALID_USER_LINK' });
    const suspended = await seedUser(context.test.seed, randomUUID(), undefined, 'SUSPENDED');
    await seedMembership(context.test.seed, suspended, context.schoolId, 'PARENT');
    await expect(app.patchParent(context.parentDb, context.admin, parent.id, { userId: suspended }))
      .rejects.toMatchObject({ featureCode: 'INVALID_USER_LINK' });
  });

  it('allows Parent self detail/name updates but denies broad list, admin fields, and other profiles', async () => {
    const parentActor = await createActor(context, 'PARENT');
    const own = await seedParent(context, { userId: parentActor.userId });
    const other = await seedParent(context);
    expect(await app.getParent(context.parentDb, parentActor, own.id)).toMatchObject({ id: own.id });
    expect((await app.patchParent(context.parentDb, parentActor, own.id, {
      firstName: 'Self',
    })).firstName).toBe('Self');
    await expect(app.patchParent(context.parentDb, parentActor, own.id, { parentCode: 'ADMIN' }))
      .rejects.toBeInstanceOf(ForbiddenError);
    await expect(app.getParent(context.parentDb, parentActor, other.id))
      .rejects.toMatchObject({ featureCode: 'PARENT_NOT_FOUND' });
    await expect(app.listParents(context.parentDb, parentActor, { page: 1, pageSize: 50 }))
      .rejects.toBeInstanceOf(ForbiddenError);
    const teacher = await createActor(context, 'TEACHER');
    await expect(app.getParent(context.parentDb, teacher, own.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('Parent self bootstrap', () => {
  it('returns all ACTIVE self-owned profiles and ACTIVE children with a minimal Student DTO', async () => {
    const parentActor = await createActor(context, 'PARENT');
    const parentA = await seedParent(context, { userId: parentActor.userId });
    const parentB = await seedParent(context, { userId: parentActor.userId });
    const studentA = await seedStudent(context.test, context.schoolId, 'Bootstrap-A');
    const studentB = await seedStudent(context.test, context.schoolId, 'Bootstrap-B');
    const relationshipA = await app.createRelationship(
      context.parentDb, context.admin, parentA.id, { studentId: studentA.id },
    );
    await app.createRelationship(
      context.parentDb, context.admin, parentA.id, { studentId: studentB.id },
    );

    const result = await app.listSelfParentProfiles(context.parentDb, parentActor);
    expect(result.data.map((profile) => profile.parent.id).sort())
      .toEqual([parentA.id, parentB.id].sort());
    const profileA = result.data.find((profile) => profile.parent.id === parentA.id)!;
    const profileB = result.data.find((profile) => profile.parent.id === parentB.id)!;
    expect(profileA.children).toHaveLength(2);
    expect(profileB.children).toEqual([]);
    expect(profileA.children[0]).toMatchObject({
      relationshipId: relationshipA.id,
      student: {
        id: studentA.id,
        firstName: studentA.firstName,
        lastName: studentA.lastName,
        studentCode: studentA.studentCode,
      },
    });
    expect(Object.keys(profileA.children[0].student).sort()).toEqual([
      'firstName', 'id', 'lastName', 'studentCode',
    ]);
    expect(profileA).not.toHaveProperty('currentClass');
    expect(profileA).not.toHaveProperty('currentEnrollment');
    expect(await studentApp.getStudent(context.db, parentActor, studentA.id))
      .toMatchObject({ id: studentA.id });
  });

  it('excludes ENDED relationships, inactive profiles, other Users, and other Schools', async () => {
    const parentActor = await createActor(context, 'PARENT');
    const active = await seedParent(context, { userId: parentActor.userId });
    const inactive = await seedParent(context, {
      userId: parentActor.userId, status: 'INACTIVE',
    });
    const otherUser = await seedUser(context.test.seed);
    await seedMembership(context.test.seed, otherUser, context.schoolId, 'PARENT');
    await seedParent(context, { userId: otherUser });
    const activeStudent = await seedStudent(context.test, context.schoolId, 'Current');
    const endedStudent = await seedStudent(context.test, context.schoolId, 'Ended');
    await app.createRelationship(
      context.parentDb, context.admin, active.id, { studentId: activeStudent.id },
    );
    const ended = await app.createRelationship(
      context.parentDb, context.admin, active.id, { studentId: endedStudent.id },
    );
    await app.endRelationship(context.parentDb, context.admin, ended.id);

    const otherSchool = await seedSchool(context.test.seed, 'Bootstrap Other School');
    await seedMembership(context.test.seed, parentActor.userId!, otherSchool.id, 'PARENT');
    const [foreignParent] = await context.test.seed.insert(schema.parents).values({
      schoolId: otherSchool.id,
      userId: parentActor.userId,
      firstName: 'Foreign',
      lastName: 'Profile',
    }).returning();

    const current = await app.listSelfParentProfiles(context.parentDb, parentActor);
    expect(current.data).toHaveLength(1);
    expect(current.data[0].parent.id).toBe(active.id);
    expect(current.data[0].parent.id).not.toBe(inactive.id);
    expect(current.data[0].children.map((child) => child.student.id)).toEqual([activeStudent.id]);
    await expect(studentApp.getStudent(context.db, parentActor, endedStudent.id))
      .rejects.toMatchObject({ featureCode: 'STUDENT_NOT_FOUND' });

    const switched = await app.listSelfParentProfiles(context.parentDb, {
      userId: parentActor.userId,
      schoolId: otherSchool.id,
    });
    expect(switched.data).toMatchObject([{ parent: { id: foreignParent.id }, children: [] }]);
  });

  it('returns an empty collection without an ACTIVE linked profile and remains self-scoped by role', async () => {
    const parentActor = await createActor(context, 'PARENT');
    expect(await app.listSelfParentProfiles(context.parentDb, parentActor)).toEqual({ data: [] });

    const adminSelf = await seedParent(context, { userId: context.admin.userId });
    expect(await app.listSelfParentProfiles(context.parentDb, context.admin))
      .toMatchObject({ data: [{ parent: { id: adminSelf.id }, children: [] }] });

    const teacherActor = await createActor(context, 'TEACHER');
    await seedParent(context, { userId: teacherActor.userId });
    await expect(app.listSelfParentProfiles(context.parentDb, teacherActor))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it('uses real application User and membership lifecycle gates', async () => {
    const suspended = await seedUser(context.test.seed, randomUUID(), undefined, 'SUSPENDED');
    await seedMembership(context.test.seed, suspended, context.schoolId, 'PARENT');
    await seedParent(context, { userId: suspended });
    await expect(app.listSelfParentProfiles(context.parentDb, {
      userId: suspended, schoolId: context.schoolId,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const inactiveMembership = await seedUser(context.test.seed);
    await seedMembership(
      context.test.seed, inactiveMembership, context.schoolId, 'PARENT', 'INACTIVE',
    );
    await seedParent(context, { userId: inactiveMembership });
    await expect(app.listSelfParentProfiles(context.parentDb, {
      userId: inactiveMembership, schoolId: context.schoolId,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('ParentStudent creation, multiplicity, history, and ending', () => {
  it('supports multiple children and multiple Parents while filtering Parent lists through ACTIVE relationships', async () => {
    const parentA = await seedParent(context);
    const parentB = await seedParent(context);
    const studentA = await seedStudent(context.test, context.schoolId, 'A');
    const studentB = await seedStudent(context.test, context.schoolId, 'B');
    await app.createRelationship(context.parentDb, context.admin, parentA.id, { studentId: studentA.id });
    await app.createRelationship(context.parentDb, context.admin, parentA.id, { studentId: studentB.id });
    await app.createRelationship(context.parentDb, context.admin, parentB.id, { studentId: studentA.id });
    expect((await app.listParents(context.parentDb, context.admin, {
      page: 1, pageSize: 50, studentId: studentA.id,
    })).data.map((row) => row.id).sort()).toEqual([parentA.id, parentB.id].sort());
    expect((await app.listRelationshipHistory(context.parentDb, context.admin, parentA.id, {
      page: 1, pageSize: 50,
    })).data).toHaveLength(2);
  });

  it('rejects duplicate concurrent ACTIVE relationships and permits historical relinking', async () => {
    const parent = await seedParent(context);
    const student = await seedStudent(context.test, context.schoolId);
    const first = await app.createRelationship(
      context.parentDb, context.admin, parent.id, { studentId: student.id },
    );
    await expect(app.createRelationship(context.parentDb, context.admin, parent.id, {
      studentId: student.id,
    })).rejects.toMatchObject({ featureCode: 'DUPLICATE_PARENT_STUDENT_RELATIONSHIP' });
    await app.endRelationship(context.parentDb, context.admin, first.id);
    const relinked = await app.createRelationship(
      context.parentDb, context.admin, parent.id, { studentId: student.id },
    );
    expect(relinked.status).toBe('ACTIVE');

    const otherParent = await seedParent(context);
    const raced = await Promise.allSettled([
      app.createRelationship(context.parentDb, context.admin, otherParent.id, { studentId: student.id }),
      app.createRelationship(context.parentDb, context.admin, otherParent.id, { studentId: student.id }),
    ]);
    expect(raced.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  });

  it('requires an ACTIVE same-School Parent and an eligible same-School Student', async () => {
    const inactive = await seedParent(context, { status: 'INACTIVE' });
    const archived = await seedParent(context, { status: 'ARCHIVED' });
    const activeStudent = await seedStudent(context.test, context.schoolId);
    await expect(app.createRelationship(context.parentDb, context.admin, inactive.id, {
      studentId: activeStudent.id,
    })).rejects.toMatchObject({ featureCode: 'PARENT_NOT_ACTIVE' });
    await expect(app.createRelationship(context.parentDb, context.admin, archived.id, {
      studentId: activeStudent.id,
    })).rejects.toMatchObject({ featureCode: 'PARENT_NOT_ACTIVE' });
    const parent = await seedParent(context);
    const withdrawn = await seedStudent(context.test, context.schoolId, 'W');
    await context.test.seed.update(schema.students).set({ status: 'WITHDRAWN' })
      .where(eq(schema.students.id, withdrawn.id));
    await expect(app.createRelationship(context.parentDb, context.admin, parent.id, {
      studentId: withdrawn.id,
    })).rejects.toMatchObject({ featureCode: 'INVALID_RELATIONSHIP_CONTEXT' });
    const foreignSchool = await seedSchool(context.test.seed, 'Other tenant');
    const [foreignStudent] = await context.test.seed.insert(schema.students).values({
      schoolId: foreignSchool.id, firstName: 'Foreign', lastName: 'Student',
    }).returning();
    await expect(app.createRelationship(context.parentDb, context.admin, parent.id, {
      studentId: foreignStudent.id,
    })).rejects.toMatchObject({ featureCode: 'INVALID_RELATIONSHIP_CONTEXT' });
  });

  it('ends idempotently and keeps Parent self-history limited to ACTIVE rows', async () => {
    const parentActor = await createActor(context, 'PARENT');
    const parent = await seedParent(context, { userId: parentActor.userId });
    const student = await seedStudent(context.test, context.schoolId);
    const relationship = await app.createRelationship(
      context.parentDb, context.admin, parent.id, { studentId: student.id },
    );
    expect((await app.listRelationshipHistory(context.parentDb, parentActor, parent.id, {
      page: 1, pageSize: 50,
    })).data).toHaveLength(1);
    const ended = await app.endRelationship(context.parentDb, context.admin, relationship.id);
    expect(ended.status).toBe('ENDED');
    expect(await app.endRelationship(context.parentDb, context.admin, relationship.id)).toEqual(ended);
    expect((await app.listRelationshipHistory(context.parentDb, parentActor, parent.id, {
      page: 1, pageSize: 50,
    })).data).toEqual([]);
    await expect(app.listRelationshipHistory(context.parentDb, parentActor, parent.id, {
      page: 1, pageSize: 50, status: 'ENDED',
    })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await app.listRelationshipHistory(context.parentDb, context.admin, parent.id, {
      page: 1, pageSize: 50,
    })).data).toHaveLength(1);
  });
});

describe('Current child scope and recipient regressions', () => {
  it('role or profile alone grants no child scope', async () => {
    const roleOnly = await createActor(context, 'PARENT');
    expect(await resolveParentScope(context.parentDb as never, roleOnly.userId!, context.schoolId))
      .toEqual([]);
    const profileOnly = await createActor(context, 'PARENT');
    await seedParent(context, { userId: profileOnly.userId });
    expect(await resolveParentScope(context.parentDb as never, profileOnly.userId!, context.schoolId))
      .toEqual([]);
  });

  it('ACTIVE relationship grants Student access; END removes access without changing enrollment', async () => {
    const parentActor = await createActor(context, 'PARENT');
    const parent = await seedParent(context, { userId: parentActor.userId });
    const student = await seedStudent(context.test, context.schoolId);
    const enrollment = await studentApp.createEnrollment(context.db, context.admin, student.id, {
      academicYearId: context.yearId, classId: context.classAId, effectiveFrom: '2025-09-01',
    });
    const relationship = await app.createRelationship(
      context.parentDb, context.admin, parent.id, { studentId: student.id },
    );
    expect(await studentApp.getStudent(context.db, parentActor, student.id)).toMatchObject({ id: student.id });
    expect(await studentApp.getCurrentEnrollment(context.db, parentActor, student.id, context.yearId))
      .toMatchObject({ id: enrollment.id });
    await app.endRelationship(context.parentDb, context.admin, relationship.id);
    await expect(studentApp.getStudent(context.db, parentActor, student.id))
      .rejects.toMatchObject({ featureCode: 'STUDENT_NOT_FOUND' });
    const [preserved] = await context.test.seed.select().from(schema.studentEnrollments)
      .where(eq(schema.studentEnrollments.id, enrollment.id));
    expect(preserved).toMatchObject({ status: 'ACTIVE', classId: context.classAId });
  });

  it('END changes future Announcement/Result recipients while prior resolved snapshots stay stable', async () => {
    const parentActor = await createActor(context, 'PARENT');
    const parent = await seedParent(context, { userId: parentActor.userId });
    const student = await seedStudent(context.test, context.schoolId);
    await studentApp.createEnrollment(context.db, context.admin, student.id, {
      academicYearId: context.yearId, classId: context.classAId, effectiveFrom: '2025-09-01',
    });
    const relationship = await app.createRelationship(
      context.parentDb, context.admin, parent.id, { studentId: student.id },
    );
    const announcementBefore = resolveAnnouncementRecipients(context.schoolId, [{
      audience: 'PARENTS', targetType: 'CLASS', classId: context.classAId,
    }], {
      parents: await loadParentRecipientCandidates(context.parentDb as never, context.schoolId),
      teachers: [],
    });
    const resultBefore = resolveResultNotificationRecipients(
      await findResultNotificationRecipientCandidates(
        context.parentDb as never, context.schoolId, student.id,
      ),
    );
    expect(announcementBefore.map((row) => row.recipientUserId)).toEqual([parentActor.userId]);
    expect(resultBefore.recipientUserIds).toEqual([parentActor.userId]);

    await app.endRelationship(context.parentDb, context.admin, relationship.id);
    const announcementAfter = resolveAnnouncementRecipients(context.schoolId, [{
      audience: 'PARENTS', targetType: 'CLASS', classId: context.classAId,
    }], {
      parents: await loadParentRecipientCandidates(context.parentDb as never, context.schoolId),
      teachers: [],
    });
    const resultAfter = resolveResultNotificationRecipients(
      await findResultNotificationRecipientCandidates(
        context.parentDb as never, context.schoolId, student.id,
      ),
    );
    expect(announcementAfter).toEqual([]);
    expect(resultAfter.recipientUserIds).toEqual([]);
    expect(announcementBefore.map((row) => row.recipientUserId)).toEqual([parentActor.userId]);
    expect(resultBefore.recipientUserIds).toEqual([parentActor.userId]);
  });

  it('INACTIVE Parent loses Student, Announcement, Result, and resolver scope without ending history', async () => {
    const parentActor = await createActor(context, 'PARENT');
    const parent = await seedParent(context, { userId: parentActor.userId });
    const student = await seedStudent(context.test, context.schoolId);
    const relationship = await app.createRelationship(
      context.parentDb, context.admin, parent.id, { studentId: student.id },
    );
    await app.patchParent(context.parentDb, context.admin, parent.id, { status: 'INACTIVE' });
    expect(await resolveParentScope(context.parentDb as never, parentActor.userId!, context.schoolId))
      .toEqual([]);
    await expect(studentApp.getStudent(context.db, parentActor, student.id))
      .rejects.toMatchObject({ featureCode: 'STUDENT_NOT_FOUND' });
    expect(await loadParentRecipientCandidates(context.parentDb as never, context.schoolId))
      .toEqual([]);
    expect(resolveResultNotificationRecipients(await findResultNotificationRecipientCandidates(
      context.parentDb as never, context.schoolId, student.id,
    )).recipientUserIds).toEqual([]);
    const [preserved] = await context.test.seed.select().from(schema.parentStudents)
      .where(eq(schema.parentStudents.id, relationship.id));
    expect(preserved.status).toBe('ACTIVE');
  });

  it('real context stages deny unauthenticated, suspended, inactive membership, and ambiguity', async () => {
    await expect(app.listParents(context.parentDb, { userId: null, schoolId: context.schoolId }, {
      page: 1, pageSize: 50,
    })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    const suspended = await seedUser(context.test.seed, randomUUID(), undefined, 'SUSPENDED');
    await seedMembership(context.test.seed, suspended, context.schoolId, 'SCHOOL_ADMIN');
    await expect(app.listParents(context.parentDb, { userId: suspended, schoolId: context.schoolId }, {
      page: 1, pageSize: 50,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const inactive = await seedUser(context.test.seed);
    await seedMembership(context.test.seed, inactive, context.schoolId, 'SCHOOL_ADMIN', 'INACTIVE');
    await expect(app.listParents(context.parentDb, { userId: inactive, schoolId: context.schoolId }, {
      page: 1, pageSize: 50,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const ambiguous = await seedUser(context.test.seed);
    const otherSchool = await seedSchool(context.test.seed, 'Second');
    await seedMembership(context.test.seed, ambiguous, context.schoolId, 'SCHOOL_ADMIN');
    await seedMembership(context.test.seed, ambiguous, otherSchool.id, 'SCHOOL_ADMIN');
    await expect(requireCurrentContext(context.test.db, {
      sessionResolver: async () => ({ id: ambiguous }), readSelectedSchoolId: async () => null,
    })).rejects.toMatchObject({ featureCode: 'SCHOOL_CONTEXT_REQUIRED' });
  });
});
