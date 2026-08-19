/**
 * Announcement publication use case (Task 011).
 *
 * Publishing is an explicit business operation (BR-GLOBAL-005). One
 * publication persists EXACTLY ONE AnnouncementVersion and its immutable
 * historical recipient snapshot (BR-ANNOUNCEMENT-009/010). Old publications
 * are NEVER mutated or deleted — a revision creates a NEW Version and a NEW
 * Publication row with the next per-Announcement `publication_version`
 * (BR-ANNOUNCEMENT-014).
 *
 * AUTHORITATIVE FLOW (Task 011 §2):
 *   Authenticated → School Context → Authorization → Load Announcement →
 *   Load exact Version → Validate publishable state → Load targets →
 *   Resolve recipients → Create Publication → Persist RecipientSnapshots →
 *   Persist OutboxEvent → COMMIT (all atomically).
 *
 * EVENTS (Task 011 §10): events are emitted ONLY by this use case, inside the
 * SAME transaction that commits the publication + snapshot (ADR-012). The
 * first publication of an Announcement emits `AnnouncementPublished`; any
 * later publication (a NEW Version) emits `AnnouncementRevisionPublished`.
 * CRUD/draft/edit/status/version/target edits NEVER emit events.
 *
 * IDEMPOTENCY (Task 009 §17, BR-ANNOUNCEMENT-013): the caller supplies a
 * stable `idempotencyKey`. A replay returns the existing publication row; the
 * `idempotency_key` unique constraint is the database guarantee. Concurrent
 * duplicates that slip between a read and an insert are resolved by catching
 * the 23505 unique violation and re-reading.
 *
 * CONCURRENCY (Task 009 §19): no Redis locks (ADR-015). The per-Announcement
 * `(announcement_id, publication_version)` unique + the idempotency unique are
 * the protection; a lost race surfaces as a controlled `PUBLICATION_CONFLICT`.
 *
 * SCHEDULING (Task 009 §18, BR-ANNOUNCEMENT-011/012, Task 011.1): a future
 * `scheduledAt` creates a SCHEDULED publication (publication intent persisted,
 * Announcement moves DRAFT → SCHEDULED). Recipients are NEVER resolved or
 * frozen at scheduling time and NO outbox event exists yet — the historical
 * `publication_recipient_snapshots` represent "who was eligible when this
 * Announcement was ACTUALLY published", not "when it was scheduled" (Task 011.1).
 * Due processing (`publishDueAnnouncement`) resolves recipients from the
 * CURRENT relationships at publication time, persists the immutable snapshot,
 * transitions SCHEDULED → PUBLISHED and emits the event — all atomically, and
 * only when at least one recipient is eligible. Correctness is "due work"
 * based, never timer-dependent. A due/past `scheduledAt` publishes immediately
 * (keeping the original `scheduled_at`, which satisfies the `schedule_order`
 * CHECK).
 *
 * NO-ELIGIBLE-RECIPIENTS (Task 011 §16): zero valid targets →
 * `NO_VALID_TARGETS`; targets exist but zero eligible recipients →
 * `NO_ELIGIBLE_RECIPIENTS`. Both are CONTROLLED failures — the system never
 * silently publishes to nobody and never falls back to an implicit
 * School-wide audience.
 *
 * MODULE OWNERSHIP (CLAUDE.md §17): this use case writes ONLY
 * `announcement_publications`, `publication_recipient_snapshots`, the
 * Announcement status, and the shared outbox event. It NEVER writes
 * Notifications/Grades/Attendance/Homework rows — the Notifications processor
 * consumes the outbox event.
 */

import { randomUUID } from 'node:crypto';

import { persistOutboxEvent } from '@/lib/events/outbox';

import type { AnnouncementEventPayload, AnnouncementEventName } from '../domain/announcement-events';
import {
  assertTeacherPublicationScope,
  requireAnnouncementPublishOperation,
} from './authorization';
import { AnnouncementDomainError } from './announcement-errors';
import type { AnnouncementPublicationRow, AnnouncementsDb } from '../infrastructure/repositories/announcement-repository';
import * as repo from '../infrastructure/repositories/announcement-repository';
import { resolveAnnouncementRecipients } from '../domain/recipients';

type AnnouncementRowStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';

