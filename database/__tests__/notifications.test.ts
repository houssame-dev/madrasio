import { and, eq, sql } from 'drizzle-orm';
import { authUsers } from 'drizzle-orm/supabase';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../drizzle/schema';
import { createTestDb, type Db } from './helpers';

/**
 * Notifications foundation — database integration tests (Task 010 §28).
 *
 * These tests verify the SCHEMA invariants only:
 * - Notification creation requires a valid School + recipient User + a
 *   SchoolMembership in the SAME School (composite FK, ADR-007)
 * - Read state defaults to unread (read_at NULL) and can be marked
 * - Notification type validation + type↔source consistency (CHECK)
 * - Idempotency: one event + one recipient ⇒ at most one notification
 * - Historical integrity: notifications survive Announcement revision,
 *   Result revision, ParentStudent/TeacherAssignment changes, membership
 *   deactivation and source archival
 * - Conservative deletion (RESTRICT on School / recipient User)
 *
 * Processing (outbox drain, idempotent replay, snapshot-based recipients) is
 * the Task 010 §29–§31 application behavior tested in apps/web.
 */
let db: Db;

async function createSchool(name: string) {
  const [school] = await db.insert(schema.schools).values({ name }).returning();
  return school;
}

async function createUser() {
  const id = randomUUID();
  await db.insert(authUsers).values({ id });
  await db.insert(schema.users).values({ id });
  return id;
}

async function createMembership(schoolId: string, userId: string, status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE') {
  const [row] = await db
    .insert(schema.schoolMemberships)
    .values({ schoolId, userId, role: 'PARENT', status })
    .returning();
  return row;
}

async function createAcademicYear(schoolId: string, name: string, startDate = '2025-09-01', endDate = '2026-07-01') {
  const [row] = await db
    .insert(schema.academicYears)
    .values({ schoolId, name, startDate, endDate })
    .returning();
  return row;
}

