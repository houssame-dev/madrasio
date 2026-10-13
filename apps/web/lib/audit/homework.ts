import 'server-only';
import { z } from 'zod';
import { appendAuditEvent, type AuditTransaction } from './repository';
import { AuditPersistenceError } from './service';

const eventSchema = z.object({
  action: z.enum(['HomeworkSubmissionRecorded', 'HomeworkSubmissionResubmitted', 'HomeworkSubmissionReviewed', 'HomeworkSubmissionReturned', 'HomeworkSubmissionAttachmentAdded']),
  resourceId: z.string().uuid(),
  metadata: z.object({
    homeworkId: z.string().uuid(), studentId: z.string().uuid(),
    status: z.enum(['SUBMITTED', 'LATE', 'REVIEWED', 'RETURNED']),
    previousStatus: z.enum(['SUBMITTED', 'LATE', 'REVIEWED', 'RETURNED']).optional(),
    recordedAt: z.string().datetime(),
    actualHandedInAt: z.string().datetime().nullable(),
    previousRecordedAt: z.string().datetime().optional(),
    previousActualHandedInAt: z.string().datetime().nullable().optional(),
    attachmentId: z.string().uuid().optional(), fileId: z.string().uuid().optional(),
  }).strict(),
}).strict();

/** Authorized Homework operation, same locked transaction. Never body/name/URL/provider data. */
export async function recordHomeworkAudit(tx: AuditTransaction, actor: { schoolId: string; userId: string | null }, event: z.infer<typeof eventSchema>) {
  const parsed = eventSchema.parse(event);
  if (!actor.userId) throw new AuditPersistenceError();
  try {
    await appendAuditEvent(tx, { ...parsed, scope: 'SCHOOL', schoolId: actor.schoolId,
      actorKind: 'USER', actorUserId: actor.userId, systemActor: null, resourceType: 'HomeworkSubmission',
      metadata: Object.fromEntries(Object.entries(parsed.metadata).filter(([, value]) => value !== undefined).map(([key, value]) => [key, value === null ? 'UNKNOWN' : String(value)])) });
  } catch { throw new AuditPersistenceError(); }
}
