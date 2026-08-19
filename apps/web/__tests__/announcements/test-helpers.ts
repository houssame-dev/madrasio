/**
 * Hermetic PGlite test helpers for the Announcements module (Task 011 §39).
 *
 * Mirrors the `grades/test-helpers` and `notifications/test-helpers` pattern:
 * a fresh PGlite database with the Supabase-compatible `auth` schema, all
 * committed production migrations applied, plus domain seeding for the
 * announcement publication workflows (parents, teachers, students,
 * enrollments, assignments, announcements, versions, targets).
 *
 * Every test gets an isolated database (no cross-test state).
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { authUsers } from 'drizzle-orm/supabase';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import * as schema from '@school/database';

import type { AnnouncementsDb } from '@/lib/modules/announcements/infrastructure/repositories/announcement-repository';

export const migrationsFolder = path.resolve(process.cwd(), '../../database/drizzle/migrations');

export interface AnnouncementsTestDb {
  seed: ReturnType<typeof drizzle<typeof schema>>;
  db: AnnouncementsDb;
  client: PGlite;
}

export async function createAnnouncementsTestDb(): Promise<AnnouncementsTestDb> {
  const client = new PGlite();
  const seed = drizzle(client, { schema });

  await client.exec('CREATE SCHEMA IF NOT EXISTS auth');
  await client.exec(
    `CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY NOT NULL,
      email varchar(255),
      phone text UNIQUE,
      email_confirmed_at timestamp with time zone,
      phone_confirmed_at timestamp with time zone,
      last_sign_in_at timestamp with time zone,
      created_at timestamp with time zone,
      updated_at timestamp with time zone
    )`,
  );

  await migrate(seed, { migrationsFolder });

  return { seed, db: seed as unknown as AnnouncementsDb, client };
}

export interface SeededSchool {
  schoolId: string;
  yearId: string;
  classAId: string;
  classBId: string;
  subjectId: string;
}

/** Seeds a School + AcademicYear + curriculum + stage/level + two Classes + one Subject. */
export async function seedSchool(seed: AnnouncementsTestDb['seed'], name = 'Seed School'): Promise<SeededSchool> {
  const schoolId = randomUUID();
  await seed.insert(schema.schools).values({ id: schoolId, name });

  const yearId = randomUUID();
  await seed
    .insert(schema.academicYears)
    .values({ id: yearId, schoolId, name: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-01', status: 'ACTIVE' });

  const curriculumId = randomUUID();
  await seed.insert(schema.curricula).values({ id: curriculumId, schoolId, name: 'National' });
  const curriculumVersionId = randomUUID();
  await seed
    .insert(schema.curriculumVersions)
    .values({ id: curriculumVersionId, schoolId, curriculumId, name: '2025-2026', status: 'ACTIVE' });

  const stageId = randomUUID();
  await seed.insert(schema.stages).values({ id: stageId, schoolId, name: 'Primary', sequence: 1 });
  const levelId = randomUUID();
  await seed.insert(schema.levels).values({ id: levelId, schoolId, stageId, name: '5th', sequence: 1 });

  const classAId = randomUUID();
  await seed
    .insert(schema.classes)
    .values({ id: classAId, schoolId, academicYearId: yearId, levelId, curriculumVersionId, name: '5A' });
  const classBId = randomUUID();
  await seed
    .insert(schema.classes)
    .values({ id: classBId, schoolId, academicYearId: yearId, levelId, curriculumVersionId, name: '5B' });

  const subjectId = randomUUID();
  await seed.insert(schema.subjects).values({ id: subjectId, schoolId, name: 'Mathematics' });

  return { schoolId, yearId, classAId, classBId, subjectId };
}

/** Seeds a User (auth + users + ACTIVE SchoolMembership). */
export async function seedUser(
  seed: AnnouncementsTestDb['seed'],
  schoolId: string,
  role: 'PARENT' | 'TEACHER' | 'SCHOOL_ADMIN' | 'SUPER_ADMIN' = 'PARENT',
): Promise<string> {
  const userId = randomUUID();
  await seed.insert(authUsers).values({ id: userId });
  await seed.insert(schema.users).values({ id: userId });
  await seed.insert(schema.schoolMemberships).values({ schoolId, userId, role, status: 'ACTIVE' });
  return userId;
}

export interface SeededAnnouncement {
  announcementId: string;
  versionId: string;
  authorUserId: string;
}

/** Seeds a DRAFT Announcement with its first Version (content snapshot). */
export async function seedAnnouncement(
  seed: AnnouncementsTestDb['seed'],
  schoolId: string,
  authorUserId: string,
  title = 'Reunion',
  body = 'Body',
): Promise<SeededAnnouncement> {
  const announcementId = randomUUID();
  await seed
    .insert(schema.announcements)
    .values({ id: announcementId, schoolId, status: 'DRAFT', createdBy: authorUserId });

  const versionId = await seedVersion(seed, schoolId, announcementId, 1, title, body, authorUserId);

  return { announcementId, versionId, authorUserId };
}

/** Creates an ADDITIONAL Version for an existing Announcement. */
export async function seedVersion(
  seed: AnnouncementsTestDb['seed'],
  schoolId: string,
  announcementId: string,
  versionNumber: number,
  title: string,
  body: string,
  authorUserId: string,
): Promise<string> {
  const versionId = randomUUID();
  await seed
    .insert(schema.announcementVersions)
    .values({ id: versionId, schoolId, announcementId, versionNumber, title, body, createdBy: authorUserId });
  return versionId;
}

export async function seedTarget(
  seed: AnnouncementsTestDb['seed'],
  schoolId: string,
  versionId: string,
  audience: 'PARENTS' | 'TEACHERS',
  targetType: 'SCHOOL' | 'CLASS',
  academicYearId: string,
  classId: string | null = null,
): Promise<void> {
  await seed
    .insert(schema.announcementTargets)
    .values({ schoolId, announcementVersionId: versionId, audience, targetType, academicYearId, classId });
}

export async function seedParent(
  seed: AnnouncementsTestDb['seed'],
  schoolId: string,
  userId: string,
): Promise<string> {
  const parentId = randomUUID();
  await seed
    .insert(schema.parents)
    .values({ id: parentId, schoolId, userId, firstName: 'Nadia', lastName: 'Benali' });
  return parentId;
}

export async function seedTeacher(
  seed: AnnouncementsTestDb['seed'],
  schoolId: string,
  userId: string,
): Promise<string> {
  const teacherId = randomUUID();
  await seed
    .insert(schema.teachers)
    .values({ id: teacherId, schoolId, userId, firstName: 'Karim', lastName: 'Alaoui' });
  return teacherId;
}

export async function seedStudent(seed: AnnouncementsTestDb['seed'], schoolId: string): Promise<string> {
  const studentId = randomUUID();
  await seed
    .insert(schema.students)
    .values({ id: studentId, schoolId, firstName: 'Amine', lastName: 'Benali' });
  return studentId;
}

export async function seedEnrollment(
  seed: AnnouncementsTestDb['seed'],
  schoolId: string,
  studentId: string,
  academicYearId: string,
  classId: string,
  status: 'ACTIVE' | 'ENDED' = 'ACTIVE',
): Promise<void> {
  await seed
    .insert(schema.studentEnrollments)
    .values({ schoolId, studentId, academicYearId, classId, status, effectiveFrom: '2025-09-01' });
}

export async function seedParentStudent(
  seed: AnnouncementsTestDb['seed'],
  schoolId: string,
  parentId: string,
  studentId: string,
  status: 'ACTIVE' | 'ENDED' = 'ACTIVE',
): Promise<void> {
  await seed
    .insert(schema.parentStudents)
    .values({ schoolId, parentId, studentId, status });
}

export async function seedAssignment(
  seed: AnnouncementsTestDb['seed'],
  schoolId: string,
  teacherId: string,
  classId: string,
  academicYearId: string,
  subjectId: string,
  status: 'ACTIVE' | 'ENDED' = 'ACTIVE',
): Promise<void> {
  await seed
    .insert(schema.teacherAssignments)
    .values({ schoolId, teacherId, classId, subjectId, academicYearId, status, effectiveFrom: '2025-09-01' });
}