export interface PublishAnnouncementInput {
  userId: string | null;
  schoolId: string;
  announcementId: string;
  announcementVersionId: string;
  idempotencyKey: string;
  /** ISO-8601 instant; optional. A future value schedules; a due/past value publishes immediately. */
  scheduledAt?: string;
}

export interface PublishAnnouncementView {
  publicationId: string;
  schoolId: string;
  announcementId: string;
  announcementVersionId: string;
  publicationVersion: number;
  status: 'SCHEDULED' | 'PUBLISHED';
  scheduledAt: string | null;
  publishedAt: string | null;
  publishedBy: string;
  idempotencyKey: string;
  /** True when an outbox event was emitted by this request (immediate publish). */
  eventEmitted: boolean;
}

export interface PublishDueAnnouncementInput {
  publicationId: string;
}

export interface PublishDueAnnouncementResult {
  publicationId: string;
  announcementId: string;
  /** True when this call emitted the event (it won the compare-and-swap). */
  eventEmitted: boolean;
}

function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  return candidate?.code === '23505' || candidate?.cause?.code === '23505';
}

function toView(row: AnnouncementPublicationRow, eventEmitted: boolean): PublishAnnouncementView {
  return {
    publicationId: row.id,
    schoolId: row.schoolId,
    announcementId: row.announcementId,
    announcementVersionId: row.announcementVersionId,
    publicationVersion: row.publicationVersion,
    status: row.status,
    scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    publishedBy: row.publishedBy,
    idempotencyKey: row.idempotencyKey,
    eventEmitted,
  };
}

/**
 * Publishes one exact AnnouncementVersion. Returns the existing publication on
 * an idempotent replay. Throws the controlled feature errors described above.
 */
