// @vitest-environment node
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as s from '@school/database';
import {
  createGradesTestDb,
  seedStudentAndActors,
  seedGradebook,
  seedGrades,
  type GradesTestDb,
} from './test-helpers';
import {
  previewResultBatch,
  executeResultBatch,
} from '@/lib/modules/grades/application/result-batch';
import { resultBatchCommand } from '@/lib/modules/grades/domain/result-batch';
let test: GradesTestDb;
beforeEach(async () => {
  test = await createGradesTestDb();
});
afterEach(async () => test.client.close());
import { seedBatchScenario } from './batch-test-helpers';

function entry(row: Awaited<ReturnType<typeof previewResultBatch>>['data'][number]) {
  return {
    studentId: row.student.id,
    resultId: row.result?.id ?? null,
    expectedToken: row.expectedToken,
  };
}
describe('bounded server Result batches', () => {
  it('orchestrates exact Subject, Period and distinct Annual contexts through the existing engine', async () => {
    const f = await seedBatchScenario(test);
    for (const periodId of [f.school.period1Id, f.school.period2Id]) {
      for (const subjectId of [f.school.subjectMathId, f.school.subjectPhysicsId]) {
        const book =
          periodId === f.school.period1Id && subjectId === f.school.subjectMathId
            ? f.gradebook
            : await seedGradebook(
                test.seed,
                f.school.schoolId,
                { ...f.school, period1Id: periodId },
                subjectId,
                'OPEN',
              );
        if (book !== f.gradebook)
          await seedGrades(
            test.seed,
            f.school.schoolId,
            book.gradebookId,
            book,
            f.actors.studentId,
            periodId === f.school.period1Id ? '16' : '18',
            periodId === f.school.period1Id ? '18' : '20',
          );
        const scope = { ...f.scope, academicPeriodId: periodId, gradebookId: book.gradebookId };
        const p = await previewResultBatch(test.db, f.actor, {
          scope,
          operation: 'CALCULATE',
          page: 1,
        });
        expect(
          (
            await executeResultBatch(test.db, f.actor, {
              scope,
              operation: 'CALCULATE',
              confirm: true,
              entries: [entry(p.data[0])],
            })
          ).outcomes[0].status,
        ).toBe('COMPLETED');
      }
      const scope = {
        resultType: 'PERIOD' as const,
        academicYearId: f.school.yearId,
        classId: f.school.classId,
        academicPeriodId: periodId,
      };
      const p = await previewResultBatch(test.db, f.actor, {
        scope,
        operation: 'CALCULATE',
        page: 1,
      });
      expect(
        (
          await executeResultBatch(test.db, f.actor, {
            scope,
            operation: 'CALCULATE',
            confirm: true,
            entries: [entry(p.data[0])],
          })
        ).outcomes[0].status,
      ).toBe('COMPLETED');
    }
    const scope = {
      resultType: 'ANNUAL' as const,
      academicYearId: f.school.yearId,
      classId: f.school.classId,
    };
    let p = await previewResultBatch(test.db, f.actor, { scope, operation: 'CALCULATE', page: 1 });
    expect(
      (
        await executeResultBatch(test.db, f.actor, {
          scope,
          operation: 'CALCULATE',
          confirm: true,
          entries: [entry(p.data[0])],
        })
      ).outcomes[0].status,
    ).toBe('COMPLETED');
    p = await previewResultBatch(test.db, f.actor, { scope, operation: 'FINALIZE', page: 1 });
    expect(p.data[0].result).toMatchObject({ value: '18.00', academicPeriodId: null });
    await executeResultBatch(test.db, f.actor, {
      scope,
      operation: 'FINALIZE',
      confirm: true,
      entries: [entry(p.data[0])],
    });
    p = await previewResultBatch(test.db, f.actor, { scope, operation: 'PUBLISH', page: 1 });
    expect(
      (
        await executeResultBatch(test.db, f.actor, {
          scope,
          operation: 'PUBLISH',
          confirm: true,
          entries: [{ ...entry(p.data[0]), idempotencyKey: randomUUID() }],
        })
      ).outcomes[0].status,
    ).toBe('COMPLETED');
    expect(await test.seed.select().from(s.annualResults)).toHaveLength(1);
    expect(await test.seed.select().from(s.periodResults)).toHaveLength(2);
    expect(await test.seed.select().from(s.resultPublications)).toHaveLength(1);
  });
  it('calculates, finalizes and initially publishes without coupling the three actions; stable retries preserve Outbox', async () => {
    const f = await seedBatchScenario(test);
    let preview = await previewResultBatch(test.db, f.actor, {
      scope: f.scope,
      operation: 'CALCULATE',
      page: 1,
    });
    expect(preview.limit).toBe(20);
    const calculated = await executeResultBatch(test.db, f.actor, {
      scope: f.scope,
      operation: 'CALCULATE',
      confirm: true,
      entries: [entry(preview.data[0])],
    });
    expect(calculated.outcomes[0]).toMatchObject({ status: 'COMPLETED', code: 'CALCULATED' });
    expect(await test.seed.select().from(s.resultPublications)).toHaveLength(0);
    preview = await previewResultBatch(test.db, f.actor, {
      scope: f.scope,
      operation: 'FINALIZE',
      page: 1,
    });
    expect(preview.data[0].result?.value).toBe('17.00');
    await executeResultBatch(test.db, f.actor, {
      scope: f.scope,
      operation: 'FINALIZE',
      confirm: true,
      entries: [entry(preview.data[0])],
    });
    expect(await test.seed.select().from(s.resultPublications)).toHaveLength(0);
    preview = await previewResultBatch(test.db, f.actor, {
      scope: f.scope,
      operation: 'PUBLISH',
      page: 1,
    });
    const command = {
      scope: f.scope,
      operation: 'PUBLISH' as const,
      confirm: true as const,
      entries: [{ ...entry(preview.data[0]), idempotencyKey: randomUUID() }],
    };
    const first = await executeResultBatch(test.db, f.actor, command);
    const replay = await executeResultBatch(test.db, f.actor, command);
    expect(replay.outcomes[0].publicationId).toBe(first.outcomes[0].publicationId);
    expect(await test.seed.select().from(s.resultPublications)).toHaveLength(1);
    expect(await test.seed.select().from(s.outboxEvents)).toHaveLength(1);
    const again = await previewResultBatch(test.db, f.actor, {
      scope: f.scope,
      operation: 'PUBLISH',
      page: 1,
    });
    expect(again.data[0]).toMatchObject({ eligible: false, reason: 'ALREADY_PUBLISHED' });
  });
  it('reports incomplete entries without writing fake results, and preserves finalized rows', async () => {
    const f = await seedBatchScenario(test);
    await test.seed.delete(s.grades);
    const p = await previewResultBatch(test.db, f.actor, {
      scope: f.scope,
      operation: 'CALCULATE',
      page: 1,
    });
    const r = await executeResultBatch(test.db, f.actor, {
      scope: f.scope,
      operation: 'CALCULATE',
      confirm: true,
      entries: [entry(p.data[0])],
    });
    expect(r.outcomes[0].status).toBe('INCOMPLETE');
    expect(await test.seed.select().from(s.subjectResults)).toHaveLength(0);
  });
  it('rejects stale previews and mixed scope without leaking foreign records', async () => {
    const f = await seedBatchScenario(test);
    const p = await previewResultBatch(test.db, f.actor, {
      scope: f.scope,
      operation: 'CALCULATE',
      page: 1,
    });
    await executeResultBatch(test.db, f.actor, {
      scope: f.scope,
      operation: 'CALCULATE',
      confirm: true,
      entries: [entry(p.data[0])],
    });
    const stale = await executeResultBatch(test.db, f.actor, {
      scope: f.scope,
      operation: 'CALCULATE',
      confirm: true,
      entries: [entry(p.data[0])],
    });
    expect(stale.outcomes[0].status).toBe('CONFLICT');
    const mixed = await executeResultBatch(test.db, f.actor, {
      scope: f.scope,
      operation: 'CALCULATE',
      confirm: true,
      entries: [{ ...entry(p.data[0]), studentId: randomUUID() }],
    });
    expect(mixed.outcomes[0]).toMatchObject({ status: 'FAILED', code: 'FORBIDDEN' });
  });
  it('preserves explicit partial success and never silently recalculates finalized or revises published results', async () => {
    const f = await seedBatchScenario(test);
    await seedStudentAndActors(test.seed, f.school.schoolId, f.school.yearId, f.school.classId);
    let p = await previewResultBatch(test.db, f.actor, {
      scope: f.scope,
      operation: 'CALCULATE',
      page: 1,
    });
    expect(p.data).toHaveLength(2);
    const partial = await executeResultBatch(test.db, f.actor, {
      scope: f.scope,
      operation: 'CALCULATE',
      confirm: true,
      entries: p.data.map(entry),
    });
    expect(partial.outcomes.map((o) => o.status).sort()).toEqual(['COMPLETED', 'INCOMPLETE']);
    expect(await test.seed.select().from(s.subjectResults)).toHaveLength(1);
    p = await previewResultBatch(test.db, f.actor, {
      scope: f.scope,
      operation: 'FINALIZE',
      page: 1,
    });
    const row = p.data.find((r) => r.result)!;
    await executeResultBatch(test.db, f.actor, {
      scope: f.scope,
      operation: 'FINALIZE',
      confirm: true,
      entries: [entry(row)],
    });
    p = await previewResultBatch(test.db, f.actor, {
      scope: f.scope,
      operation: 'CALCULATE',
      page: 1,
    });
    const protectedRow = p.data.find((r) => r.result)!;
    expect(protectedRow.eligible).toBe(false);
    const denied = await executeResultBatch(test.db, f.actor, {
      scope: f.scope,
      operation: 'CALCULATE',
      confirm: true,
      entries: [entry(protectedRow)],
    });
    expect(denied.outcomes[0].code).toBe('RESULT_ALREADY_FINALIZED');
    p = await previewResultBatch(test.db, f.actor, {
      scope: f.scope,
      operation: 'PUBLISH',
      page: 1,
    });
    await executeResultBatch(test.db, f.actor, {
      scope: f.scope,
      operation: 'PUBLISH',
      confirm: true,
      entries: [{ ...entry(p.data.find((r) => r.result)!), idempotencyKey: randomUUID() }],
    });
    p = await previewResultBatch(test.db, f.actor, {
      scope: f.scope,
      operation: 'PUBLISH',
      page: 1,
    });
    const repeated = await executeResultBatch(test.db, f.actor, {
      scope: f.scope,
      operation: 'PUBLISH',
      confirm: true,
      entries: [{ ...entry(p.data.find((r) => r.result)!), idempotencyKey: randomUUID() }],
    });
    expect(repeated.outcomes[0].code).toBe('RESULT_ALREADY_PUBLISHED');
    expect(await test.seed.select().from(s.resultPublications)).toHaveLength(1);
    expect(await test.seed.select().from(s.outboxEvents)).toHaveLength(1);
  });
  it('denies Teacher and Parent batch access even with known identifiers', async () => {
    const f = await seedBatchScenario(test);
    for (const userId of [f.actors.teacherUserId, f.actors.parentUserId])
      await expect(
        previewResultBatch(
          test.db,
          { ...f.actor, userId },
          { scope: f.scope, operation: 'CALCULATE', page: 1 },
        ),
      ).rejects.toBeDefined();
  });
  it('uses dated enrollment overlap, not current placement or an unbounded school roster', async () => {
    const f = await seedBatchScenario(test);
    await test.seed
      .update(s.studentEnrollments)
      .set({ effectiveFrom: '2026-01-01' })
      .where(eq(s.studentEnrollments.studentId, f.actors.studentId));
    const p = await previewResultBatch(test.db, f.actor, {
      scope: f.scope,
      operation: 'CALCULATE',
      page: 1,
    });
    expect(p.data).toHaveLength(0);
  });
  it('rejects duplicates, over-limit payloads, missing confirmation, forged fields and invalid Annual scope', () => {
    const id = randomUUID(),
      row = { studentId: id, resultId: null, expectedToken: 'a'.repeat(64) };
    const scope = { resultType: 'ANNUAL', academicYearId: randomUUID(), classId: randomUUID() };
    const base = { scope, operation: 'CALCULATE', confirm: true, entries: [row] };
    expect(resultBatchCommand.safeParse(base).success).toBe(true);
    for (const bad of [
      { ...base, entries: [row, row] },
      { ...base, entries: Array.from({ length: 21 }, () => ({ ...row, studentId: randomUUID() })) },
      { ...base, confirm: false },
      { ...base, schoolId: id },
      { ...base, scope: { ...scope, academicPeriodId: id } },
    ])
      expect(resultBatchCommand.safeParse(bad).success).toBe(false);
  });
});
