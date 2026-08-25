/**
 * Result publication use case (Task 006D Parts H/I/K/L/M/N/T).
 *
 * A publication is BOTH the publication record AND its immutable historical
 * snapshot: one `result_publications` row denormalizes the published value and
 * the full academic context at the moment of publishing. Old publications are
 * NEVER mutated or deleted — a revision creates a new row with the next
 * `publication_version` (Part H2/H3/I).
 *
 * SEMANTICS:
 * - `revision: false` (initial publish): the result must be FINALIZED and must
 *   NOT have any prior publication → otherwise RESULT_ALREADY_PUBLISHED.
 * - `revision: true`: the result must be FINALIZED and MUST already have a
 *   prior publication → otherwise RESULT_NOT_PUBLISHED. The next version is
 *   the prior version + 1 and the outbox event is `ResultRevisionPublished`.
 *
 * IDEMPOTENCY (Part L/N, BR-CONCURRENCY-002): the caller supplies a stable
 * `idempotencyKey`. A replay of the same logical request returns the existing
 * publication row instead of creating a duplicate. Idempotency is enforced by
 * the database (`idempotency_key` unique + partial `(result_id,
 * publication_version)` unique indexes); concurrent duplicates that slip
 * between a read and an insert are resolved by catching the 23505 unique
 * violation and re-reading.
 *
 * ATOMICITY (Part M/T11, ADR-012): the publication row, the publication-time
 * notification recipient resolution and the outbox event (with the frozen
 * `recipientUserIds` payload, Task 012 §6/§7/§8) are written inside ONE
 * database transaction — a committed publication can never be lost even if
 * delivery fails afterwards, and the frozen event recipient data always
 * belongs to the same successful publication operation.
 *
 * RESULT NOTIFICATION RECIPIENTS (Task 012 §1/§5): the approved recipient
 * policy resolves the eligible PARENT Users of the Student at publication
 * time (ACTIVE ParentStudent + non-null user_id + ACTIVE SchoolMembership).
 * Zero eligible Parents NEVER blocks publication — the event is still created
 * with `recipientUserIds: []`; notifications are a downstream concern.
 * Every publication event (initial or revision) resolves its OWN current
 * recipients — a revision never copies the previous publication's list
 * (Task 012 §9/§10).
 *
 * Authorized via grades.publish (school scope).
 */

import { randomUUID } from 'node:crypto';

import { persistOutboxEvent } from '@/lib/events/outbox';

import { resolveResultNotificationRecipients } from '../domain/result-recipients';
import type { ResultEventPayload, ResultType } from '../domain/results';
import type { GradesDb, PublicationRow } from '../infrastructure/repositories/result-repository';
import * as repo from '../infrastructure/repositories/result-repository';
import { requireResultOperation } from './authorization';
import { ResultDomainError } from './result-errors';

export interface PublishResultInput {
  userId: string | null;
  schoolId: string;
  resultType: ResultType;
  resultId: string;
  idempotencyKey: string;
  revision?: boolean;
}

export interface PublishResultView {
  publicationId: string;
  schoolId: string;
  resultType: ResultType;
  resultId: string;
  studentId: string;
  academicYearId: string;
  academicPeriodId: string | null;
  classId: string;
  resultValue: string;
  gradingConfigurationVersionId: string;
  publicationVersion: number;
  publishedBy: string;
  publishedAt: string;
  idempotencyKey: string;
}

function toView(row: PublicationRow): PublishResultView {
  return {
    publicationId: row.id,
    schoolId: row.schoolId,
    resultType: row.resultType,
    resultId:
      row.resultType === 'SUBJECT'
        ? row.subjectResultId!
        : row.resultType === 'PERIOD'
          ? row.periodResultId!
          : row.annualResultId!,
    studentId: row.studentId,
    academicYearId: row.academicYearId,
    academicPeriodId: row.academicPeriodId,
    classId: row.classId,
    resultValue: row.resultValue,
    gradingConfigurationVersionId: row.gradingConfigurationVersionId,
    publicationVersion: row.publicationVersion,
    publishedBy: row.publishedBy,
    publishedAt: row.publishedAt,
    idempotencyKey: row.idempotencyKey,
  };
}

export function isPublicationUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  return candidate?.code === '23505' || candidate?.cause?.code === '23505';
}

function publicationResultId(row: PublicationRow): string {
  return row.resultType === 'SUBJECT'
    ? row.subjectResultId!
    : row.resultType === 'PERIOD'
      ? row.periodResultId!
      : row.annualResultId!;
}

function publicationMatchesRequest(row: PublicationRow, input: PublishResultInput): boolean {
  const sameOperation = input.revision ? row.publicationVersion > 1 : row.publicationVersion === 1;
  return row.schoolId === input.schoolId
    && row.resultType === input.resultType
    && publicationResultId(row) === input.resultId
    && sameOperation;
}

/** Resolves a replay before any mutable publication/revision work begins. */
export async function findIdempotentPublication(
  db: GradesDb,
  input: PublishResultInput,
): Promise<PublishResultView | null> {
  const replay = await repo.findPublicationByIdempotencyKey(
    db, input.schoolId, input.idempotencyKey,
  );
  if (!replay) return null;
  if (!publicationMatchesRequest(replay, input)) {
    throw new ResultDomainError(
      'PUBLICATION_CONFLICT',
      'The idempotency key was already used for a different result publication operation.',
    );
  }
  return toView(replay);
}