export async function publishAnnouncement(
  db: AnnouncementsDb,
  input: PublishAnnouncementInput,
): Promise<PublishAnnouncementView> {
  const auth = await requireAnnouncementPublishOperation(db, {
    userId: input.userId,
    schoolId: input.schoolId,
  });

  if (!input.userId) {
    throw new AnnouncementDomainError(
      'ANNOUNCEMENT_NOT_FOUND',
      'A publisher identity is required to publish an announcement.',
    );
  }
  const publisherId: string = input.userId;

  // Load the logical Announcement (school-scoped).
  const announcement = await repo.findAnnouncement(db, input.schoolId, input.announcementId);
  if (!announcement) {
    throw new AnnouncementDomainError(
      'ANNOUNCEMENT_NOT_FOUND',
      `Announcement ${input.announcementId} was not found in this school.`,
    );
  }
  if (announcement.status === 'ARCHIVED') {
    throw new AnnouncementDomainError(
      'NOT_PUBLISHABLE',
      'An archived announcement cannot be published.',
    );
  }

  // Load the EXACT Version the caller asked to publish.
  const version = await repo.findVersionForAnnouncement(
    db,
    input.schoolId,
    input.announcementId,
    input.announcementVersionId,
  );
  if (!version) {
    throw new AnnouncementDomainError(
      'VERSION_NOT_FOUND',
      `Announcement version ${input.announcementVersionId} was not found for this announcement.`,
    );
  }

  // Idempotent replay: the same key always maps to the SAME publication row.
  const replay = await repo.findPublicationByIdempotencyKey(db, input.schoolId, input.idempotencyKey);
  if (replay) {
    if (replay.announcementId !== input.announcementId) {
      throw new AnnouncementDomainError(
        'PUBLICATION_CONFLICT',
        'The idempotency key was already used for a different announcement.',
      );
    }
    return toView(replay, replay.status === 'PUBLISHED');
  }

  // Load targets and enforce the academic-scope half of BR-ANNOUNCEMENT-006.
  const targets = await repo.findTargets(db, input.schoolId, version.id);
  if (targets.length === 0) {
    throw new AnnouncementDomainError(
      'NO_VALID_TARGETS',
      'The announcement version has no targets to publish to.',
    );
  }
  assertTeacherPublicationScope(auth, targets);

  // One publication per exact Version (BR-ANNOUNCEMENT-014).
  const existingForVersion = await repo.findPublicationByVersion(
    db,
    input.schoolId,
    input.announcementId,
    version.id,
  );
  if (existingForVersion) {
    throw new AnnouncementDomainError(
      'ALREADY_PUBLISHED',
      'This version has already been published. Create a new version to publish a revision.',
    );
  }

  const latest = await repo.findLatestPublication(db, input.schoolId, input.announcementId);
  const nextPublicationVersion = latest ? latest.publicationVersion + 1 : 1;
  const isRevision = latest !== null;

  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  const immediate = scheduledAt === null || scheduledAt.getTime() <= Date.now();
  const publicationStatus: 'SCHEDULED' | 'PUBLISHED' = immediate ? 'PUBLISHED' : 'SCHEDULED';
  const publishedAt = immediate ? new Date() : null;
  const eventType: AnnouncementEventName = isRevision ? 'AnnouncementRevisionPublished' : 'AnnouncementPublished';

  try {
    return await db.transaction(async (tx) => {
      const publication = await repo.insertPublication(tx, {
        schoolId: input.schoolId,
        announcementId: announcement.id,
        announcementVersionId: version.id,
        publicationVersion: nextPublicationVersion,
        status: publicationStatus,
        scheduledAt,
        publishedAt,
        publishedBy: publisherId,
        idempotencyKey: input.idempotencyKey,
      });

      // IMMEDIATE publication: resolve recipients from the CURRENT relationships
      // and persist the immutable snapshot + outbox event atomically in the SAME
      // transaction (BR-ANNOUNCEMENT-009/010, Task 011 §15).
      if (immediate) {
        const candidates = await repo.loadRecipientCandidates(tx, input.schoolId);
        const resolvedRecipients = resolveAnnouncementRecipients(
          input.schoolId,
          targets.map((target) => ({
            audience: target.audience,
            targetType: target.targetType,
            classId: target.classId,
          })),
          candidates,
        );
        if (resolvedRecipients.length === 0) {
          throw new AnnouncementDomainError(
            'NO_ELIGIBLE_RECIPIENTS',
            'No eligible recipients matched the announcement targets.',
          );
        }

        await repo.insertRecipientSnapshots(
          tx,
          resolvedRecipients.map((recipient) => ({
            schoolId: input.schoolId,
            publicationId: publication.id,
            recipientUserId: recipient.recipientUserId,
            audiences: recipient.audiences,
          })),
        );

        const payload: AnnouncementEventPayload = {
          eventId: randomUUID(),
          eventType,
          schoolId: input.schoolId,
          announcementId: announcement.id,
          announcementVersionId: version.id,
          publicationId: publication.id,
          publicationVersion: publication.publicationVersion,
          publishedAt: publication.publishedAt!.toISOString(),
        };
        await persistOutboxEvent(tx, eventType, payload as unknown as Record<string, unknown>);
        await repo.updateAnnouncementStatus(tx, input.schoolId, announcement.id, 'PUBLISHED');
        return toView(publication, true);
      }

      // SCHEDULED: only the publication intent is persisted. Recipients are NOT
      // resolved or frozen now and NO outbox event exists yet (Task 011.1 §1) —
      // both happen at ACTUAL publication time in `publishDueAnnouncement`.
      // Never regress PUBLISHED (a scheduled revision of an already published
      // Announcement stays PUBLISHED); DRAFT moves to SCHEDULED.
      const nextStatus: AnnouncementRowStatus = announcement.status === 'DRAFT' ? 'SCHEDULED' : announcement.status;
      await repo.updateAnnouncementStatus(tx, input.schoolId, announcement.id, nextStatus);
      return toView(publication, false);
    });
  } catch (error) {
    // A concurrent identical publish (or a retry racing our own idempotency
    // read) was committed first. Re-read the canonical row.
    if (isUniqueViolation(error)) {
      const concurrent = await repo.findPublicationByIdempotencyKey(db, input.schoolId, input.idempotencyKey);
      if (concurrent && concurrent.announcementId === input.announcementId) {
        return toView(concurrent, concurrent.status === 'PUBLISHED');
      }
      throw new AnnouncementDomainError(
        'PUBLICATION_CONFLICT',
        'A concurrent publication of the same announcement was detected. Retry with a new idempotency key.',
      );
    }
    throw error;
  }
}

