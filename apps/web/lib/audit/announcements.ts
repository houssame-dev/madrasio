import 'server-only';
import { z } from 'zod';
import { appendAuditEvent, type AuditTransaction } from './repository';
import { AuditPersistenceError } from './service';

const eventSchema = z.object({
  action: z.enum(['AnnouncementCreated', 'AnnouncementVersionCreated', 'AnnouncementTargetsChanged',
    'AnnouncementScheduled', 'AnnouncementRescheduled', 'AnnouncementCancelled', 'AnnouncementPublished',
    'AnnouncementRevised', 'AnnouncementArchived']),
  resourceId: z.string().uuid(),
  metadata: z.object({ versionId: z.string().uuid().optional(), publicationId: z.string().uuid().optional(),
    scheduledAt: z.string().datetime().optional(), previousScheduledAt: z.string().datetime().optional(),
    targetId: z.string().uuid().optional(), change: z.enum(['ADD', 'REMOVE']).optional() }).strict(),
}).strict();

/** Called only after service authorization, inside the same locked mutation transaction. */
export async function recordAnnouncementAudit(tx: AuditTransaction,
  actor: { schoolId: string; userId: string | null }, event: z.infer<typeof eventSchema>) {
  const parsed = eventSchema.parse(event);
  try {
    await appendAuditEvent(tx, { ...parsed, scope: 'SCHOOL', schoolId: actor.schoolId,
      actorKind: actor.userId ? 'USER' : 'SYSTEM', actorUserId: actor.userId,
      systemActor: actor.userId ? null : 'SCHEDULED_ANNOUNCEMENT_PROCESSOR',
      resourceType: 'Announcement', metadata: Object.fromEntries(Object.entries(parsed.metadata).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])) });
  } catch { throw new AuditPersistenceError(); }
}