/**
 * Transaction-aware publication primitive shared by normal publication and
 * the atomic revision orchestrator. The caller owns the transaction boundary.
 */
export async function publishResultInTransaction(
  db: GradesDb,
  input: PublishResultInput,
): Promise<PublishResultView> {
  const replay = await findIdempotentPublication(db, input);
  if (replay) return replay;

  const result = await repo.findResultRow(db, input.schoolId, input.resultType, input.resultId);
  if (!result) {
    throw new ResultDomainError('RESULT_NOT_FOUND', `Result ${input.resultId} was not found in this school.`);
  }
  if (result.status !== 'FINALIZED') {
    throw new ResultDomainError(
      'RESULT_NOT_FINALIZED',
      'Only FINALIZED results can be published. Finalize the result first.',
    );
  }
  if (!input.userId) {
    throw new ResultDomainError('RESULT_NOT_FOUND', 'A publisher identity is required to publish a result.');
  }

  const latest = await repo.findLatestPublication(db, input.schoolId, input.resultType, input.resultId);
  if (input.revision) {
    if (!latest) {
      throw new ResultDomainError(
        'RESULT_NOT_PUBLISHED',
        'A revision requires a previously published version of the result.',
      );
    }
  } else if (latest) {
    throw new ResultDomainError(
      'RESULT_ALREADY_PUBLISHED',
      'The result is already published. Use a revision to publish an updated value.',
    );
  }

  const nextVersion = input.revision ? latest!.publicationVersion + 1 : 1;
  const eventType = input.revision ? 'ResultRevisionPublished' : 'ResultPublished';
  const publication = await repo.insertPublication(db, {
    schoolId: input.schoolId,
    resultType: input.resultType,
    subjectResultId: input.resultType === 'SUBJECT' ? result.id : null,
    periodResultId: input.resultType === 'PERIOD' ? result.id : null,
    annualResultId: input.resultType === 'ANNUAL' ? result.id : null,
    studentId: result.studentId,
    academicYearId: result.academicYearId,
    academicPeriodId: result.academicPeriodId,
    classId: result.classId,
    resultValue: result.value,
    gradingConfigurationVersionId: result.gradingConfigurationVersionId,
    publicationVersion: nextVersion,
    publishedBy: input.userId,
    idempotencyKey: input.idempotencyKey,
  });

  const eventId = randomUUID();
  const { recipientUserIds } = resolveResultNotificationRecipients(
    await repo.findResultNotificationRecipientCandidates(db, input.schoolId, result.studentId),
  );
  const payload: ResultEventPayload = {
    eventId,
    eventType,
    schoolId: input.schoolId,
    studentId: result.studentId,
    resultType: input.resultType,
    subjectResultId: input.resultType === 'SUBJECT' ? result.id : null,
    periodResultId: input.resultType === 'PERIOD' ? result.id : null,
    annualResultId: input.resultType === 'ANNUAL' ? result.id : null,
    resultValue: result.value,
    publicationId: publication.id,
    publicationVersion: nextVersion,
    publishedAt: publication.publishedAt,
    recipientUserIds,
  };
  await persistOutboxEvent(db, eventType, payload as unknown as Record<string, unknown>);
  return toView(publication);
}

/** Resolves the winner after a uniqueness race; the caller's transaction has rolled back. */
export async function recoverConcurrentPublication(
  db: GradesDb,
  input: PublishResultInput,
): Promise<PublishResultView> {
  const concurrent = await repo.findPublicationByIdempotencyKey(
    db, input.schoolId, input.idempotencyKey,
  );
  if (concurrent && publicationMatchesRequest(concurrent, input)) return toView(concurrent);
  if (concurrent) {
    throw new ResultDomainError(
      'PUBLICATION_CONFLICT',
      'The idempotency key was already used for a different result publication operation.',
    );
  }
  throw new ResultDomainError(
    'PUBLICATION_CONFLICT',
    'A concurrent publication of the same result version was detected. Retry with a new idempotency key.',
  );
}

/**
 * Publishes a FINALIZED result (Part T). `revision` selects the initial
 * publish vs. a revision (Part L). Returns the existing publication on an
 * idempotent replay.
 */
export async function publishResult(
  db: GradesDb,
  input: PublishResultInput,
): Promise<PublishResultView> {
  await requireResultOperation(
    db,
    { userId: input.userId, schoolId: input.schoolId },
    { permission: 'grades.publish', scope: { kind: 'school' } },
  );

  const replay = await findIdempotentPublication(db, input);
  if (replay) return replay;

  try {
    return await db.transaction((tx) => publishResultInTransaction(tx, input));
  } catch (error) {
    // A concurrent identical publish (or a retry racing our own idempotency
    // read) was committed first. Re-read the canonical row.
    if (isPublicationUniqueViolation(error)) return recoverConcurrentPublication(db, input);
    throw error;
  }
}
