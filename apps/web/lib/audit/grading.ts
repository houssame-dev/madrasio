import 'server-only';
import { z } from 'zod';
import { requireOperation, type AuthorizationDb } from '@/lib/authorization/server';
import { ValidationError } from '@/lib/errors';
import { appendAuditEvent, type AuditTransaction } from './repository';
import { AuditPersistenceError } from './service';

const eventSchema = z
  .object({
    action: z.enum([
      'GradingConfigurationCreated',
      'GradingConfigurationStatusChanged',
      'GradingConfigurationVersionCreated',
      'GradingConfigurationRulesChanged',
      'GradingConfigurationVersionStatusChanged',
    ]),
    resourceId: z.string().uuid(),
    metadata: z
      .object({
        configurationId: z.string().uuid(),
        versionNumber: z.number().int().positive().optional(),
        previousStatus: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
        newStatus: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
      })
      .strict(),
  })
  .strict();
export async function recordGradingAudit(
  tx: AuditTransaction,
  actor: { userId: string | null; schoolId: string },
  event: z.infer<typeof eventSchema>,
) {
  const parsed = eventSchema.safeParse(event);
  if (!parsed.success) throw new ValidationError('Invalid grading audit context.');
  await requireOperation(tx as unknown as AuthorizationDb, actor, {
    permission: 'grades.manage',
    scope: { kind: 'school' },
  });
  try {
    const metadata = Object.fromEntries(
      Object.entries(parsed.data.metadata)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)]),
    );
    await appendAuditEvent(tx, {
      ...parsed.data,
      metadata,
      scope: 'SCHOOL',
      schoolId: actor.schoolId,
      actorKind: 'USER',
      actorUserId: actor.userId!,
      resourceType:
        event.action === 'GradingConfigurationCreated' ||
        event.action === 'GradingConfigurationStatusChanged'
          ? 'GradingConfiguration'
          : 'GradingConfigurationVersion',
    });
  } catch {
    throw new AuditPersistenceError();
  }
}
