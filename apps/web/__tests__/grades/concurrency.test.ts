/**
 * Concurrent publication hardening (Task 006D.1 §5).
 *
 * Simulates two publication attempts for the SAME logical publication and
 * verifies the invariants that must hold under ANY interleaving:
 *
 *   - exactly one logical publication sequence/version is created
 *   - no duplicate publication snapshot
 *   - no duplicate successful publication
 *   - outbox state stays consistent (one event per logical publication)
 *
 * The protection mechanism is the DATABASE (unique `idempotency_key` and the
 * partial `(result_id, publication_version)` unique indexes) inside the
 * publication transaction — never application locks (no Redis, CLAUDE.md §5.4).
 *
 * PGlite executes on a single connection, so the two calls interleave at await
 * boundaries and the DB constraints are what make the outcome deterministic:
 * whichever interleaving occurs, the assertions below must hold.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { eq } from 'drizzle-orm';

import * as schema from '@school/database';

import { ResultDomainError } from '@/lib/modules/grades/application/result-errors';
import {
  calculateSubjectResult,
  finalizeResult,
  publishResult,
  reviseResult,
  type PublishResultView,
} from '@/lib/modules/grades/application';

import {
  createGradesTestDb,
  seedGradebook,
  seedGrades,
  seedSchool,
  seedStudentAndActors,
  type GradesTestDb,
  type SeededSchool,
  type SeededStudent,
} from './test-helpers';

let test: GradesTestDb;

beforeEach(async () => {
  test = await createGradesTestDb();
});

afterEach(async () => {
  await test.client.close();
});

function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  return candidate?.code === '23505' || candidate?.cause?.code === '23505';
}

async function seedCalculatedAndFinalized(): Promise<{
  school: SeededSchool;
  actors: SeededStudent;
  resultId: string;
  examGradeId: string;
}> {
  const school = await seedSchool(test.seed);
  const actors = await seedStudentAndActors(test.seed, school.schoolId, school.yearId, school.classId);
  const gradebook = await seedGradebook(test.seed, school.schoolId, school, school.subjectMathId);
  const grades = await seedGrades(
    test.seed, school.schoolId, gradebook.gradebookId, gradebook, actors.studentId, '16', '18',
  );

  const calculated = await calculateSubjectResult(test.db, {
    userId: actors.schoolAdminUserId,
    schoolId: school.schoolId,
    gradebookId: gradebook.gradebookId,
    studentId: actors.studentId,
  });
  await finalizeResult(test.db, {
    userId: actors.schoolAdminUserId,
    schoolId: school.schoolId,
    resultType: 'SUBJECT',
    resultId: calculated.id,
  });

  return { school, actors, resultId: calculated.id, examGradeId: grades.examGradeId };
}

async function seedPublishedV1(): Promise<{
  school: SeededSchool;
  actors: SeededStudent;
  resultId: string;
  examGradeId: string;
  published: PublishResultView;
}> {
  const { school, actors, resultId, examGradeId } = await seedCalculatedAndFinalized();
  const published = await publishResult(test.db, {
    userId: actors.schoolAdminUserId,
    schoolId: school.schoolId,
    resultType: 'SUBJECT',
    resultId,
    idempotencyKey: '00000000-0000-4000-8000-0000000000c0',
  });
  return { school, actors, resultId, examGradeId, published };
}

function publicationInsertValues(
  published: PublishResultView,
  overrides: Partial<{
    publicationVersion: number;
    idempotencyKey: string;
    resultValue: string;
  }> = {},
) {
  return {
    schoolId: published.schoolId,
    resultType: published.resultType,
    subjectResultId: published.resultId,
    studentId: published.studentId,
    academicYearId: published.academicYearId,
    academicPeriodId: published.academicPeriodId,
    classId: published.classId,
    resultValue: published.resultValue,
    gradingConfigurationVersionId: published.gradingConfigurationVersionId,
    publicationVersion: published.publicationVersion,
    publishedBy: published.publishedBy,
    idempotencyKey: published.idempotencyKey,
    ...overrides,
  };
}

describe('Concurrent publication (Task 006D.1 §5)', () => {
  it('two concurrent initial publishes (same idempotency key) create exactly ONE publication v1 and ONE outbox event', async () => {
    const { school, actors, resultId } = await seedCalculatedAndFinalized();
    const key = '00000000-0000-4000-8000-0000000000c1';

    const attempts = await Promise.allSettled([
      publishResult(test.db, {
        userId: actors.schoolAdminUserId,
        schoolId: school.schoolId,
        resultType: 'SUBJECT',
        resultId,
        idempotencyKey: key,
      }),
      publishResult(test.db, {
        userId: actors.schoolAdminUserId,
        schoolId: school.schoolId,
        resultType: 'SUBJECT',
        resultId,
        idempotencyKey: key,
      }),
    ]);

    // Exactly ONE logical publication snapshot (version 1) exists.
    const publications = await test.seed
      .select()
      .from(schema.resultPublications)
      .where(eq(schema.resultPublications.schoolId, school.schoolId));
    expect(publications).toHaveLength(1);
    expect(publications[0].publicationVersion).toBe(1);

    // Exactly ONE outbox event.
    const events = await test.seed.select().from(schema.outboxEvents);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('ResultPublished');

    // At least one attempt reported success, and every success points at the
    // SAME canonical publication row. Any rejected attempt can only be the
    // controlled RESULT_ALREADY_PUBLISHED (a stale "latest" read racing the
    // winner) — never a duplicate publication.
    const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThan(0);
    for (const attempt of fulfilled) {
      expect(attempt.value.publicationId).toBe(publications[0].id);
      expect(attempt.value.publicationVersion).toBe(1);
    }
    for (const attempt of attempts) {
      if (attempt.status === 'rejected') {
        expect(attempt.reason).toSatisfy(
          (error: unknown) => error instanceof ResultDomainError && error.featureCode === 'RESULT_ALREADY_PUBLISHED',
        );
      }
    }
  });

  it('two concurrent REVISION publications (same idempotency key) create exactly ONE version 2 snapshot and ONE revision event', async () => {
    const { school, actors, resultId } = await seedPublishedV1();
    const key = '00000000-0000-4000-8000-0000000000c2';

    const attempts = await Promise.all([
      publishResult(test.db, {
        userId: actors.schoolAdminUserId,
        schoolId: school.schoolId,
        resultType: 'SUBJECT',
        resultId,
        idempotencyKey: key,
        revision: true,
      }),
      publishResult(test.db, {
        userId: actors.schoolAdminUserId,
        schoolId: school.schoolId,
        resultType: 'SUBJECT',
        resultId,
        idempotencyKey: key,
        revision: true,
      }),
    ]);

    // Both attempts report success on the SAME version-2 publication row.
    expect(attempts[0].publicationId).toBe(attempts[1].publicationId);
    expect(attempts[0].publicationVersion).toBe(2);
    expect(attempts[1].publicationVersion).toBe(2);

    // Exactly one v1 and one v2 snapshot — no duplicate version.
    const publications = await test.seed
      .select()
      .from(schema.resultPublications)
      .where(eq(schema.resultPublications.subjectResultId, resultId));
    expect(publications.map((p) => p.publicationVersion)).toEqual([1, 2]);

    // One ResultPublished (v1) + one ResultRevisionPublished (v2) — no extras.
    const events = await test.seed.select().from(schema.outboxEvents);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.eventType).sort()).toEqual(['ResultPublished', 'ResultRevisionPublished']);
  });

  it('two concurrent same-key revision orchestrations commit one recalculation, publication and event', async () => {
    const { school, actors, resultId, examGradeId } = await seedPublishedV1();
    await test.seed.update(schema.grades).set({ score: '20' }).where(eq(schema.grades.id, examGradeId));
    const key = '00000000-0000-4000-8000-0000000000c8';

    const attempts = await Promise.all([
      reviseResult(test.db, {
        userId: actors.schoolAdminUserId,
        schoolId: school.schoolId,
        resultType: 'SUBJECT',
        resultId,
        idempotencyKey: key,
      }),
      reviseResult(test.db, {
        userId: actors.schoolAdminUserId,
        schoolId: school.schoolId,
        resultType: 'SUBJECT',
        resultId,
        idempotencyKey: key,
      }),
    ]);

    expect(attempts[0].publicationId).toBe(attempts[1].publicationId);
    expect(attempts[0]).toMatchObject({ publicationVersion: 2, resultValue: '18.00' });
    const publications = await test.seed.select().from(schema.resultPublications)
      .where(eq(schema.resultPublications.subjectResultId, resultId));
    expect(publications.map((row) => row.publicationVersion)).toEqual([1, 2]);
    expect(await test.seed.select().from(schema.outboxEvents)).toHaveLength(2);
  });

  it('the database rejects a duplicate publication snapshot (same result + version)', async () => {
    const { published } = await seedPublishedV1();

    await expect(
      test.seed.insert(schema.resultPublications).values(
        publicationInsertValues(published, {
          publicationVersion: 1,
          idempotencyKey: '00000000-0000-4000-8000-0000000000c3',
        }),
      ),
    ).rejects.toSatisfy((error: unknown) => {
      expect(isUniqueViolation(error)).toBe(true);
      return true;
    });
  });

  it('the database rejects a reused idempotency key', async () => {
    const { published } = await seedPublishedV1();

    // Same key already used by v1, even for a different version → 23505.
    await expect(
      test.seed.insert(schema.resultPublications).values(
        publicationInsertValues(published, {
          publicationVersion: 2,
          idempotencyKey: published.idempotencyKey,
        }),
      ),
    ).rejects.toSatisfy((error: unknown) => {
      expect(isUniqueViolation(error)).toBe(true);
      return true;
    });
  });
});