/**
 * Due-work processing for one SCHEDULED publication (BR-ANNOUNCEMENT-012).
 *
 * This is NOT a scheduler/infrastructure component — it is the minimal helper
 * a worker/request invokes for one publication that is now due. It is safe to
 * call at any time: a future `scheduled_at` → `NOT_PUBLISHABLE`; an
 * already-PUBLISHED publication → idempotent no-op (eventEmitted: false).
 *
 * Recipients are resolved HERE, at ACTUAL publication time, from the CURRENT
 * relationships (Task 011.1 §2) — never from any list captured at scheduling
 * time. The immutable snapshot, the SCHEDULED → PUBLISHED transition, and the
 * outbox event are committed in ONE transaction (Task 011.1 §7). If zero
 * recipients are eligible at due time the whole transaction rolls back: the
 * publication stays SCHEDULED, no snapshot is created, no event is emitted,
 * and the publication remains retryable (Task 011.1 §3).
 *
 * The SCHEDULED → PUBLISHED transition uses a compare-and-swap so two
 * concurrent workers can never both emit the event (Task 011.1 §8).
 */
export async function publishDueAnnouncement(
  db: AnnouncementsDb,
  input: PublishDueAnnouncementInput,
): Promise<PublishDueAnnouncementResult> {
  const publication = await repo.findPublication(db, input.publicationId);
  if (!publication) {
    throw new AnnouncementDomainError(
      'PUBLICATION_NOT_FOUND',
      `Publication ${input.publicationId} was not found.`,
    );
  }
  if (publication.status === 'PUBLISHED') {
    return { publicationId: publication.id, announcementId: publication.announcementId, eventEmitted: false };
  }
  if (publication.scheduledAt === null || publication.scheduledAt.getTime() > Date.now()) {
    throw new AnnouncementDomainError(
      'NOT_PUBLISHABLE',
      'The publication is not due yet.',
    );
  }

  const eventType: AnnouncementEventName =
    publication.publicationVersion > 1 ? 'AnnouncementRevisionPublished' : 'AnnouncementPublished';

  const eventEmitted = await db.transaction(async (tx) => {
    const updated = await repo.markPublicationPublished(tx, publication.id);
    if (!updated) {
      // Another worker won the compare-and-swap — do not emit a duplicate event.
      return false;
    }

    const version = await repo.findVersionForAnnouncement(
      tx,
      publication.schoolId,
      publication.announcementId,
      publication.announcementVersionId,
    );
    if (!version) {
      throw new AnnouncementDomainError(
        'VERSION_NOT_FOUND',
        `Announcement version ${publication.announcementVersionId} was not found.`,
      );
    }

    // A scheduled publication stays bound to the EXACT Version that was
    // scheduled (Task 011.1 §5) — a newer Version created before the due date
    // never replaces it. Recipients are resolved from that Version's targets
    // against the CURRENT relationships at publication time (Task 011.1 §2/§4).
    const targets = await repo.findTargets(tx, publication.schoolId, publication.announcementVersionId);
    if (targets.length === 0) {
      throw new AnnouncementDomainError(
        'NO_VALID_TARGETS',
        'The announcement version has no targets to publish to.',
      );
    }
    const candidates = await repo.loadRecipientCandidates(tx, publication.schoolId);
    const resolvedRecipients = resolveAnnouncementRecipients(
      publication.schoolId,
      targets.map((target) => ({
        audience: target.audience,
        targetType: target.targetType,
        classId: target.classId,
      })),
      candidates,
    );
    if (resolvedRecipients.length === 0) {
      // Rolls the whole transaction back: publication stays SCHEDULED, no
      // snapshot, no event — retryable when a recipient becomes eligible.
      throw new AnnouncementDomainError(
        'NO_ELIGIBLE_RECIPIENTS',
        'No eligible recipients matched the announcement targets at publication time.',
      );
    }

    await repo.insertRecipientSnapshots(
      tx,
      resolvedRecipients.map((recipient) => ({
        schoolId: publication.schoolId,
        publicationId: publication.id,
        recipientUserId: recipient.recipientUserId,
        audiences: recipient.audiences,
      })),
    );

    const payload: AnnouncementEventPayload = {
      eventId: randomUUID(),
      eventType,
      schoolId: publication.schoolId,
      announcementId: publication.announcementId,
      announcementVersionId: publication.announcementVersionId,
      publicationId: publication.id,
      publicationVersion: publication.publicationVersion,
      publishedAt: updated.publishedAt!.toISOString(),
    };
    await persistOutboxEvent(tx, eventType, payload as unknown as Record<string, unknown>);
    await repo.updateAnnouncementStatus(tx, publication.schoolId, publication.announcementId, 'PUBLISHED');
    return true;
  });

  return { publicationId: publication.id, announcementId: publication.announcementId, eventEmitted };
}