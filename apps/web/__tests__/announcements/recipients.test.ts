import { describe, expect, it } from 'vitest';

import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_PUBLICATION_STATUSES,
  ANNOUNCEMENT_STATUSES,
  ANNOUNCEMENT_TARGET_TYPES,
  AnnouncementResolutionError,
  resolveAnnouncementRecipients,
  type AnnouncementAudience,
  type RecipientResolutionInput,
} from '@/lib/modules/announcements';

const schoolId = 'school-1';
const classA = 'class-a';
const classB = 'class-b';

const parentA: RecipientResolutionInput['parents'][number] = {
  userId: 'parentA-user',
  activeSchoolMembership: true,
  childClassIds: [classA],
};
const parentB: RecipientResolutionInput['parents'][number] = {
  userId: 'parentB-user',
  activeSchoolMembership: true,
  childClassIds: [classB],
};
const inactiveParent: RecipientResolutionInput['parents'][number] = {
  userId: 'inactiveParent-user',
  activeSchoolMembership: false,
  childClassIds: [classA],
};

const teacherA: RecipientResolutionInput['teachers'][number] = {
  userId: 'teacherA-user',
  activeSchoolMembership: true,
  assignmentClassIds: [classA],
};
const teacherB: RecipientResolutionInput['teachers'][number] = {
  userId: 'teacherB-user',
  activeSchoolMembership: true,
  assignmentClassIds: [classB],
};
const inactiveTeacher: RecipientResolutionInput['teachers'][number] = {
  userId: 'inactiveTeacher-user',
  activeSchoolMembership: false,
  assignmentClassIds: [classA],
};

const input: RecipientResolutionInput = {
  parents: [parentA, parentB, inactiveParent],
  teachers: [teacherA, teacherB, inactiveTeacher],
};

