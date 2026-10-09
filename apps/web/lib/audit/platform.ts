import 'server-only';
import { z } from 'zod';
import { requirePlatformAuthority } from '@/lib/authorization/server/platform';
import { ValidationError } from '@/lib/errors';
import { appendAuditEvent, type AuditTransaction } from './repository';
import { AuditPersistenceError } from './service';

export const platformAuditSchema = z
  .object({
    action: z.enum([
      'SchoolCreated',
      'SchoolAdminMembershipEstablished',
      'SchoolAdminMembershipDeactivated',
      'SchoolAdminMembershipReactivated',
    ]),
    resourceId: z.string().uuid(),
    metadata: z.object({ schoolId: z.string().uuid() }).strict(),
  })
  .strict();
export async function recordPlatformAudit(
  tx: AuditTransaction,
  actorId: string | null,
  event: z.infer<typeof platformAuditSchema>,
) {
  const actor = await requirePlatformAuthority(tx, actorId);
  const parsed = platformAuditSchema.safeParse(event);
  if (!parsed.success) throw new ValidationError('Invalid platform audit context.');
  try {
    await appendAuditEvent(tx, {
      ...parsed.data,
      scope: 'PLATFORM',
      schoolId: null,
      actorKind: 'USER',
      actorUserId: actor.userId,
      resourceType: event.action === 'SchoolCreated' ? 'School' : 'SchoolMembership',
    });
  } catch {
    throw new AuditPersistenceError();
  }
}