async function createAcademicPeriod(
  schoolId: string,
  academicYearId: string,
  name: string,
  sequence = 1,
  startDate = '2025-09-01',
  endDate = '2025-12-20',
) {
  const [row] = await db
    .insert(schema.academicPeriods)
    .values({ schoolId, academicYearId, name, sequence, startDate, endDate })
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

async function createStudent(schoolId: string, firstName = 'Amine', lastName = 'Benali') {
  const [row] = await db.insert(schema.students).values({ schoolId, firstName, lastName }).returning();
  return row;
}

async function createTeacher(schoolId: string, firstName = 'Karim', lastName = 'Alaoui') {
  const [row] = await db
    .insert(schema.teachers)
    .values({ schoolId, firstName, lastName })
    .returning();
  return row;
}

async function createParent(schoolId: string, userId: string, firstName = 'Nadia', lastName = 'Benali') {
  const [row] = await db
    .insert(schema.parents)
    .values({ schoolId, userId, firstName, lastName })
    .returning();
  return row;
}

async function createSubject(schoolId: string, name: string) {
  const [row] = await db.insert(schema.subjects).values({ schoolId, name }).returning();
  return row;
}

async function createEnrollment(
  schoolId: string,
  studentId: string,
  academicYearId: string,
  classId: string,
  status: 'ACTIVE' | 'ENDED' = 'ACTIVE',
  effectiveFrom = '2025-09-01',
) {
  const [row] = await db
    .insert(schema.studentEnrollments)
    .values({ schoolId, studentId, academicYearId, classId, status, effectiveFrom })
    .returning();
  return row;
}

async function createAnnouncement(schoolId: string, createdBy: string, status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED' = 'DRAFT') {
  const [row] = await db.insert(schema.announcements).values({ schoolId, createdBy, status }).returning();
  return row;
}

async function createVersion(
  schoolId: string,
  announcementId: string,
  versionNumber: number,
  title: string,
  body: string,
  createdBy: string,
) {
  const [row] = await db
    .insert(schema.announcementVersions)
    .values({ schoolId, announcementId, versionNumber, title, body, createdBy })
    .returning();
  return row;
}

async function createPublication(
  schoolId: string,
  announcementId: string,
  announcementVersionId: string,
  publicationVersion: number,
  publishedBy: string,
  idempotencyKey: string = randomUUID(),
) {
  const [row] = await db
    .insert(schema.announcementPublications)
    .values({ schoolId, announcementId, announcementVersionId, publicationVersion, publishedBy, idempotencyKey, status: 'PUBLISHED', publishedAt: new Date() })
    .returning();
  return row;
}

async function createSnapshot(schoolId: string, publicationId: string, recipientUserId: string, audiences: string[]) {
  const [row] = await db
    .insert(schema.publicationRecipientSnapshots)
    .values({ schoolId, publicationId, recipientUserId, audiences })
    .returning();
  return row;
}

/** The result-revision test scaffolding (year + period + curriculum/version + stage/level + class). */
async function academicContext(schoolId: string, yearName = '2025/2026', className = 'Class A') {
  const year = await createAcademicYear(schoolId, yearName);
  const period = await createAcademicPeriod(schoolId, year.id, 'Term 1');
  const curriculum = await createCurriculum(schoolId, 'National Curriculum');
  const version = await createCurriculumVersion(schoolId, curriculum.id, '2025-2026');
  const stage = await createStage(schoolId, 'Primary');
  const level = await createLevel(schoolId, stage.id, '1st Year');
  const klass = await createClass(schoolId, year.id, level.id, version.id, className);
  return { year, period, version, level, klass };
}

/** Minimal valid GradingRules payload for the configuration-version seed. */
const DEFAULT_RULES = {
  schemaVersion: 1,
  periodCalculation: { mode: 'SIMPLE_AVERAGE' },
  annualCalculation: { mode: 'SIMPLE_AVERAGE' },
  assessmentWeighting: { mode: 'EQUAL' },
  coefficientUsage: { mode: 'IGNORE' },
  rounding: { mode: 'HALF_UP', scale: 2 },
  thresholds: { maxScore: 20, passingScore: 10 },
  requiredAssessments: { types: ['EXAM'] },
} as const;

async function createGradingConfiguration(schoolId: string, name: string) {
  const [row] = await db.insert(schema.gradingConfigurations).values({ schoolId, name }).returning();
  return row;
}

async function createGradingConfigurationVersion(schoolId: string, gradingConfigurationId: string, versionNumber: number) {
  const [row] = await db
    .insert(schema.gradingConfigurationVersions)
    .values({ schoolId, gradingConfigurationId, versionNumber, status: 'ACTIVE', rules: DEFAULT_RULES as unknown as typeof schema.gradingConfigurationVersions.$inferSelect['rules'] })
    .returning();
  return row;
}

async function createSubjectResult(
  schoolId: string,
  studentId: string,
  academicYearId: string,
  academicPeriodId: string,
  classId: string,
  subjectId: string,
  gradingConfigurationVersionId: string,
  value = '15.50',
) {
  const [row] = await db
    .insert(schema.subjectResults)
    .values({ schoolId, studentId, academicYearId, academicPeriodId, classId, subjectId, gradingConfigurationVersionId, value, status: 'FINALIZED' })
    .returning();
  return row;
}

async function createResultPublication(
  schoolId: string,
  subjectResult: { id: string; studentId: string; academicYearId: string; academicPeriodId: string; classId: string; gradingConfigurationVersionId: string },
  publicationVersion: number,
  publishedBy: string,
  resultValue = '15.50',
) {
  const [row] = await db
    .insert(schema.resultPublications)
    .values({
      schoolId,
      resultType: 'SUBJECT',
      subjectResultId: subjectResult.id,
      studentId: subjectResult.studentId,
      academicYearId: subjectResult.academicYearId,
      academicPeriodId: subjectResult.academicPeriodId,
      classId: subjectResult.classId,
      resultValue,
      gradingConfigurationVersionId: subjectResult.gradingConfigurationVersionId,
      publicationVersion,
      publishedBy,
      idempotencyKey: randomUUID(),
      publishedAt: new Date(),
    })
    .returning();
  return row;
}

interface CreateNotificationOptions {
  type?: 'ANNOUNCEMENT_PUBLISHED' | 'RESULT_PUBLISHED' | 'RESULT_REVISED';
  sourceType?: 'ANNOUNCEMENT_PUBLICATION' | 'RESULT_PUBLICATION';
  sourceId?: string;
  title?: string;
  body?: string;
  sourceEventId?: string;
}

async function createNotification(schoolId: string, recipientUserId: string, options: CreateNotificationOptions = {}) {
  const [row] = await db
    .insert(schema.notifications)
    .values({
      schoolId,
      recipientUserId,
      notificationType: options.type ?? 'ANNOUNCEMENT_PUBLISHED',
      sourceType: options.sourceType ?? 'ANNOUNCEMENT_PUBLICATION',
      sourceId: options.sourceId ?? randomUUID(),
      title: options.title ?? 'Reunion',
      body: options.body ?? 'A new announcement was published for your school.',
      sourceEventId: options.sourceEventId ?? randomUUID(),
    })
    .returning();
  return row;
}

beforeEach(async () => {
  ({ db } = await createTestDb());
});

describe('notifications — creation + tenant integrity (Task 010 §28.1–§28.6)', () => {
  it('creates a valid notification for a recipient with an ACTIVE membership', async () => {
    const school = await createSchool('School A');
    const recipient = await createUser();
    await createMembership(school.id, recipient);

    const notification = await createNotification(school.id, recipient);

    expect(notification.id).toBeDefined();
    expect(notification.schoolId).toBe(school.id);
    expect(notification.recipientUserId).toBe(recipient);
    expect(notification.notificationType).toBe('ANNOUNCEMENT_PUBLISHED');
    expect(notification.sourceType).toBe('ANNOUNCEMENT_PUBLICATION');
    expect(notification.sourceEventId).toBeDefined();
    expect(notification.sourceId).toBeDefined();
    expect(notification.title).toBe('Reunion');
    expect(notification.body).toContain('announcement');
    expect(notification.readAt).toBeNull();
  });

  it('read state defaults to unread (read_at NULL) and can be marked read (Task 010 §28.7)', async () => {
    const school = await createSchool('School A');
    const recipient = await createUser();
    await createMembership(school.id, recipient);
    const notification = await createNotification(school.id, recipient);

    const marked = await db
      .update(schema.notifications)
      .set({ readAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.notifications.id, notification.id), eq(schema.notifications.schoolId, school.id)))
      .returning();
    expect(marked[0].readAt).toBeInstanceOf(Date);
  });

  it('rejects an invalid notification type (Task 010 §28.8)', async () => {
    const school = await createSchool('School A');
    const recipient = await createUser();
    await createMembership(school.id, recipient);

    await expect(
      db.execute(
        sql`INSERT INTO notifications (school_id, recipient_user_id, notification_type, title, body, source_event_id, source_type, source_id)
            VALUES (${school.id}, ${recipient}, 'ATTENDANCE_ALERT', 'T', 'b', ${randomUUID()}, 'ANNOUNCEMENT_PUBLICATION', ${randomUUID()})`,
      ),
    ).rejects.toThrow();
  });

  it('rejects an invalid school context (Task 010 §28.9)', async () => {
    const recipient = await createUser();

    await expect(createNotification(randomUUID(), recipient)).rejects.toThrow();
  });

  it('rejects an invalid recipient user (Task 010 §28.10)', async () => {
    const school = await createSchool('School A');

    await expect(createNotification(school.id, randomUUID())).rejects.toThrow();
  });

  it('rejects a recipient who has NO membership in the school (Task 010 §28.11 composite FK)', async () => {
    const schoolA = await createSchool('School A');
    const schoolB = await createSchool('School B');
    const recipient = await createUser();
    await createMembership(schoolB.id, recipient);

    await expect(createNotification(schoolA.id, recipient)).rejects.toThrow();
  });

  it('rejects a type↔source mismatch (CHECK, Task 010 §28.8b)', async () => {
    const school = await createSchool('School A');
    const recipient = await createUser();
    await createMembership(school.id, recipient);

    await expect(
      createNotification(school.id, recipient, {
        type: 'ANNOUNCEMENT_PUBLISHED',
        sourceType: 'RESULT_PUBLICATION',
      }),
    ).rejects.toThrow();
  });

  it('allows a RESULT_PUBLISHED notification with a RESULT_PUBLICATION source', async () => {
    const school = await createSchool('School A');
    const recipient = await createUser();
    await createMembership(school.id, recipient);

    const notification = await createNotification(school.id, recipient, {
      type: 'RESULT_PUBLISHED',
      sourceType: 'RESULT_PUBLICATION',
    });

    expect(notification.notificationType).toBe('RESULT_PUBLISHED');
    expect(notification.sourceType).toBe('RESULT_PUBLICATION');
  });

  it('allows an INACTIVE membership to satisfy the composite FK (historical survival, Task 010 §23)', async () => {
    const school = await createSchool('School A');
    const recipient = await createUser();
    await createMembership(school.id, recipient, 'INACTIVE');

    const notification = await createNotification(school.id, recipient);

    expect(notification.recipientUserId).toBe(recipient);
  });
});