describe('resolveAnnouncementRecipients (Task 009 §46 / Task 009.1)', () => {
  it('resolves PARENTS + SCHOOL to every eligible parent User', () => {
    const recipients = resolveAnnouncementRecipients(
      schoolId,
      [{ audience: 'PARENTS', targetType: 'SCHOOL', classId: null }],
      input,
    );
    expect(recipients.map((r) => r.recipientUserId).sort()).toEqual(['parentA-user', 'parentB-user']);
    expect(recipients.every((r) => r.schoolId === schoolId)).toBe(true);
  });

  it('resolves PARENTS + CLASS to parents of students currently in that Class', () => {
    const recipients = resolveAnnouncementRecipients(
      schoolId,
      [{ audience: 'PARENTS', targetType: 'CLASS', classId: classA }],
      input,
    );
    expect(recipients.map((r) => r.recipientUserId)).toEqual(['parentA-user']);
  });

  it('resolves TEACHERS + SCHOOL to every eligible teacher User', () => {
    const recipients = resolveAnnouncementRecipients(
      schoolId,
      [{ audience: 'TEACHERS', targetType: 'SCHOOL', classId: null }],
      input,
    );
    expect(recipients.map((r) => r.recipientUserId).sort()).toEqual(['teacherA-user', 'teacherB-user']);
  });

  it('resolves TEACHERS + CLASS to teachers with an ACTIVE assignment for that Class', () => {
    const recipients = resolveAnnouncementRecipients(
      schoolId,
      [{ audience: 'TEACHERS', targetType: 'CLASS', classId: classA }],
      input,
    );
    expect(recipients.map((r) => r.recipientUserId)).toEqual(['teacherA-user']);
  });

  it('requires an active SchoolMembership for every audience (Task 009 §26)', () => {
    const noMembershipInput: RecipientResolutionInput = {
      parents: [
        { userId: 'p', activeSchoolMembership: false, childClassIds: [classA] },
        { userId: 'p2', activeSchoolMembership: true, childClassIds: [classA] },
      ],
      teachers: [
        { userId: 't', activeSchoolMembership: false, assignmentClassIds: [classA] },
        { userId: 't2', activeSchoolMembership: true, assignmentClassIds: [classA] },
      ],
    };
    const recipients = resolveAnnouncementRecipients(
      schoolId,
      [
        { audience: 'PARENTS', targetType: 'CLASS', classId: classA },
        { audience: 'TEACHERS', targetType: 'CLASS', classId: classA },
      ],
      noMembershipInput,
    );
    expect(recipients.map((r) => r.recipientUserId).sort()).toEqual(['p2', 't2']);
  });

  it('deduplicates a parent matching CLASS AND SCHOOL targets into one row (Task 009 §23)', () => {
    const recipients = resolveAnnouncementRecipients(
      schoolId,
      [
        { audience: 'PARENTS', targetType: 'CLASS', classId: classA },
        { audience: 'PARENTS', targetType: 'CLASS', classId: classB },
        { audience: 'PARENTS', targetType: 'SCHOOL', classId: null },
      ],
      {
        parents: [
          { userId: 'parentX', activeSchoolMembership: true, childClassIds: [classA, classB] },
        ],
        teachers: [],
      },
    );
    expect(recipients).toEqual([
      { recipientUserId: 'parentX', schoolId, audiences: ['PARENTS'] },
    ]);
  });

  it('returns one snapshot entry per User with ALL matched audiences (Task 009.1 #2)', () => {
    const recipients = resolveAnnouncementRecipients(
      schoolId,
      [
        { audience: 'PARENTS', targetType: 'SCHOOL', classId: null },
        { audience: 'TEACHERS', targetType: 'SCHOOL', classId: null },
      ],
      {
        parents: [{ userId: 'both-user', activeSchoolMembership: true, childClassIds: [] }],
        teachers: [{ userId: 'both-user', activeSchoolMembership: true, assignmentClassIds: [] }],
      },
    );
    expect(recipients).toEqual([
      { recipientUserId: 'both-user', schoolId, audiences: ['PARENTS', 'TEACHERS'] },
    ]);
  });

  it('keeps a single audience when a User matches only one audience (Task 009.1 #1)', () => {
    const recipients = resolveAnnouncementRecipients(
      schoolId,
      [
        { audience: 'PARENTS', targetType: 'CLASS', classId: classA },
        { audience: 'TEACHERS', targetType: 'CLASS', classId: classA },
      ],
      {
        parents: [{ userId: 'only-parent', activeSchoolMembership: true, childClassIds: [classA] }],
        teachers: [],
      },
    );
    expect(recipients).toEqual([
      { recipientUserId: 'only-parent', schoolId, audiences: ['PARENTS'] },
    ]);
  });

  it('deduplicates multiple target matches under the SAME audience (Task 009.1 #3)', () => {
    const recipients = resolveAnnouncementRecipients(
      schoolId,
      [
        { audience: 'PARENTS', targetType: 'CLASS', classId: classA },
        { audience: 'PARENTS', targetType: 'CLASS', classId: classB },
        { audience: 'PARENTS', targetType: 'SCHOOL', classId: null },
      ],
      {
        parents: [
          { userId: 'multi-parent', activeSchoolMembership: true, childClassIds: [classA, classB] },
        ],
        teachers: [],
      },
    );
    expect(recipients).toEqual([
      { recipientUserId: 'multi-parent', schoolId, audiences: ['PARENTS'] },
    ]);
  });

  it('orders audiences canonically regardless of target input order (Task 009.1 #4)', () => {
    const recipients = resolveAnnouncementRecipients(
      schoolId,
      [
        { audience: 'TEACHERS', targetType: 'CLASS', classId: classA },
        { audience: 'PARENTS', targetType: 'CLASS', classId: classA },
        { audience: 'PARENTS', targetType: 'SCHOOL', classId: null },
        { audience: 'TEACHERS', targetType: 'SCHOOL', classId: null },
      ],
      {
        parents: [{ userId: 'both2', activeSchoolMembership: true, childClassIds: [classA] }],
        teachers: [{ userId: 'both2', activeSchoolMembership: true, assignmentClassIds: [classA] }],
      },
    );
    expect(recipients[0].audiences).toEqual(['PARENTS', 'TEACHERS']);
  });

  it('rejects a target with an unknown audience value (Task 009.1 #5)', () => {
    expect(() =>
      resolveAnnouncementRecipients(
        schoolId,
        [
          {
            audience: 'STUDENTS' as unknown as AnnouncementAudience,
            targetType: 'SCHOOL',
            classId: null,
          },
        ],
        input,
      ),
    ).toThrow(AnnouncementResolutionError);
  });

  it('does not exclude the author User when eligible (Task 009 §27)', () => {
    const recipients = resolveAnnouncementRecipients(
      schoolId,
      [{ audience: 'TEACHERS', targetType: 'CLASS', classId: classA }],
      {
        parents: [],
        teachers: [
          { userId: 'author-user', activeSchoolMembership: true, assignmentClassIds: [classA] },
        ],
      },
    );
    expect(recipients.map((r) => r.recipientUserId)).toEqual(['author-user']);
  });

  it('returns deterministic results across multiple audiences and targets', () => {
    const run = () =>
      resolveAnnouncementRecipients(
        schoolId,
        [
          { audience: 'PARENTS', targetType: 'CLASS', classId: classA },
          { audience: 'TEACHERS', targetType: 'CLASS', classId: classB },
          { audience: 'PARENTS', targetType: 'SCHOOL', classId: null },
          { audience: 'TEACHERS', targetType: 'SCHOOL', classId: null },
        ],
        input,
      );
    expect(run()).toEqual(run());
    expect(run().map((r) => r.recipientUserId).sort()).toEqual(
      ['parentA-user', 'parentB-user', 'teacherA-user', 'teacherB-user'].sort(),
    );
    expect(run().every((r) => r.schoolId === schoolId)).toBe(true);
  });

  it('rejects a CLASS target without a Class id (Task 009 §9)', () => {
    expect(() =>
      resolveAnnouncementRecipients(
        schoolId,
        [{ audience: 'PARENTS', targetType: 'CLASS', classId: null }],
        input,
      ),
    ).toThrow(AnnouncementResolutionError);
  });

  it('rejects a SCHOOL target carrying a Class reference (Task 009 §9)', () => {
    expect(() =>
      resolveAnnouncementRecipients(
        schoolId,
        [{ audience: 'PARENTS', targetType: 'SCHOOL', classId: classA }],
        input,
      ),
    ).toThrow(AnnouncementResolutionError);
  });

  it('declares the V1 vocabulary (audiences, target types, statuses)', () => {
    expect(ANNOUNCEMENT_AUDIENCES).toEqual(['PARENTS', 'TEACHERS']);
    expect(ANNOUNCEMENT_TARGET_TYPES).toEqual(['SCHOOL', 'CLASS']);
    expect(ANNOUNCEMENT_STATUSES).toEqual(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']);
    expect(ANNOUNCEMENT_PUBLICATION_STATUSES).toEqual(['SCHEDULED', 'PUBLISHED']);
  });
});