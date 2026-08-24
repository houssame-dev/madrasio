/**
 * Hermetic PGlite test helpers for the Notifications module (Task 010 §29–§31).
 *
 * Mirrors the `grades/test-helpers` and `authorization/test-helpers` pattern:
 * a fresh PGlite database with the Supabase-compatible `auth` schema, all
 * committed production migrations applied (including migration 0012), plus
 * domain seeding for notification processing workflows.
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

import type { NotificationsDb } from '@/lib/modules/notifications/infrastructure/repositories/notification-repository';

export const migrationsFolder = path.resolve(process.cwd(), '../../database/drizzle/migrations');

export interface NotificationsTestDb {
  seed: ReturnType<typeof drizzle<typeof schema>>;
  db: NotificationsDb;
  client: PGlite;
}

export async function createNotificationsTestDb(): Promise<NotificationsTestDb> {
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

  return { seed, db: seed as unknown as NotificationsDb, client };
}

export interface SeededSchool {
  schoolId: string;
  yearId: string;
  classId: string;
}

/** Seeds a School + AcademicYear + minimal academic structure for one Class. */
export async function seedSchool(seed: NotificationsTestDb['seed'], name = 'Seed School'): Promise<SeededSchool> {
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

  const classId = randomUUID();
  await seed
    .insert(schema.classes)
    .values({ id: classId, schoolId, academicYearId: yearId, levelId, curriculumVersionId, name: '5A' });

  return { schoolId, yearId, classId };
}

/**
 * Seeds a User (auth + users + ACTIVE SchoolMembership) so they can be a
 * notification recipient (the notifications composite FK requires the
 * membership, Task 010 §16).
 */
export async function seedUser(
  seed: NotificationsTestDb['seed'],
  schoolId: string,
  role: 'PARENT' | 'TEACHER' | 'SCHOOL_ADMIN' | 'SUPER_ADMIN' = 'PARENT',
): Promise<string> {
  const userId = randomUUID();
  await seed.insert(authUsers).values({ id: userId });
  await seed.insert(schema.users).values({ id: userId });
  await seed.insert(schema.schoolMemberships).values({ schoolId, userId, role, status: 'ACTIVE' });
  return userId;
}

export interface SeededPublication {
  announcementId: string;
  versionId: string;
  publicationId: string;
  authorUserId: string;
}

/**
 * Seeds a PUBLISHED AnnouncementPublication with its immutable recipient
 * snapshot (the recipients are persisted EXACTLY as provided — the resolver
 * that builds the snapshot at publication time is the announcements module's
 * concern, Task 010 §14).
 */
export async function seedAnnouncementPublication(
  seed: NotificationsTestDb['seed'],
  ctx: { schoolId: string },
  input: { title: string; body?: string; recipients: string[] },
): Promise<SeededPublication> {
  const authorUserId = await seedUser(seed, ctx.schoolId, 'SCHOOL_ADMIN');

  const announcementId = randomUUID();
  await seed
    .insert(schema.announcements)
    .values({ id: announcementId, schoolId: ctx.schoolId, status: 'PUBLISHED', createdBy: authorUserId });

  const versionId = randomUUID();
  await seed
    .insert(schema.announcementVersions)
    .values({ id: versionId, schoolId: ctx.schoolId, announcementId, versionNumber: 1, title: input.title, body: input.body ?? 'Body', createdBy: authorUserId });

  const publicationId = randomUUID();
  await seed
    .insert(schema.announcementPublications)
    .values({
      id: publicationId,
      schoolId: ctx.schoolId,
      announcementId,
      announcementVersionId: versionId,
      publicationVersion: 1,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      publishedBy: authorUserId,
      idempotencyKey: randomUUID(),
    });

  for (const recipientUserId of input.recipients) {
    await seed
      .insert(schema.publicationRecipientSnapshots)
      .values({ schoolId: ctx.schoolId, publicationId, recipientUserId, audiences: ['PARENTS'] });
  }

  return { announcementId, versionId, publicationId, authorUserId };
}

/** Inserts one PENDING outbox event with the given payload. */
export async function seedOutboxEvent(
  seed: NotificationsTestDb['seed'],
  eventType: string,
  payload: Record<string, unknown>,
): Promise<{ id: string; status: string }> {
  const [row] = await seed
    .insert(schema.outboxEvents)
    .values({ eventType, payload: payload as unknown as typeof schema.outboxEvents.$inferInsert['payload'] })
    .returning({ id: schema.outboxEvents.id, status: schema.outboxEvents.status });
  return row;
}