describe('notifications — idempotency (Task 010 §28.12–§28.13)', () => {
  it('rejects two notifications for the same source event + recipient', async () => {
    const school = await createSchool('School A');
    const recipient = await createUser();
    await createMembership(school.id, recipient);
    const sourceEventId = randomUUID();

    await createNotification(school.id, recipient, { sourceEventId });
    await expect(createNotification(school.id, recipient, { sourceEventId })).rejects.toThrow();
  });

  it('allows the same event for DIFFERENT recipients', async () => {
    const school = await createSchool('School A');
    const recipientA = await createUser();
    const recipientB = await createUser();
    await createMembership(school.id, recipientA);
    await createMembership(school.id, recipientB);
    const sourceEventId = randomUUID();

    await createNotification(school.id, recipientA, { sourceEventId });
    const b = await createNotification(school.id, recipientB, { sourceEventId });

    expect(b.recipientUserId).toBe(recipientB);
  });

  it('allows DIFFERENT events for the same recipient', async () => {
    const school = await createSchool('School A');
    const recipient = await createUser();
    await createMembership(school.id, recipient);

    await createNotification(school.id, recipient, { type: 'ANNOUNCEMENT_PUBLISHED', sourceType: 'ANNOUNCEMENT_PUBLICATION' });
    const second = await createNotification(school.id, recipient, { type: 'RESULT_PUBLISHED', sourceType: 'RESULT_PUBLICATION' });

    expect(second.notificationType).toBe('RESULT_PUBLISHED');
  });
});

