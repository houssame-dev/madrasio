import type { AnnouncementsDb } from '../infrastructure/repositories/announcement-repository';
import * as repo from '../infrastructure/repositories/announcement-repository';
import { AnnouncementDomainError } from './announcement-errors';
import { publishDueAnnouncement } from './publish-announcement';

export const SCHEDULED_ANNOUNCEMENT_BATCH_DEFAULT_LIMIT = 25;
export const SCHEDULED_ANNOUNCEMENT_BATCH_MAX_LIMIT = 100;

export function normalizeScheduledAnnouncementBatchLimit(requested?: number): number {
  const candidate = Math.floor(requested ?? SCHEDULED_ANNOUNCEMENT_BATCH_DEFAULT_LIMIT);
  return Math.max(
    1,
    Math.min(
      Number.isFinite(candidate) ? candidate : SCHEDULED_ANNOUNCEMENT_BATCH_DEFAULT_LIMIT,
      SCHEDULED_ANNOUNCEMENT_BATCH_MAX_LIMIT,
    ),
  );
}

export interface DueAnnouncementOutcome {
  publicationId: string;
  published: boolean;
  featureCode?: string;
}

export interface ProcessDueAnnouncementPublicationsResult {
  attempted: number;
  published: number;
  failed: number;
  remaining: number;
  results: DueAnnouncementOutcome[];
}

/**
 * Processes a bounded due-publication batch.
 *
 * Discovery is intentionally separate from correctness: the canonical
 * `publishDueAnnouncement` transaction owns a SCHEDULED -> PUBLISHED CAS,
 * recipient resolution/freeze, and Outbox insertion. Overlapping invocations
 * may discover the same id, but exactly one CAS winner can publish it.
 */
export async function processDueAnnouncementPublicationsBatch(
  db: AnnouncementsDb,
  input: { limit?: number } = {},
): Promise<ProcessDueAnnouncementPublicationsResult> {
  const limit = normalizeScheduledAnnouncementBatchLimit(input.limit);
  const dueAt = new Date();
  const ids = await repo.listDueScheduledPublicationIds(db, { dueAt, limit });
  const results: DueAnnouncementOutcome[] = [];

  for (const publicationId of ids) {
    try {
      const result = await publishDueAnnouncement(db, { publicationId });
      results.push({ publicationId, published: result.eventEmitted });
    } catch (error) {
      if (!(error instanceof AnnouncementDomainError)) throw error;
      results.push({ publicationId, published: false, featureCode: error.featureCode });
    }
  }

  return {
    attempted: results.length,
    published: results.filter((result) => result.published).length,
    failed: results.filter((result) => result.featureCode !== undefined).length,
    remaining: await repo.countDueScheduledPublications(db, new Date()),
    results,
  };
}
