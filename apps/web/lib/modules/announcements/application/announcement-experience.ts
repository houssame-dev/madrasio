import type { z } from 'zod';
import { recordAnnouncementAudit } from '@/lib/audit/announcements';
import { sanitizeAnnouncementHtml } from '../domain/content';
import type { announcementScheduleChangeSchema, PageInput } from '../domain/contracts';
import * as repo from '../infrastructure/repositories/announcement-repository';
import { requireManagement, type AnnouncementActor } from './announcement-management';
import { requireAnnouncementOperation } from './authorization';
import { AnnouncementDomainError } from './announcement-errors';

function unavailable(): never { throw new AnnouncementDomainError('PUBLICATION_NOT_FOUND', 'Publication is unavailable.'); }

export async function changeAnnouncementSchedule(db: repo.AnnouncementsDb, actor: AnnouncementActor,
  id: string, publicationId: string, input: z.infer<typeof announcementScheduleChangeSchema>) {
  return repo.withAnnouncementLock(db, actor.schoolId, id, async (tx) => {
    const announcement = await repo.findAnnouncement(tx, actor.schoolId, id);
    const publication = await repo.findPublication(tx, publicationId);
    if (!announcement || !publication || publication.schoolId !== actor.schoolId || publication.announcementId !== id) unavailable();
    await requireManagement(tx, actor, announcement, 'announcements.publish', publication.announcementVersionId);
    if (input.action === 'cancel' && publication.status === 'CANCELLED') return { id: publication.id, status: publication.status, scheduledAt: publication.scheduledAt };
    if (announcement.status === 'ARCHIVED' || publication.status !== 'SCHEDULED') {
      throw new AnnouncementDomainError('NOT_PUBLISHABLE', 'Only an unpublished scheduled intent can be changed.');
    }
    const scheduledAt = input.action === 'reschedule' ? new Date(input.scheduledAt) : null;
    if (scheduledAt && (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now())) {
      throw new AnnouncementDomainError('INVALID_ANNOUNCEMENT_CONTEXT', 'Choose a future publication instant.');
    }
    if (scheduledAt?.getTime() === publication.scheduledAt?.getTime()) return { id: publication.id, status: publication.status, scheduledAt };
    const updated = await repo.changeSchedule(tx, actor.schoolId, publication.id, scheduledAt);
    if (!updated) throw new AnnouncementDomainError('PUBLICATION_CONFLICT', 'Publication state changed. Refresh before retrying.');
    if (!scheduledAt && !await repo.hasScheduledPublication(tx, actor.schoolId, id)) {
      await repo.updateAnnouncementStatus(tx, actor.schoolId, id, await repo.hasPublishedPublication(tx, actor.schoolId, id) ? 'PUBLISHED' : 'DRAFT');
    }
    await recordAnnouncementAudit(tx, actor, { action: scheduledAt ? 'AnnouncementRescheduled' : 'AnnouncementCancelled', resourceId: id,
      metadata: { publicationId, previousScheduledAt: publication.scheduledAt!.toISOString(), ...(scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : {}) } });
    return { id: updated.id, status: updated.status, scheduledAt: updated.scheduledAt };
  });
}

export async function removeAnnouncementTarget(db: repo.AnnouncementsDb, actor: AnnouncementActor,
  id: string, versionId: string, targetId: string) {
  return repo.withAnnouncementLock(db, actor.schoolId, id, async (tx) => {
    const announcement = await repo.findAnnouncement(tx, actor.schoolId, id);
    if (!announcement) unavailable();
    await requireManagement(tx, actor, announcement, 'announcements.create', versionId);
    const latest = await repo.findLatestVersion(tx, actor.schoolId, id);
    if (announcement.status === 'ARCHIVED' || latest?.id !== versionId || await repo.versionHasPublication(tx, actor.schoolId, versionId)) {
      throw new AnnouncementDomainError('ANNOUNCEMENT_VERSION_IMMUTABLE', 'Only the latest never-scheduled Version targets can be corrected.');
    }
    const removed = await repo.removeTarget(tx, actor.schoolId, versionId, targetId);
    if (removed.length) await recordAnnouncementAudit(tx, actor, { action: 'AnnouncementTargetsChanged', resourceId: id, metadata: { versionId, targetId, change: 'REMOVE' } });
    return { removed: removed.length > 0 };
  });
}

export async function listRecipientAnnouncements(db: repo.AnnouncementsDb, actor: AnnouncementActor, input: PageInput) {
  await requireAnnouncementOperation(db, actor, 'announcements.read');
  const result = await repo.recipientPublications(db, actor.schoolId, actor.userId!, { limit: input.pageSize, offset: (input.page - 1) * input.pageSize });
  // No bodies, author IDs, targets or other recipient identities in list DTOs.
  return { data: result.rows.map(({ body: _body, bodyFormat: _format, ...row }) => row), meta: { ...input, total: result.total } };
}

export async function getRecipientAnnouncement(db: repo.AnnouncementsDb, actor: AnnouncementActor, publicationId: string) {
  await requireAnnouncementOperation(db, actor, 'announcements.read');
  const result = await repo.recipientPublications(db, actor.schoolId, actor.userId!, { limit: 1, offset: 0 }, publicationId);
  const row = result.rows[0];
  if (!row) unavailable();
  return { ...row, body: row.bodyFormat === 'HTML' ? sanitizeAnnouncementHtml(row.body) : row.body };
}