describe('notifications — historical integrity (Task 010 §28.14–§28.19)', () => {
  it('notification content survives an Announcement revision', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const recipient = await createUser();
    await createMembership(school.id, recipient);

    const ann = await createAnnouncement(school.id, author);
    const v1 = await createVersion(school.id, ann.id, 1, 'Original Title', 'Original body', author);
    const pub1 = await createPublication(school.id, ann.id, v1.id, 1, author);
    await createSnapshot(school.id, pub1.id, recipient, ['PARENTS']);
    const notification = await createNotification(school.id, recipient, { sourceId: pub1.id, title: 'Original Title' });

    // Revision: new Version + new Publication, same Announcement.
    const v2 = await createVersion(school.id, ann.id, 2, 'Revised Title', 'Revised body', author);
    const pub2 = await createPublication(school.id, ann.id, v2.id, 2, author);
    await createSnapshot(school.id, pub2.id, recipient, ['PARENTS']);

    const [stored] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, notification.id));
    expect(stored.sourceId).toBe(pub1.id);
    expect(stored.title).toBe('Original Title');
    expect(stored.body).toBe('A new announcement was published for your school.');
    expect(pub2.publicationVersion).toBe(2);
  });

  it('notification survives a Result revision', async () => {
    const school = await createSchool('School A');
    const publishedBy = await createUser();
    const recipient = await createUser();
    await createMembership(school.id, recipient);
    const { year, period, klass } = await academicContext(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const config = await createGradingConfiguration(school.id, 'Default');
    const configVersion = await createGradingConfigurationVersion(school.id, config.id, 1);
    const student = await createStudent(school.id);
    await createEnrollment(school.id, student.id, year.id, klass.id);
    const subjectResult = await createSubjectResult(school.id, student.id, year.id, period.id, klass.id, subject.id, configVersion.id);
    const pub1 = await createResultPublication(school.id, subjectResult, 1, publishedBy);
    const notification = await createNotification(school.id, recipient, {
      type: 'RESULT_PUBLISHED',
      sourceType: 'RESULT_PUBLICATION',
      sourceId: pub1.id,
      title: 'Result published',
    });

    // Revision: new ResultPublication row (version 2) for the SAME subject result.
    const pub2 = await createResultPublication(school.id, subjectResult, 2, publishedBy, '16.00');

    const [stored] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, notification.id));
    expect(stored.sourceId).toBe(pub1.id);
    expect(stored.title).toBe('Result published');
    expect(pub2.publicationVersion).toBe(2);
    expect(pub2.resultValue).toBe('16.00');
  });

  it('notification survives a ParentStudent change', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const parentUser = await createUser();
    await createMembership(school.id, parentUser);
    const parent = await createParent(school.id, parentUser);
    const student = await createStudent(school.id);
    await createEnrollment(school.id, student.id, year.id, klass.id);
    const [link] = await db
      .insert(schema.parentStudents)
      .values({ schoolId: school.id, parentId: parent.id, studentId: student.id, status: 'ACTIVE' })
      .returning();
    const notification = await createNotification(school.id, parentUser);

    await db
      .update(schema.parentStudents)
      .set({ status: 'ENDED', updatedAt: new Date() })
      .where(eq(schema.parentStudents.id, link.id));

    const [stored] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, notification.id));
    expect(stored.recipientUserId).toBe(parentUser);
  });

  it('notification survives a TeacherAssignment change', async () => {
    const school = await createSchool('School A');
    const { year, klass } = await academicContext(school.id);
    const subject = await createSubject(school.id, 'Mathematics');
    const teacherUser = await createUser();
    await createMembership(school.id, teacherUser);
    const teacher = await createTeacher(school.id);
    await db.update(schema.teachers).set({ userId: teacherUser }).where(eq(schema.teachers.id, teacher.id));
    const [assignment] = await db
      .insert(schema.teacherAssignments)
      .values({ schoolId: school.id, teacherId: teacher.id, classId: klass.id, subjectId: subject.id, academicYearId: year.id, status: 'ACTIVE', effectiveFrom: '2025-09-01' })
      .returning();
    const notification = await createNotification(school.id, teacherUser);

    await db
      .update(schema.teacherAssignments)
      .set({ status: 'ENDED', updatedAt: new Date() })
      .where(eq(schema.teacherAssignments.id, assignment.id));

    const [stored] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, notification.id));
    expect(stored.recipientUserId).toBe(teacherUser);
  });

  it('notification survives source archival', async () => {
    const school = await createSchool('School A');
    const author = await createUser();
    const recipient = await createUser();
    await createMembership(school.id, recipient);
    const ann = await createAnnouncement(school.id, author);
    const version = await createVersion(school.id, ann.id, 1, 'Reunion', 'Body', author);
    const pub = await createPublication(school.id, ann.id, version.id, 1, author);
    await createSnapshot(school.id, pub.id, recipient, ['PARENTS']);
    const notification = await createNotification(school.id, recipient, { sourceId: pub.id });

    await db
      .update(schema.announcements)
      .set({ status: 'ARCHIVED', updatedAt: new Date() })
      .where(eq(schema.announcements.id, ann.id));

    const [stored] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, notification.id));
    expect(stored.sourceId).toBe(pub.id);
  });
});

describe('notifications — conservative deletion (Task 010 §28.20)', () => {
  it('restricts deleting a School that still has Notifications', async () => {
    const school = await createSchool('School A');
    const recipient = await createUser();
    await createMembership(school.id, recipient);
    await createNotification(school.id, recipient);

    await expect(db.delete(schema.schools).where(eq(schema.schools.id, school.id))).rejects.toThrow();
  });

  it('restricts deleting a recipient User that still has Notifications', async () => {
    const school = await createSchool('School A');
    const recipient = await createUser();
    await createMembership(school.id, recipient);
    await createNotification(school.id, recipient);

    await expect(db.delete(schema.users).where(eq(schema.users.id, recipient))).rejects.toThrow();
  });
});