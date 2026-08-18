/**
 * Outbox atomicity hardening (Task 006D.1 §6, ADR-012).
 *
 * Publication + outbox event must be written in ONE database transaction: a
 * publication must never report success while its required outbox record
 * failed to persist, and a failed outbox insert must roll the publication
 * back with it.
 *
 * This file mocks `persistOutboxEvent` to fail, then proves the publication
 * insert is rolled back (no publication row, no outbox row, and the
 * publish use case rejects).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { eq } from 'drizzle-orm';

import * as schema from '@school/database';

import { calculateSubjectResult, finalizeResult, publishResult } from '@/lib/modules/grades/application';

import {
  createGradesTestDb,
  seedGradebook,
  seedGrades,
  seedSchool,
  seedStudentAndActors,
  type GradesTestDb,
} from './test-helpers';

vi.mock('@/lib/events/outbox', async () => {
  const actual = await vi.importActual<typeof import('@/lib/events/outbox')>('@/lib/events/outbox');
  return {
    ...actual,
    persistOutboxEvent: vi.fn(async () => {
      throw new Error('simulated outbox persistence failure');
    }),
  };
});

import { persistOutboxEvent } from '@/lib/events/outbox';

const mockedPersistOutboxEvent = vi.mocked(persistOutboxEvent);

let test: GradesTestDb;

beforeEach(async () => {
  test = await createGradesTestDb();
  mockedPersistOutboxEvent.mockReset();
  mockedPersistOutboxEvent.mockImplementation(async () => {
    throw new Error('simulated outbox persistence failure');
  });
});

afterEach(async () => {
  await test.client.close();
});

describe('Publication / outbox atomicity (Task 006D.1 §6)', () => {
  it('does NOT report success and persists NOTHING when the outbox event fails', async () => {
    const school = await seedSchool(test.seed);
    const actors = await seedStudentAndActors(test.seed, school.schoolId, school.yearId, school.classId);
    const gradebook = await seedGradebook(test.seed, school.schoolId, school, school.subjectMathId);
    await seedGrades(test.seed, school.schoolId, gradebook.gradebookId, gradebook, actors.studentId, '16', '18');

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

    await expect(
      publishResult(test.db, {
        userId: actors.schoolAdminUserId,
        schoolId: school.schoolId,
        resultType: 'SUBJECT',
        resultId: calculated.id,
        idempotencyKey: '00000000-0000-4000-8000-0000000000c4',
      }),
    ).rejects.toThrow('simulated outbox persistence failure');

    expect(mockedPersistOutboxEvent).toHaveBeenCalledTimes(1);

    // The publication insert was rolled back WITH the failed outbox insert.
    const publications = await test.seed
      .select()
      .from(schema.resultPublications)
      .where(eq(schema.resultPublications.schoolId, school.schoolId));
    expect(publications).toHaveLength(0);

    const events = await test.seed.select().from(schema.outboxEvents);
    expect(events).toHaveLength(0);

    // The result itself was untouched by the failed transaction.
    const results = await test.seed
      .select()
      .from(schema.subjectResults)
      .where(eq(schema.subjectResults.schoolId, school.schoolId));
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('FINALIZED');
  });

  it('inserts the publication AND the outbox event atomically on success', async () => {
    // Restore the REAL outbox persistence for this test (the default mock
    // deliberately fails above).
    const real = await vi.importActual<typeof import('@/lib/events/outbox')>('@/lib/events/outbox');
    mockedPersistOutboxEvent.mockImplementation(real.persistOutboxEvent);

    const school = await seedSchool(test.seed);
    const actors = await seedStudentAndActors(test.seed, school.schoolId, school.yearId, school.classId);
    const gradebook = await seedGradebook(test.seed, school.schoolId, school, school.subjectMathId);
    await seedGrades(test.seed, school.schoolId, gradebook.gradebookId, gradebook, actors.studentId, '16', '18');

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

    const published = await publishResult(test.db, {
      userId: actors.schoolAdminUserId,
      schoolId: school.schoolId,
      resultType: 'SUBJECT',
      resultId: calculated.id,
      idempotencyKey: '00000000-0000-4000-8000-0000000000c5',
    });

    // Success report AND persisted outbox row appear together.
    expect(mockedPersistOutboxEvent).toHaveBeenCalledTimes(1);
    const events = await test.seed.select().from(schema.outboxEvents);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('ResultPublished');
    expect(published.publicationVersion).toBe(1);
  });
});